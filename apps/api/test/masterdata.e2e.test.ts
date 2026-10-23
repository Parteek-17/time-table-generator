/**
 * Phase 1 master data, end to end against a real Postgres:
 * every write endpoint works and leaves an audit entry; department ownership (hod, service
 * hod), faculty editing only their own availability; ids from another institute are refused;
 * archive/undo, friendly duplicate and validation messages; generate cohorts and promote.
 */
import type { INestApplication } from '@nestjs/common';
import type {
  AvailabilityDto,
  CohortRow,
  CourseRow,
  FacultyRow,
  HolidayPasteResultDto,
  ProgrammeRow,
  PromotePreviewDto,
  SectionRow,
} from '@slotwise/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, Fixtures, signToken } from './helpers';

let app: INestApplication;
const fx = new Fixtures();
const tokens = new Map<string, string>();

let a: Awaited<ReturnType<Fixtures['institute']>>;
let b: Awaited<ReturnType<Fixtures['institute']>>;
let asDept = { id: '' };
const u = {} as Record<
  'admin' | 'adminB' | 'hodCse' | 'hodAs' | 'coord' | 'teacher',
  { id: string }
>;

function as(userId: string, slug = a.institute.slug) {
  const http = request(app.getHttpServer());
  const prep = (req: request.Test) =>
    req.set('x-institute-slug', slug).set('authorization', `Bearer ${tokens.get(userId)}`);
  return {
    get: (path: string) => prep(http.get(path)),
    post: (path: string, body?: object) => prep(http.post(path)).send(body),
    put: (path: string, body?: object) => prep(http.put(path)).send(body),
  };
}

/** Audit rows of institute A (owner connection: sees everything). */
const auditCount = () => fx.owner.auditLog.count({ where: { instituteId: a.institute.id } });

/**
 * Performs a write as the admin, expects success and exactly one new audit entry per
 * created/changed row (`entries`, default 1).
 */
async function write<T>(
  method: 'post' | 'put',
  path: string,
  body?: object,
  entries = 1,
  user = u.admin.id,
): Promise<T> {
  const before = await auditCount();
  const res = await as(user)[method](path, body);
  expect(res.status, `${method.toUpperCase()} ${path}: ${JSON.stringify(res.body)}`).toBeLessThan(
    300,
  );
  expect((await auditCount()) - before, `audit entries for ${path}`).toBe(entries);
  return res.body as T;
}

const ids = {} as Record<string, string>;

beforeAll(async () => {
  let env;
  ({ app, env } = await createTestApp());
  a = await fx.institute('md-a');
  b = await fx.institute('md-b');
  asDept = await fx.owner.department.create({
    data: { instituteId: a.institute.id, code: 'AS', name: 'Applied Sciences', kind: 'service' },
  });
  for (const key of Object.keys({
    admin: 1,
    adminB: 1,
    hodCse: 1,
    hodAs: 1,
    coord: 1,
    teacher: 1,
  }) as (keyof typeof u)[]) {
    u[key] = await fx.user(`md-${key}`);
    tokens.set(u[key].id, await signToken(env, u[key].id));
  }
  await fx.grant(u.admin.id, 'institute_admin', a.institute.id, { type: 'institute' });
  await fx.grant(u.adminB.id, 'institute_admin', b.institute.id, { type: 'institute' });
  await fx.grant(u.hodCse.id, 'hod', a.institute.id, { type: 'department', id: a.cse.id });
  await fx.grant(u.hodAs.id, 'hod', a.institute.id, { type: 'department', id: asDept.id });
  await fx.grant(u.coord.id, 'timetable_coordinator', a.institute.id, {
    type: 'department',
    id: a.cse.id,
  });
  await fx.grant(u.teacher.id, 'faculty', a.institute.id, { type: 'department', id: a.cse.id });
}, 60_000);

afterAll(async () => {
  await app?.close();
  await fx.cleanup();
});

