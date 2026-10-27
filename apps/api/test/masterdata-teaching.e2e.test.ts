/**
 * Milestone 1e against a real Postgres, using the sample institute: the readiness check
 * finds exactly the planned gaps, the teaching grid (cells, load badges, subject mentors)
 * with the cross-department permission rules, fixed slots, timetable scopes, and
 * `term.activated` when a term becomes the active one.
 */
import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { buildSampleInstitute } from '@slotwise/db';
import type {
  FixedSlotRow,
  ReadinessDto,
  TeachingCohortDto,
  TeachingGridDto,
  TimetableScopeRow,
} from '@slotwise/shared';
import type { EventPayloadV1 } from '@slotwise/shared/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, Fixtures, signToken } from './helpers';

let app: INestApplication;
const fx = new Fixtures();
const tokens = new Map<string, string>();
let a: Awaited<ReturnType<Fixtures['institute']>>;
type Who = 'admin' | 'coordinator' | 'hodEce' | 'hodAs' | 'teacher';
const u = {} as Record<Who, { id: string }>;
let termId = '';
const cohortIds = {} as Record<'ece3' | 'cse3' | 'mba1', string>;

function as(who: Who) {
  const http = request(app.getHttpServer());
  const prep = (req: request.Test) =>
    req
      .set('x-institute-slug', a.institute.slug)
      .set('authorization', `Bearer ${tokens.get(u[who].id)}`);
  return {
    get: (path: string) => prep(http.get(path)),
    put: (path: string, body?: object) => prep(http.put(path)).send(body),
    post: (path: string, body?: object) => prep(http.post(path)).send(body),
  };
}

const auditCount = (action: string) =>
  fx.owner.auditLog.count({ where: { instituteId: a.institute.id, action } });

