/**
 * Portal "Today" and week end to end: a student (matched by email) and a teacher (linked
 * login) read their own published week through P2T's timetable-read.v1 over real HTTP, with
 * holidays from the calendar; anyone else gets a plain "not linked" answer.
 *
 * Needs P2T's timetable tables (migrated on main since 20261027000000_p2t_timetable).
 */
import type { INestApplication } from '@nestjs/common';
import { TodayV1 } from '@slotwise/shared/contracts';
import { addDays, localNow, PortalWeekV1 } from '@slotwise/shared/portal';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Fixtures } from '../../test/helpers';
import {
  fixtureTeacher,
  portalFixture as fixture,
  portalMasterData,
  publishFixtureWeek,
  startPortalApp,
} from './portal.test-data';
import { PublishedTimetableClient } from './timetable.client';

const fx = new Fixtures();
/** A Monday inside the fixture's term. */
const MONDAY = '2026-08-10';
const TUESDAY = '2026-08-11';

let app: INestApplication;
let a: Awaited<ReturnType<Fixtures['institute']>>;
let tokens = new Map<string, string>();
const u = {} as Record<'student' | 'teacher' | 'admin' | 'stranger', { id: string; email: string }>;
let sectionId: string;
let studentId: string;
let facultyId: string;

const get = (path: string, user: { id: string } = u.student) =>
  request(app.getHttpServer())
    .get(path)
    .set('x-institute-slug', a.institute.slug)
    .set('authorization', `Bearer ${tokens.get(user.id)}`);

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
    await publishFixtureWeek(fx, {
      instituteId: a.institute.id,
      termId: md.term.id,
      createdById: u.admin.id,
      sectionId,
      facultyId,
    });
    await fx.grant(u.student.id, 'student', a.institute.id, { type: 'institute' });
    await fx.grant(u.teacher.id, 'faculty', a.institute.id, { type: 'department', id: a.cse.id });
    await fx.grant(u.admin.id, 'institute_admin', a.institute.id, { type: 'institute' });
    ({ app, tokens } = await startPortalApp(Object.values(u).map((x) => x.id)));
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

  it("shows a student's next exam seat from P6, and none when P6 has nothing", async () => {
    // On this branch P6's GET /exams/me isn't there yet (404): Today still works, no seat.
    expect(TodayV1.parse((await get('/portal/today')).body).examSeat).toBeNull();

    const soon = addDays(localNow('Asia/Kolkata').date, 3);
    const spy = vi.spyOn(app.get(PublishedTimetableClient), 'myExams').mockResolvedValueOnce({
      seats: [
        {
          date: soon,
          sessionLabel: 'Morning',
          startMinute: 600,
          paperCode: 'CS303',
          paperTitle: 'Operating Systems',
          hallCode: 'G16',
          building: 'Main block',
          floor: 0,
          seatLabel: 'G16-R3-C2',
        },
      ],
    });
    const today = TodayV1.parse((await get('/portal/today')).body);
    expect(today.examSeat).toMatchObject({ date: soon, hallCode: 'G16', seatLabel: 'G16-R3-C2' });
    expect(spy).toHaveBeenCalledWith(a.institute.slug, u.student.id);

    // Teachers' Today doesn't ask for seats.
    spy.mockClear();
    await get('/portal/today', u.teacher);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
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