describe('master data: every write works and is audited', () => {
  it('organisation and academic structure', async () => {
    await write('put', '/institute/profile', {
      name: 'Test md-a Institute',
      type: 'college',
      affiliatingUniversityName: 'Test Technical University',
      timezone: 'Asia/Kolkata',
    });
    const btech = await write<ProgrammeRow>('post', '/programmes', {
      code: 'btech',
      name: 'B.Tech',
      level: 'ug',
      totalSemesters: 8,
      lateralEntrySemester: 3,
      departmentId: null,
      hasBranches: true,
    });
    expect(btech.code).toBe('BTECH');
    ids.btech = btech.id;
    const mba = await write<ProgrammeRow>('post', '/programmes', {
      code: 'MBA',
      name: 'MBA',
      level: 'pg',
      totalSemesters: 4,
      departmentId: a.cse.id,
      hasBranches: false,
    });
    expect(mba.branches.map((x) => [x.code, x.isDefault])).toEqual([['GEN', true]]);

    ids.cseBranch = (
      await write<{ id: string }>('post', '/branches', {
        programmeId: btech.id,
        code: 'CSE',
        name: 'Computer Science',
        departmentId: a.cse.id,
      })
    ).id;
    ids.eceBranch = (
      await write<{ id: string }>('post', '/branches', {
        programmeId: btech.id,
        code: 'ECE',
        name: 'Electronics',
        departmentId: a.ece.id,
      })
    ).id;
    ids.scheme = (
      await write<{ id: string }>('post', '/scheme-versions', {
        programmeId: btech.id,
        name: 'Scheme 2024',
        status: 'active',
      })
    ).id;
    const course = await write<CourseRow>('post', '/courses', {
      schemeVersionId: ids.scheme,
      semester: 3,
      code: 'cs201',
      title: 'Data Structures',
      shortName: 'DS',
      lectures: 3,
      tutorials: 0,
      practicals: 2,
      offeringDepartmentId: a.cse.id,
      labCategory: 'Software lab',
      branchIds: [ids.cseBranch],
    });
    expect(course).toMatchObject({ code: 'CS201', credits: 4, branchIds: [ids.cseBranch] });
    ids.course = course.id;
    const edited = await write<CourseRow>('put', `/courses/${course.id}`, {
      ...course,
      creditsOverride: 3.5,
      branchIds: [ids.cseBranch, ids.eceBranch],
    });
    expect(edited.credits).toBe(3.5);
    expect(edited.branchIds).toHaveLength(2);
  });

  it('time and calendar', async () => {
    ids.session = (await write<{ id: string }>('post', '/sessions', { startYear: 2026 })).id;
    ids.term = (
      await write<{ id: string }>('post', '/terms', {
        sessionId: ids.session,
        kind: 'odd',
        label: 'July–Dec 2026',
        startDate: '2026-07-27',
        endDate: '2026-12-31',
        status: 'active',
      })
    ).id;
    await write('post', '/term-cohort-windows', {
      termId: ids.term,
      programmeId: ids.btech,
      semesters: [3, 5, 7],
      teachingStart: '2026-07-27',
      endSemExamStart: '2026-12-14',
    });
    await write('post', '/calendar-windows', {
      termId: ids.term,
      type: 'mid_sem_exam',
      label: 'Mid-semester test 1',
      startDate: '2026-09-16',
      endDate: '2026-09-18',
    });
    await write('post', '/holidays', {
      name: 'Gandhi Jayanti',
      startDate: '2026-10-02',
      endDate: '2026-10-02',
    });
    const paste = await write<HolidayPasteResultDto>(
      'post',
      '/holidays/paste',
      { text: '2026-10-20, Dussehra\n2026-11-09 to 2026-11-10, Diwali break\nnot a date, Oops' },
      2,
    );
    expect(paste.created).toBe(2);
    expect(paste.errors).toEqual([
      expect.objectContaining({ line: 3, message: expect.stringContaining('not a date') }),
    ]);
    await write('post', '/extra-working-days', {
      termId: ids.term,
      date: '2026-08-22',
      followsWeekday: 1,
      scopeType: 'programme',
      programmeId: ids.btech,
    });
    const periods = [1, 2, 3, 4].map((i) => ({
      index: i,
      label: `P${i}`,
      startMinute: 510 + (i - 1) * 60 + (i > 2 ? 60 : 0),
      endMinute: 570 + (i - 1) * 60 + (i > 2 ? 60 : 0),
    }));
    ids.bell = (
      await write<{ id: string }>('post', '/bell-schedules', {
        name: 'Main',
        workingDays: [1, 2, 3, 4, 5],
        isDefault: true,
        periods,
        breaks: [{ label: 'Lunch', afterPeriodIndex: 2, minutes: 60 }],
      })
    ).id;
  });

  it('people, groups and rooms', async () => {
    ids.batch = (
      await write<{ id: string }>('post', '/batches', {
        programmeId: ids.btech,
        branchId: ids.cseBranch,
        admissionYear: 2025,
        schemeVersionId: ids.scheme,
      })
    ).id;
    await write('post', '/batches', {
      programmeId: ids.btech,
      branchId: ids.cseBranch,
      admissionYear: 2026,
      entryType: 'lateral',
      schemeVersionId: ids.scheme,
    });
    // Generate: the 2025 batch is in semester 3; the LEET batch sits in its sections.
    const generated = await write<{ created: number }>(
      'post',
      `/terms/${ids.term}/cohorts/generate`,
      undefined,
      2,
    );
    expect(generated.created).toBe(2);
    const cohorts = (await as(u.admin.id).get(`/cohorts?termId=${ids.term}`)).body as CohortRow[];
    const regular = cohorts.find((c) => c.entryType === 'regular')!;
    const leet = cohorts.find((c) => c.entryType === 'lateral')!;
    expect(regular).toMatchObject({ semester: 3, displayCode: 'CSE S3' });
    expect(leet).toMatchObject({ semester: 3, joinsCohortId: regular.id });
    ids.cohort = regular.id;

    await write('put', `/cohorts/${regular.id}`, {
      semester: 3,
      isRunning: true,
      displayCode: 'D2 CSE',
      joinsCohortId: null,
    });
    const sections = await write<SectionRow[]>(
      'post',
      `/cohorts/${regular.id}/sections`,
      { count: 2, strength: 61, subGroupsPerSection: 2, prefix: 'CS' },
      2,
    );
    expect(sections.map((s) => [s.displayName, s.subGroups.map((g) => g.strength)])).toEqual([
      ['CS A', [31, 30]],
      ['CS B', [31, 30]],
    ]);
    ids.sectionA = sections[0]!.id;
    const updated = await write<SectionRow>('put', `/sections/${ids.sectionA}`, {
      cohortId: regular.id,
      name: 'A',
      displayName: 'CS A',
      strength: 60,
      subGroups: [
        { name: 'A1', strength: 20 },
        { name: 'A2', strength: 20 },
        { name: 'A3', strength: 20 },
      ],
    });
    expect(updated.subGroups.map((g) => g.name)).toEqual(['A1', 'A2', 'A3']);

    await write('post', '/elective-sections', {
      termId: ids.term,
      courseId: ids.course,
      name: 'DS-1',
      strength: 40,
      sourceSectionIds: sections.map((s) => s.id),
    });
    await write('post', '/students', {
      batchId: ids.batch,
      classRollNo: '2512345',
      name: 'Test Student',
      sectionId: ids.sectionA,
    });
    ids.building = (
      await write<{ id: string }>('post', '/buildings', { name: 'Main Block', floors: 2 })
    ).id;
    ids.room = (
      await write<{ id: string; classCapacity: number }>('post', '/rooms', {
        code: 'g11',
        buildingId: ids.building,
        type: 'lecture',
        rows: 12,
        seatsPerRow: 6,
      })
    ).id;
  });

  it('faculty, availability and bulk load limits', async () => {
    const make = (code: string, short: string, dept: string, userId?: string) =>
      write<FacultyRow>('post', '/faculty', {
        employeeCode: code,
        name: `Test ${short}`,
        shortCode: short,
        designation: 'assistant_professor',
        experience: 'fresher',
        homeDepartmentId: dept,
        departmentIds: [],
        maxPeriodsPerDay: 5,
        maxPeriodsPerWeek: 18,
      }).then(async (f) => {
        if (userId) await fx.owner.faculty.update({ where: { id: f.id }, data: { userId } });
        return f;
      });
    ids.fCse = (await make('T1', 'tc', a.cse.id, u.teacher.id)).id;
    ids.fCse2 = (await make('T2', 'TD', a.cse.id)).id;
    ids.fAs = (await make('T3', 'TA', asDept.id)).id;
    ids.fEce = (await make('T4', 'TE', a.ece.id)).id;

    const avail = await write<AvailabilityDto>('put', `/faculty/${ids.fCse2}/availability`, {
      unavailable: [
        { weekday: 3, periodIndex: 4 },
        { weekday: 3, periodIndex: 4 },
      ],
    });
    expect(avail.unavailable).toEqual([{ weekday: 3, periodIndex: 4 }]);
    expect(avail.periods).toHaveLength(4);

    await write(
      'post',
      '/faculty/bulk-load',
      { facultyIds: [ids.fCse, ids.fCse2], maxPeriodsPerWeek: 16 },
      2,
    );
    const list = (await as(u.admin.id).get(`/faculty?departmentId=${a.cse.id}`))
      .body as FacultyRow[];
    // Sorted here: the database orders names by its collation, which differs between setups.
    const limits = list.map((f) => [f.shortCode, f.maxPeriodsPerWeek]).sort();
    expect(limits).toEqual([
      ['TC', 16],
      ['TD', 16],
    ]);
  });

  it('archive is undoable and audited', async () => {
    await write('post', `/rooms/${ids.room}/archive`);
    expect(((await as(u.admin.id).get('/rooms')).body as unknown[]).length).toBe(0);
    expect(((await as(u.admin.id).get('/rooms?includeArchived=1')).body as unknown[]).length).toBe(
      1,
    );
    await write('post', `/rooms/${ids.room}/restore`);
    expect(((await as(u.admin.id).get('/rooms')).body as unknown[]).length).toBe(1);
  });
});