async function grid(cohortId: string, who: Who = 'admin'): Promise<TeachingGridDto> {
  const res = await as(who).get(`/teaching/${cohortId}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as TeachingGridDto;
}

async function check(query = ''): Promise<ReadinessDto> {
  const res = await as('admin').get(`/terms/${termId}/readiness${query}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body as ReadinessDto;
}

beforeAll(async () => {
  let env;
  ({ app, env } = await createTestApp());
  a = await fx.institute('teach');
  const summary = await fx.owner.$transaction((tx) => buildSampleInstitute(tx, a.institute.id), {
    timeout: 120_000,
  });
  termId = summary.termId;
  const dept = (code: string) =>
    fx.owner.department.findFirstOrThrow({ where: { instituteId: a.institute.id, code } });
  const [ece, as_] = await Promise.all([dept('ECE'), dept('AS')]);
  const cohort = (displayCode: string) =>
    fx.owner.cohort.findFirstOrThrow({ where: { termId, displayCode } });
  cohortIds.ece3 = (await cohort('ECE S3')).id;
  cohortIds.cse3 = (await cohort('CSE S3')).id;
  cohortIds.mba1 = (await cohort('MBA S1')).id;

  for (const key of ['admin', 'coordinator', 'hodEce', 'hodAs', 'teacher'] as const) {
    u[key] = await fx.user(`teach-${key}`);
    tokens.set(u[key].id, await signToken(env, u[key].id));
  }
  const id = a.institute.id;
  await fx.grant(u.admin.id, 'institute_admin', id, { type: 'institute' });
  await fx.grant(u.coordinator.id, 'timetable_coordinator', id, { type: 'institute' });
  await fx.grant(u.hodEce.id, 'hod', id, { type: 'department', id: ece.id });
  await fx.grant(u.hodAs.id, 'hod', id, { type: 'department', id: as_.id });
  await fx.grant(u.teacher.id, 'faculty', id, { type: 'department', id: ece.id });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await fx.cleanup();
});

describe('readiness', () => {
  it('finds exactly the planned gaps of the sample, each with a screen that fixes it', async () => {
    const result = await check();
    expect(result.term).toEqual({ id: termId, label: 'July–Dec 2026' });
    expect(result.issues.map((i) => [i.severity, i.code])).toEqual([
      ['error', 'cohort_without_sections'],
      ['error', 'subgroups_dont_add_up'],
      ['error', 'missing_assignment'],
      ['error', 'faculty_overloaded'],
      ['error', 'no_room_of_type'],
      ['warning', 'teaching_days_short'],
      ['warning', 'teaching_days_short'],
    ]);
    expect(result).toMatchObject({ ready: false, errorCount: 5, warningCount: 2 });
    expect(result.byCategory.assignments).toEqual({ errors: 1, warnings: 0 });
    expect(result.issues.find((i) => i.code === 'missing_assignment')?.fix).toEqual({
      screen: 'teaching',
      id: cohortIds.ece3,
    });
  });

  it('is for admins, hods and coordinators, not teachers', async () => {
    expect((await as('hodEce').get(`/terms/${termId}/readiness`)).status).toBe(200);
    expect((await as('coordinator').get(`/terms/${termId}/readiness`)).status).toBe(200);
    expect((await as('teacher').get(`/terms/${termId}/readiness`)).status).toBe(403);
  });
});

describe('teaching grid', () => {
  it('lists running cohorts with the cells that still need a teacher', async () => {
    const res = await as('admin').get(`/teaching?termId=${termId}`);
    expect(res.status).toBe(200);
    const rows = res.body as TeachingCohortDto[];
    const byCode = new Map(rows.map((r) => [r.displayCode, r]));
    expect(byCode.get('ECE S3')).toMatchObject({ missing: 1 });
    expect(byCode.get('CSE S3')).toMatchObject({ missing: 0 });
    expect(byCode.get('MBA S1')).toMatchObject({ sections: 0, cells: 0 });
    expect(byCode.get('CSE S3 LEET')?.joinsDisplayCode).toBe('CSE S3');
  });

  it('shows course parts × sections with load badges across departments', async () => {
    const g = await grid(cohortIds.ece3);
    expect(g.cohort.displayCode).toBe('ECE S3');
    const tutorial = g.rows.find((r) => r.courseCode === 'EC201' && r.component === 'tutorial');
    expect(tutorial?.cells.map((c) => [c.targetName, c.facultyId])).toEqual([['EC A', null]]);
    expect(g.missing).toBe(1);
    const mi = g.faculty.find((f) => f.shortCode === 'MI');
    expect(mi).toMatchObject({ departmentCode: 'AS', assigned: 15, max: 14, status: 'over' });
    expect(g.mentors.length).toBeGreaterThan(0);
  });

  it('the cohort’s hod fills a cell; the readiness issue goes away', async () => {
    const g = await grid(cohortIds.ece3);
    const teacher = g.faculty.find((f) => f.departmentCode === 'ECE')!;
    const cell = g.rows.find((r) => r.courseCode === 'EC201' && r.component === 'tutorial')!;
    const before = await auditCount('teaching_assignment.created');
    const res = await as('hodEce').put(`/teaching/${cohortIds.ece3}/cells`, {
      courseId: cell.courseId,
      component: 'tutorial',
      target: cell.cells[0]!.target,
      targetId: cell.cells[0]!.targetId,
      facultyId: teacher.id,
      coTeacherIds: [],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const after = res.body as TeachingGridDto;
    expect(after.missing).toBe(0);
    expect(after.faculty.find((f) => f.id === teacher.id)!.assigned).toBe(
      teacher.assigned + cell.periods,
    );
    expect((await auditCount('teaching_assignment.created')) - before).toBe(1);
    expect((await check()).issues.some((i) => i.code === 'missing_assignment')).toBe(false);
  });

  it('a service-department hod may only put on and take off their own teachers', async () => {
    const g = await grid(cohortIds.ece3);
    const asTeacher = g.faculty.find((f) => f.departmentCode === 'AS' && f.status !== 'over')!;
    const eceTeacher = g.faculty.find((f) => f.departmentCode === 'ECE')!;
    const tutorial = g.rows.find((r) => r.courseCode === 'EC201' && r.component === 'tutorial')!;
    const body = (facultyId: string | null) => ({
      courseId: tutorial.courseId,
      component: 'tutorial',
      target: tutorial.cells[0]!.target,
      targetId: tutorial.cells[0]!.targetId,
      facultyId,
      coTeacherIds: [],
    });
    const path = `/teaching/${cohortIds.ece3}/cells`;
    // The cell has an ECE teacher now: the AS hod may not replace them…
    expect((await as('hodAs').put(path, body(asTeacher.id))).status).toBe(403);
    // …nor put an ECE teacher anywhere. Once the cell is empty, an AS teacher is fine.
    await as('hodEce').put(path, body(null)).expect(200);
    expect((await as('hodAs').put(path, body(eceTeacher.id))).status).toBe(403);
    expect((await as('hodAs').put(path, body(asTeacher.id))).status).toBe(200);
    // Teachers never edit the grid.
    expect((await as('teacher').put(path, body(null))).status).toBe(403);
  });

  it('clearing a cell archives the assignment and the cell needs a teacher again', async () => {
    const g = await grid(cohortIds.ece3);
    const tutorial = g.rows.find((r) => r.courseCode === 'EC201' && r.component === 'tutorial')!;
    const before = await auditCount('teaching_assignment.archived');
    const res = await as('admin').put(`/teaching/${cohortIds.ece3}/cells`, {
      courseId: tutorial.courseId,
      component: 'tutorial',
      target: tutorial.cells[0]!.target,
      targetId: tutorial.cells[0]!.targetId,
      facultyId: null,
      coTeacherIds: [],
    });
    expect(res.status).toBe(200);
    expect((res.body as TeachingGridDto).missing).toBe(1);
    expect((await auditCount('teaching_assignment.archived')) - before).toBe(1);
  });

  it('refuses cells that are not in the cohort’s grid', async () => {
    const other = await grid(cohortIds.cse3);
    const row = other.rows[0]!;
    const res = await as('admin').put(`/teaching/${cohortIds.ece3}/cells`, {
      courseId: row.courseId,
      component: row.component,
      target: row.cells[0]!.target,
      targetId: row.cells[0]!.targetId,
      facultyId: null,
      coTeacherIds: [],
    });
    expect(res.status).toBe(400);
  });

  it('sets, changes and clears a subject mentor', async () => {
    const g = await grid(cohortIds.ece3);
    const [first, second] = g.faculty.filter((f) => f.departmentCode === 'ECE');
    const courseId = g.mentors[0]!.courseId;
    const path = `/teaching/${cohortIds.ece3}/mentors`;
    const mentorOf = (x: TeachingGridDto) => x.mentors.find((m) => m.courseId === courseId)!;
    let res = await as('hodEce').put(path, { courseId, facultyId: first!.id });
    expect(mentorOf(res.body as TeachingGridDto).facultyId).toBe(first!.id);
    res = await as('hodEce').put(path, { courseId, facultyId: second!.id });
    expect(mentorOf(res.body as TeachingGridDto).facultyId).toBe(second!.id);
    res = await as('hodEce').put(path, { courseId, facultyId: null });
    expect(mentorOf(res.body as TeachingGridDto).facultyId).toBeNull();
    res = await as('hodEce').put(path, { courseId, facultyId: first!.id });
    expect(mentorOf(res.body as TeachingGridDto).facultyId).toBe(first!.id);
    expect(await auditCount('subject_mentor.updated')).toBe(1);
  });
});

describe('fixed slots', () => {
  it('coordinators keep periods free; days and periods follow the bell schedule', async () => {
    const g = await grid(cohortIds.ece3);
    const mentor = g.faculty.find((f) => f.departmentCode === 'ECE')!;
    const body = {
      termId,
      kind: 'mentoring',
      label: 'Mentoring hour',
      weekday: 3,
      startPeriodIndex: 8,
      endPeriodIndex: 8,
      facultyIds: [mentor.id],
      scopeType: 'cohort',
      cohortId: cohortIds.ece3,
    };
    const created = await as('coordinator').post('/fixed-slots', body);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body as FixedSlotRow).toMatchObject({
      facultyIds: [mentor.id],
      cohortId: cohortIds.ece3,
      departmentId: null,
    });
    expect((await as('coordinator').post('/fixed-slots', { ...body, weekday: 7 })).status).toBe(
      400,
    );
    const late = await as('coordinator').post('/fixed-slots', { ...body, endPeriodIndex: 16 });
    expect(late.status).toBe(400);
    expect(late.body.fieldErrors.endPeriodIndex[0]).toMatch(/periods a day/);
    expect((await as('hodEce').post('/fixed-slots', body)).status).toBe(403);
    const list = await as('admin').get(`/fixed-slots?termId=${termId}`);
    expect((list.body as FixedSlotRow[]).some((s) => s.label === 'Mentoring hour')).toBe(true);
  });
});

describe('timetable scope', () => {
  it('saves which cohorts a timetable covers, and readiness can check just those', async () => {
    const res = await as('coordinator').post('/timetable-scopes', {
      termId,
      name: 'ECE only',
      notes: 'First run',
      cohortIds: [cohortIds.ece3],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const scope = res.body as TimetableScopeRow;
    expect(scope).toMatchObject({ name: 'ECE only', cohortIds: [cohortIds.ece3] });
    const result = await check(`?scopeId=${scope.id}`);
    expect(result.scope).toEqual({ id: scope.id, name: 'ECE only' });
    expect(result.issues.some((i) => i.code === 'cohort_without_sections')).toBe(false);
    expect(result.issues.some((i) => i.code === 'missing_assignment')).toBe(true);
  });

  it('needs at least one running cohort of the same term', async () => {
    const empty = await as('coordinator').post('/timetable-scopes', {
      termId,
      name: 'Empty',
      cohortIds: [],
    });
    expect(empty.status).toBe(400);
    const wrong = await as('coordinator').post('/timetable-scopes', {
      termId,
      name: 'Wrong',
      cohortIds: [termId],
    });
    expect(wrong.status).toBe(400);
  });
});

describe('term.activated', () => {
  it('activating a term closes the previous one and tells the other streams', async () => {
    const received: EventPayloadV1<'term.activated'>[] = [];
    const listener = (p: EventPayloadV1<'term.activated'>) => received.push(p);
    const events = app.get(EventEmitter2);
    events.on('term.activated', listener);
    try {
      const sample = await fx.owner.term.findUniqueOrThrow({ where: { id: termId } });
      const next = await as('admin').post('/terms', {
        sessionId: sample.sessionId,
        kind: 'even',
        label: 'Jan–May 2027',
        startDate: '2027-01-04',
        endDate: '2027-05-31',
        status: 'planning',
      });
      expect(next.status, JSON.stringify(next.body)).toBe(201);
      expect(received).toHaveLength(0);
      expect((await as('hodEce').post(`/terms/${next.body.id}/activate`)).status).toBe(403);

      const res = await as('admin').post(`/terms/${next.body.id}/activate`);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toMatchObject({ id: next.body.id, status: 'active' });
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        instituteId: a.institute.id,
        actorUserId: u.admin.id,
        termId: next.body.id,
        previousTermId: termId,
      });
      const old = await fx.owner.term.findUniqueOrThrow({ where: { id: termId } });
      expect(old.status).toBe('closed');

      // Activating the active term again changes nothing and sends nothing.
      await as('admin').post(`/terms/${next.body.id}/activate`).expect(200);
      expect(received).toHaveLength(1);
    } finally {
      events.off('term.activated', listener);
    }
  });
});
