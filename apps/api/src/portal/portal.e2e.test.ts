/**
 * Portal "Today" and week end to end: a student (matched by email) and a teacher (linked
 * login) read their own published week through P2T's timetable-read.v1 over real HTTP, with
 * holidays from the calendar; anyone else gets a plain "not linked" answer.
 *
 * Needs P2T's timetable tables (migrated on main since 20261027000000_p2t_timetable).
 */
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Prisma } from '@slotwise/db';
import { TodayV1 } from '@slotwise/shared/contracts';
import { demoPublishedTimetable, demoTermSnapshot } from '@slotwise/shared/fixtures';
import { PortalWeekV1 } from '@slotwise/shared/portal';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeMail, Fixtures, signToken } from '../../test/helpers';
import { AppModule } from '../app.module';
import { loadEnv } from '../config/env';
import { MailService } from '../mail/mail.service';
import { portalMasterData } from './portal.test-data';
import { PORTAL_API_BASE } from './timetable.client';

const fx = new Fixtures();
const snapshot = demoTermSnapshot();
const fixture = demoPublishedTimetable();
const fixtureSection = fixture.slots
  .map((s) => s.sectionIds)
  .reduce((acc, ids) => acc.filter((id) => ids.includes(id)))[0]!;
const fixtureTeacher = fixture.slots[0]!.faculty[0]!;
/** A Monday inside the fixture's term. */
const MONDAY = '2026-08-10';
const TUESDAY = '2026-08-11';

let app: INestApplication;
let a: Awaited<ReturnType<Fixtures['institute']>>;
const tokens = new Map<string, string>();
const u = {} as Record<'student' | 'teacher' | 'admin' | 'stranger', { id: string; email: string }>;
let sectionId: string;
let studentId: string;
let facultyId: string;