describe('permissions', () => {
  const cseBatch = () => ({
    programmeId: ids.btech,
    branchId: ids.cseBranch,
    admissionYear: 2024,
    schemeVersionId: ids.scheme,
  });

  it('a hod edits their own department', async () => {
    await write('post', '/batches', cseBatch(), 1, u.hodCse.id);
    await write('put', `/faculty/${ids.fCse2}/availability`, { unavailable: [] }, 1, u.hodCse.id);
  });

  it("a hod cannot edit another department's data", async () => {
    const hod = as(u.hodCse.id);
    const before = await auditCount();
    const ece = await hod.post('/batches', { ...cseBatch(), branchId: ids.eceBranch });
    expect(ece.status).toBe(403);
    const faculty = (await hod.get(`/faculty/${ids.fEce}`)).body as FacultyRow;
    expect(
      (await hod.put(`/faculty/${ids.fEce}`, { ...faculty, maxPeriodsPerWeek: 10 })).status,
    ).toBe(403);
    expect((await hod.put(`/faculty/${ids.fEce}/availability`, { unavailable: [] })).status).toBe(
      403,
    );
    expect(
      (
        await hod.post('/faculty/bulk-load', {
          facultyIds: [ids.fCse, ids.fEce],
          maxPeriodsPerDay: 3,
        })
      ).status,
    ).toBe(403);
    // Moving their own faculty member into another department needs rights there too.
    const own = (await hod.get(`/faculty/${ids.fCse2}`)).body as FacultyRow;
    expect(
      (await hod.put(`/faculty/${ids.fCse2}`, { ...own, homeDepartmentId: a.ece.id })).status,
    ).toBe(403);
    expect(await auditCount()).toBe(before);
  });

  it('a hod cannot edit institute-owned data', async () => {
    const hod = as(u.hodCse.id);
    expect(
      (await hod.post('/rooms', { code: 'X1', buildingId: ids.building, type: 'lecture' })).status,
    ).toBe(403);
    expect((await hod.post('/sessions', { startYear: 2027 })).status).toBe(403);
    const programme = (await hod.get(`/programmes/${ids.btech}`)).body as ProgrammeRow;
    expect(
      (await hod.put(`/programmes/${ids.btech}`, { ...programme, name: 'Changed' })).status,
    ).toBe(403);
  });

  it('a service-department hod edits only their own faculty', async () => {
    const hod = as(u.hodAs.id);
    const mine = (await hod.get(`/faculty/${ids.fAs}`)).body as FacultyRow;
    expect((await hod.put(`/faculty/${ids.fAs}`, { ...mine, maxPeriodsPerWeek: 14 })).status).toBe(
      200,
    );
    const cse = (await hod.get(`/faculty/${ids.fCse}`)).body as FacultyRow;
    expect((await hod.put(`/faculty/${ids.fCse}`, { ...cse, maxPeriodsPerWeek: 14 })).status).toBe(
      403,
    );
    // They can read every department's data (to see the cohorts they teach).
    expect((await hod.get(`/cohorts?termId=${ids.term}`)).status).toBe(200);
  });

  it('a faculty member edits only their own availability', async () => {
    const teacher = as(u.teacher.id);
    expect((await teacher.get('/me/faculty')).body).toEqual({ facultyId: ids.fCse });
    const own = await teacher.put(`/faculty/${ids.fCse}/availability`, {
      unavailable: [{ weekday: 1, periodIndex: 1 }],
    });
    expect(own.status).toBe(200);
    const other = await teacher.put(`/faculty/${ids.fCse2}/availability`, { unavailable: [] });
    expect(other.status).toBe(403);
    expect(other.body.message).toBe('You can change only your own availability.');
    const profile = (await teacher.get(`/faculty/${ids.fCse}`)).body as FacultyRow;
    expect(
      (await teacher.put(`/faculty/${ids.fCse}`, { ...profile, maxPeriodsPerWeek: 2 })).status,
    ).toBe(403);
  });

  it('a timetable coordinator does not edit master data', async () => {
    const coord = as(u.coord.id);
    expect((await coord.post('/batches', cseBatch())).status).toBe(403);
    expect((await coord.get('/rooms')).status).toBe(200);
  });
});

