/**
 * GET /terms/:termId/snapshot (setup-snapshot.v1) against a real Postgres, using the sample
 * institute: the response passes the contract, matches the demo fixture's shape and counts,
 * agrees with the readiness snapshot, only references rows it contains, honours ?scopeId=,
 * and stays inside the caller's institute.
 */
import type { INestApplication } from '@nestjs/common';
import {
  buildSampleInstitute,
  loadReadinessSnapshot,
  PrismaClient,
  withTenant,
} from '@slotwise/db';
import { SetupSnapshotV1 } from '@slotwise/shared/contracts';
import { demoTermSnapshot } from '@slotwise/shared/fixtures';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, Fixtures, signToken } from './helpers';

let app: INestApplication;
const fx = new Fixtures();
const tokens = new Map<string, string>();
let a: Awaited<ReturnType<Fixtures['institute']>>;
let b: Awaited<ReturnType<Fixtures['institute']>>;
const u = {} as Record<'admin' | 'adminB' | 'teacher' | 'student', { id: string }>;
let termId = '';

function get(path: string, userId = u.admin.id, slug = a.institute.slug) {
  return request(app.getHttpServer())
    .get(path)
    .set('x-institute-slug', slug)
    .set('authorization', `Bearer ${tokens.get(userId)}`);
}