/** Real HTTP server so the portal's call to timetable-read.v1 goes through the network. */
async function startApp(): Promise<INestApplication> {
  const env = loadEnv({ ...process.env, NODE_ENV: 'test' });
  let base = '';
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] })
    .overrideProvider(MailService)
    .useValue(new FakeMail())
    .overrideProvider(PORTAL_API_BASE)
    .useValue(() => base)
    .compile();
  const nest = moduleRef.createNestApplication({ logger: false });
  await nest.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(nest.getHttpServer().address() as AddressInfo).port}`;
  for (const user of Object.values(u)) tokens.set(user.id, await signToken(env, user.id));
  return nest;
}

const get = (path: string, user: { id: string } = u.student) =>
  request(app.getHttpServer())
    .get(path)
    .set('x-institute-slug', a.institute.slug)
    .set('authorization', `Bearer ${tokens.get(user.id)}`);

/** The fixture's published week, re-pointed at this test's section and teacher. */
async function publish(instituteId: string, termId: string, createdById: string) {
  const snap = await fx.owner.timetableSnapshot.create({
    data: { instituteId, termId, hash: `p5-${instituteId}`, data: {} },
  });
  const version = await fx.owner.timetableVersion.create({
    data: { instituteId, termId, snapshotId: snap.id, cohortIds: [], createdById },
  });
  const swapSection = (id: string) => (id === fixtureSection ? sectionId : id);
  await fx.owner.timetableSlot.createMany({
    data: fixture.slots.map((s, i) => ({
      instituteId,
      versionId: version.id,
      sessionId: `s${i}`,
      assignmentId: s.assignmentId,
      component: s.component,
      courseId: s.course.id,
      courseCode: s.course.code,
      courseShortName: s.course.shortName,
      courseTitle: s.course.title,
      targetKind: s.target.kind,
      targetId: swapSection(s.target.id),
      targetName: s.target.name,
      sectionIds: s.sectionIds.map(swapSection),
      facultyIds: s.faculty.map((f) => (f.id === fixtureTeacher.id ? facultyId : f.id)),
      faculty: s.faculty.map((f) =>
        f.id === fixtureTeacher.id ? { ...f, id: facultyId } : f,
      ) as unknown as Prisma.InputJsonValue,
      roomId: s.room?.id ?? null,
      roomCode: s.room?.code ?? null,
      weekday: s.weekday,
      startPeriod: s.startPeriodIndex,
      length: s.length,
      startMinute: s.startMinute,
      endMinute: s.endMinute,
    })),
  });
  await fx.owner.timetableVersion.update({
    where: { id: version.id },
    data: {
      status: 'published',
      number: 1,
      publishedAt: new Date(),
      validFrom: new Date(`${snapshot.term.startDate}T00:00:00Z`),
    },
  });
}

describe('portal Today and week', () => {
  beforeAll(async () => {
    a = await fx.institute('p5');
    u.student = await fx.user('p5-student');
    u.teacher = await fx.user('p5-teacher');
    u.admin = await fx.user('p5-admin');
    u.stranger = await fx.user('p5-stranger');
    const md = await portalMasterData(fx, a.institute.id, a.cse.id);
    sectionId = md.section.id;
    const student = await fx.owner.student.create({
      data: {
        instituteId: a.institute.id,
        batchId: md.batch.id,
        classRollNo: 'P5001',
        name: 'Test Student',
        // Matched case-insensitively against the sign-in email.
        email: u.student.email.toUpperCase(),
        sectionId,
      },
    });
    studentId = student.id;
    const faculty = await fx.owner.faculty.create({
      data: {
        instituteId: a.institute.id,
        employeeCode: 'E1',
        name: 'Test Teacher',
        shortCode: 'TT',
        designation: 'assistant_professor',
        experience: 'experienced',
        homeDepartmentId: a.cse.id,
        maxPeriodsPerDay: 5,
        maxPeriodsPerWeek: 20,
        userId: u.teacher.id,
      },
    });
    facultyId = faculty.id;
    await fx.owner.holiday.create({
      data: {
        instituteId: a.institute.id,
        name: 'Section trip',
        startDate: new Date(`${TUESDAY}T00:00:00Z`),
        endDate: new Date(`${TUESDAY}T00:00:00Z`),
        scopeType: 'section',
        sectionId,
      },
    });
    await publish(a.institute.id, md.term.id, u.admin.id);
    await fx.grant(u.student.id, 'student', a.institute.id, { type: 'institute' });
    await fx.grant(u.teacher.id, 'faculty', a.institute.id, { type: 'department', id: a.cse.id });
    await fx.grant(u.admin.id, 'institute_admin', a.institute.id, { type: 'institute' });
    app = await startApp();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await fx.cleanup();
  });

  it('gives a student their own Monday from the published timetable', async () => {
    const res = await get(`/portal/today?date=${MONDAY}`);
    expect(res.status).toBe(200);
    const today = TodayV1.parse(res.body);
    expect(today.viewer).toMatchObject({ role: 'student', id: studentId, groupLabel: 'CS A' });
    const monday = fixture.slots.filter((s) => s.weekday === 1);
    expect(today.classes).toHaveLength(monday.length);
    expect(today.holiday).toBeNull();
    // Tomorrow's section trip is listed as a change.
    expect(today.changes[0]).toMatchObject({ kind: 'holiday' });
    expect(today.changes[0]!.message).toContain('Section trip');
  });

  it('shows the holiday and struck-through classes on the day itself', async () => {
    const today = TodayV1.parse((await get(`/portal/today?date=${TUESDAY}`)).body);
    expect(today.holiday).toBe('Section trip');
    expect(today.classes.length).toBeGreaterThan(0);
    expect(today.classes.every((c) => c.cancelled)).toBe(true);
    expect(today.nextClassId).toBeNull();
  });

  it('gives a teacher their own classes with the group they teach', async () => {
    const today = TodayV1.parse((await get(`/portal/today?date=${MONDAY}`, u.teacher)).body);
    expect(today.viewer).toMatchObject({ role: 'faculty', id: facultyId, groupLabel: 'TT' });
    const theirs = fixture.slots.filter(
      (s) => s.weekday === 1 && s.faculty.some((f) => f.id === fixtureTeacher.id),
    );
    // Slot ids are new in this database; compare course and time.
    const key = (code: string, minute: number) => `${code}@${minute}`;
    expect(today.classes.map((c) => key(c.courseCode, c.startMinute)).sort()).toEqual(
      theirs.map((s) => key(s.course.code, s.startMinute)).sort(),
    );
    expect(today.classes[0]!.withWhom).toBe(theirs[0]!.target.name);
  });

  it('returns the week Monday to Friday with the holiday marked', async () => {
    const res = await get(`/portal/week?date=${TUESDAY}`);
    expect(res.status).toBe(200);
    const week = PortalWeekV1.parse(res.body);
    expect(week.weekStart).toBe(MONDAY);
    expect(week.days.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5]);
    expect(week.days[1]).toMatchObject({ date: TUESDAY, holiday: 'Section trip' });
    expect(week.versionId).not.toBeNull();
  });

  it('tells an admin without a student or teacher record that they are not linked', async () => {
    const res = await get('/portal/today', u.admin);
    expect(res.status).toBe(404);
    expect(res.body.message).toContain('isn’t linked');
  });

  it('refuses people without a membership and checks the date', async () => {
    expect((await get('/portal/today', u.stranger)).status).toBe(403);
    expect((await get('/portal/today?date=10-08-2026')).status).toBe(400);
  });
});