describe('tenancy and validation', () => {
  it('ids from another institute are refused, and its rows are invisible', async () => {
    const bBuilding = await fx.owner.building.create({
      data: { instituteId: b.institute.id, name: 'B Block' },
    });
    const res = await as(u.admin.id).post('/rooms', {
      code: 'EVIL',
      buildingId: bBuilding.id,
      type: 'lecture',
    });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toEqual({ buildingId: ['Choose a building.'] });
    expect((await as(u.admin.id).get(`/buildings/${bBuilding.id}`)).status).toBe(404);
    expect((await as(u.adminB.id, b.institute.slug).get('/buildings')).body).toHaveLength(1);
    expect((await as(u.adminB.id, b.institute.slug).get('/rooms')).body).toEqual([]);
    expect((await as(u.adminB.id).get('/rooms')).status).toBe(403);
  });

  it('explains bad input field by field', async () => {
    const res = await as(u.admin.id).post('/programmes', {
      code: '',
      name: 'X',
      level: 'ug',
      totalSemesters: 4,
      lateralEntrySemester: 6,
      hasBranches: false,
    });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toMatchObject({
      code: ['Enter a code.'],
      lateralEntrySemester: ['Lateral entry must be in semester 4 or earlier.'],
      departmentId: ['Choose the department that runs this programme.'],
    });
  });

  it('duplicates get a plain message', async () => {
    const res = await as(u.admin.id).post('/rooms', {
      code: 'G11',
      buildingId: ids.building,
      type: 'lecture',
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('A room with this code already exists.');
    const term = await as(u.admin.id).post('/terms', {
      sessionId: ids.session,
      kind: 'even',
      label: 'Jan–June 2027',
      startDate: '2027-01-04',
      endDate: '2027-06-30',
      status: 'active',
    });
    expect(term.status).toBe(409);
    expect(term.body.message).toContain('Another term is already active');
  });
});

describe('promote batches', () => {
  it('needs the term closed, previews, then moves every cohort up one semester', async () => {
    const even = await write<{ id: string }>('post', '/terms', {
      sessionId: ids.session,
      kind: 'even',
      label: 'Jan–June 2027',
      startDate: '2027-01-04',
      endDate: '2027-06-30',
    });
    const notClosed = await as(u.admin.id).get(`/terms/${ids.term}/promote?toTermId=${even.id}`);
    expect(notClosed.status).toBe(400);
    expect(notClosed.body.message).toBe('Close July–Dec 2026 first, then promote its batches.');

    const term = (await as(u.admin.id).get(`/terms/${ids.term}`)).body as Record<string, unknown>;
    await write('put', `/terms/${ids.term}`, { ...term, status: 'closed' });

    const preview = (await as(u.admin.id).get(`/terms/${ids.term}/promote?toTermId=${even.id}`))
      .body as PromotePreviewDto;
    const regular = preview.rows.find((r) => r.fromCohortId === ids.cohort)!;
    expect(regular).toMatchObject({
      fromSemester: 3,
      toSemester: 4,
      action: 'promote',
      toDisplayCode: 'D2 CSE',
    });
    expect(regular.sections.map((s) => s.subGroups.length)).toEqual([3, 2]);
    expect(preview.rows.find((r) => r.joinsBatchId)).toMatchObject({
      toDisplayCode: 'CSE S4 LEET',
      sections: [],
    });

    // 2 cohorts created (+ summary entry).
    const result = await write<{ created: number }>(
      'post',
      `/terms/${ids.term}/promote`,
      { toTermId: even.id },
      3,
    );
    expect(result.created).toBe(2);
    const next = (await as(u.admin.id).get(`/cohorts?termId=${even.id}`)).body as CohortRow[];
    const promoted = next.find((c) => c.entryType === 'regular')!;
    expect(promoted).toMatchObject({ semester: 4, sectionCount: 2, strength: 121 });
    expect(next.find((c) => c.entryType === 'lateral')?.joinsCohortId).toBe(promoted.id);

    // Running it again is safe.
    const again = await as(u.admin.id).post(`/terms/${ids.term}/promote`, { toTermId: even.id });
    expect(again.body).toMatchObject({ created: 0, skipped: 2 });
  });
});