async function snapshot(query = ''): Promise<SetupSnapshotV1> {
  const res = await get(`/terms/${termId}/snapshot${query}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return SetupSnapshotV1.parse(res.body);
}

beforeAll(async () => {
  let env;
  ({ app, env } = await createTestApp());
  a = await fx.institute('snap-a');
  b = await fx.institute('snap-b');
  const summary = await fx.owner.$transaction((tx) => buildSampleInstitute(tx, a.institute.id), {
    timeout: 120_000,
  });
  termId = summary.termId;
  for (const key of ['admin', 'adminB', 'teacher', 'student'] as const) {
    u[key] = await fx.user(`snap-${key}`);
    tokens.set(u[key].id, await signToken(env, u[key].id));
  }
  await fx.grant(u.admin.id, 'institute_admin', a.institute.id, { type: 'institute' });
  await fx.grant(u.adminB.id, 'institute_admin', b.institute.id, { type: 'institute' });
  await fx.grant(u.teacher.id, 'faculty', a.institute.id, { type: 'department', id: a.cse.id });
  await fx.grant(u.student.id, 'student', a.institute.id, { type: 'institute' });
}, 180_000);

afterAll(async () => {
  await app?.close();
  await fx.cleanup();
});

describe('setup snapshot', () => {
  it('follows setup-snapshot.v1 for the whole term', async () => {
    const snap = await snapshot();
    expect(snap).toMatchObject({
      version: 'setup-snapshot.v1',
      instituteId: a.institute.id,
      timezone: 'Asia/Kolkata',
      scope: null,
      term: {
        id: termId,
        label: 'July–Dec 2026',
        kind: 'odd',
        status: 'active',
        minTeachingDays: 90,
      },
    });
  });

  it('has the same kinds of data, and as much of it, as the demo fixture', async () => {
    const snap = await snapshot();
    const fixture = demoTermSnapshot();
    const shape = (s: SetupSnapshotV1) =>
      Object.fromEntries(
        Object.entries(s).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v]),
      );
    expect(shape(snap)).toEqual(shape(fixture));
    const sorted = (xs: string[]) => [...xs].sort();
    expect(sorted(snap.courses.map((c) => c.code))).toEqual(
      sorted(fixture.courses.map((c) => c.code)),
    );
    expect(sorted(snap.rooms.map((r) => r.code))).toEqual(sorted(fixture.rooms.map((r) => r.code)));
    expect(sorted(snap.faculty.map((f) => f.shortCode))).toEqual(
      sorted(fixture.faculty.map((f) => f.shortCode)),
    );
    expect(sorted(snap.cohorts.map((c) => c.displayCode))).toEqual(
      sorted(fixture.cohorts.map((c) => c.displayCode)),
    );
    expect(snap.courses.find((c) => c.code === 'CS201')?.roomNeeds).toEqual(
      fixture.courses.find((c) => c.code === 'CS201')?.roomNeeds,
    );
  });

  it('agrees with the readiness check on cohorts, sections and sub-groups', async () => {
    const snap = await snapshot();
    const appDb = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
    try {
      const ready = await withTenant(appDb, { instituteId: a.institute.id, userId: null }, (tx) =>
        loadReadinessSnapshot(tx, termId),
      );
      const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id).sort();
      expect(ids(snap.cohorts)).toEqual(ids(ready.cohorts));
      expect(ids(snap.sections)).toEqual(ids(ready.sections));
      expect(ids(snap.subGroups)).toEqual(ids(ready.subGroups));
      expect(ids(snap.assignments)).toEqual(ids(ready.assignments));
    } finally {
      await appDb.$disconnect();
    }
  });

  it('only references rows it contains, with periods from the course L-T-P', async () => {
    const snap = await snapshot();
    const has = (xs: { id: string }[]) => new Set(xs.map((x) => x.id));
    const [sections, subGroups, electives, courses, faculty, rooms] = [
      has(snap.sections),
      has(snap.subGroups),
      has(snap.electiveSections),
      has(snap.courses),
      has(snap.faculty),
      has(snap.rooms),
    ];
    const course = new Map(snap.courses.map((c) => [c.id, c]));
    for (const x of snap.assignments) {
      expect(courses.has(x.courseId)).toBe(true);
      const target = x.sectionId ?? x.subGroupId ?? x.electiveSectionId!;
      expect(
        (x.target === 'section' ? sections : x.target === 'subgroup' ? subGroups : electives).has(
          target,
        ),
      ).toBe(true);
      for (const f of x.faculty) expect(faculty.has(f.facultyId)).toBe(true);
      const c = course.get(x.courseId)!;
      const ltp = { lecture: c.lectures, tutorial: c.tutorials, practical: c.practicals }[
        x.component
      ];
      expect(x.periodsPerWeek).toBe(c.isScheduled ? ltp : 0);
    }
    for (const s of snap.sections) {
      if (s.homeRoomId) expect(rooms.has(s.homeRoomId)).toBe(true);
    }
    for (const e of snap.electiveSections) {
      for (const id of e.sourceSectionIds) expect(sections.has(id)).toBe(true);
    }
    expect(snap.bellSchedules.filter((x) => x.isDefault)).toHaveLength(1);
  });

  it('limits everything to a timetable scope with ?scopeId=', async () => {
    const full = await snapshot();
    const pick = full.cohorts.filter(
      (c) => c.displayCode === 'CSE S3' || c.displayCode === 'ECE S3',
    );
    expect(pick).toHaveLength(2);
    const scope = await fx.owner.timetableScope.create({
      data: {
        instituteId: a.institute.id,
        termId,
        name: '2nd year',
        createdById: u.admin.id,
        cohorts: {
          create: pick.map((c) => ({ instituteId: a.institute.id, cohortId: c.id })),
        },
      },
    });
    const snap = await snapshot(`?scopeId=${scope.id}`);
    const cohortIds = pick.map((c) => c.id).sort();
    expect(snap.scope).toEqual({ id: scope.id, name: '2nd year', cohortIds });
    expect(snap.cohorts.map((c) => c.id).sort()).toEqual(cohortIds);
    const sectionIds = new Set(snap.sections.map((s) => s.id));
    expect(snap.sections.every((s) => cohortIds.includes(s.cohortId))).toBe(true);
    expect(snap.sections).toHaveLength(7); // CSE S3: 6, ECE S3: 1
    expect(snap.assignments.length).toBeGreaterThan(0);
    expect(snap.assignments.length).toBeLessThan(full.assignments.length);
    const subGroupIds = new Set(snap.subGroups.map((g) => g.id));
    for (const x of snap.assignments) {
      expect(x.sectionId ? sectionIds.has(x.sectionId) : subGroupIds.has(x.subGroupId!)).toBe(true);
    }
    expect(snap.electiveSections).toEqual([]);
    // Courses are those of the scope cohorts' scheme only (Scheme 2024; Scheme 2022 is sem 7).
    expect(snap.courses.every((c) => c.code !== 'CS401')).toBe(true);
  });

  it('leaves out archived faculty and every reference to them', async () => {
    const before = await snapshot();
    const busy = before.assignments[0]!.faculty[0]!.facultyId;
    await fx.owner.faculty.update({ where: { id: busy }, data: { deletedAt: new Date() } });
    const snap = await snapshot();
    expect(snap.faculty.some((f) => f.id === busy)).toBe(false);
    expect(snap.assignments.some((x) => x.faculty.some((f) => f.facultyId === busy))).toBe(false);
    expect(snap.fixedSlots.some((s) => s.facultyIds.includes(busy))).toBe(false);
    await fx.owner.faculty.update({ where: { id: busy }, data: { deletedAt: null } });
  });
});

describe('setup snapshot: access', () => {
  it('any staff member with master-data access may read it; students may not', async () => {
    expect((await get(`/terms/${termId}/snapshot`, u.teacher.id)).status).toBe(200);
    expect((await get(`/terms/${termId}/snapshot`, u.student.id)).status).toBe(403);
  });

  it("another institute's term is not found, even by id", async () => {
    const res = await get(`/terms/${termId}/snapshot`, u.adminB.id, b.institute.slug);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('We could not find this term.');
    expect((await get(`/terms/${termId}/snapshot`, u.adminB.id)).status).toBe(403);
  });

  it('explains a bad id or a scope from elsewhere', async () => {
    expect((await get('/terms/not-a-uuid/snapshot')).status).toBe(400);
    const unknown = '00000000-0000-4000-8000-000000000000';
    expect((await get(`/terms/${unknown}/snapshot`)).status).toBe(404);
    const res = await get(`/terms/${termId}/snapshot?scopeId=${unknown}`);
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('We could not find this timetable scope in this term.');
  });
});
