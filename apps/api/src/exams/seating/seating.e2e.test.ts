/**
 * Building a seating plan end to end: the API queues a job on BullMQ (Redis), the job reads the
 * date sheet, students, seat needs and rooms, calls the solver and stores seats and duties.
 * The solver call is replaced by a simple fake (the real rules are tested in
 * services/solver/tests/seating). Also: a clash on the date sheet fails with a plain message,
 * and who may build plans.
 *
 * Needs the exam tables and Redis; skipped without the tables.
 */
import type { INestApplication } from '@nestjs/common';
import type { SolverSeatingRequestV1 } from '@slotwise/shared/contracts';
import type { SeatingPlanDto } from '@slotwise/shared/exams';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, Fixtures, signToken } from '../../../test/helpers';
import { examWorld, fakeSolve, purgeExams } from '../exams.fixtures';
import { SeatingSolverClient } from './solver.client';

const fx = new Fixtures();
let hasTables = false;
let app: INestApplication;
let a: Awaited<ReturnType<Fixtures['institute']>>;
let world: Awaited<ReturnType<typeof examWorld>>;
const tokens = new Map<string, string>();
const u = {} as Record<'admin' | 'faculty', { id: string }>;
const sent: SolverSeatingRequestV1[] = [];

function live(name: string, fn: () => Promise<void>): void {
  it(
    name,
    async (ctx) => {
      if (!hasTables) ctx.skip('exam tables are not migrated yet');
      await fn();
    },
    90_000,
  );
}

function as(userId: string) {
  const http = request(app.getHttpServer());
  const prep = (req: request.Test) =>
    req
      .set('x-institute-slug', a.institute.slug)
      .set('authorization', `Bearer ${tokens.get(userId)}`);
  return {
    get: (path: string) => prep(http.get(path)),
    post: (path: string, body: object = {}) => prep(http.post(path)).send(body),
  };
}

async function finished(planId: string): Promise<SeatingPlanDto> {
  for (let i = 0; i < 120; i++) {
    const plan = (await as(u.admin.id).get(`/exams/seating/${planId}`)).body as SeatingPlanDto;
    if (plan.status !== 'queued' && plan.status !== 'running') return plan;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('seating job did not finish');
}

describe('building a seating plan', () => {
  const ids = { exam: '', morning: '', evening: '' };

  beforeAll(async () => {
    const [check] = await fx.owner.$queryRaw<{ ok: boolean }[]>`
      SELECT to_regclass('seating_plans') IS NOT NULL AS ok`;
    hasTables = check?.ok === true;
    if (!hasTables) return;
    let env;
    ({ app, env } = await createTestApp());
    vi.spyOn(app.get(SeatingSolverClient), 'solve').mockImplementation(async (req) => {
      sent.push(req);
      return fakeSolve(req);
    });
    a = await fx.institute('seating-a');
    world = await examWorld(fx.owner, a.institute.id, a.cse.id);
    for (const key of ['admin', 'faculty'] as const) {
      u[key] = await fx.user(`seating-${key}`);
      tokens.set(u[key].id, await signToken(env, u[key].id));
    }
    await fx.grant(u.admin.id, 'institute_admin', a.institute.id, { type: 'institute' });
    await fx.grant(u.faculty.id, 'faculty', a.institute.id, { type: 'institute' });

    const owner = fx.owner;
    const instituteId = a.institute.id;
    const exam = await owner.exam.create({
      data: { instituteId, termId: world.term.id, name: 'End-sem', reserveSeatsPerHall: 1 },
    });
    ids.exam = exam.id;
    const session = (label: string, startMinute: number) =>
      owner.examSession.create({
        data: {
          instituteId,
          examId: exam.id,
          date: new Date('2026-12-01T00:00:00Z'),
          label,
          startMinute,
          endMinute: startMinute + 180,
        },
      });
    ids.morning = (await session('Morning', 600)).id;
    ids.evening = (await session('Evening', 840)).id;
    const paper = (sessionId: string, courseId: string, sectionIds: string[]) =>
      owner.examPaper.create({
        data: { instituteId, examId: exam.id, sessionId, courseId, sectionIds },
      });
    await paper(ids.morning, world.courses.cs301.id, [world.sections.a.id]);
    await paper(ids.morning, world.courses.cs303.id, [world.sections.b.id]);
    // Evening: CS A writes two papers (a clash).
    await paper(ids.evening, world.courses.ma301.id, [world.sections.a.id]);
    await owner.examPaper.create({
      data: {
        instituteId,
        examId: exam.id,
        sessionId: ids.evening,
        courseId: (
          await owner.course.create({
            data: {
              instituteId,
              schemeVersionId: world.courses.cs301.schemeVersionId,
              semester: 5,
              code: 'HU301',
              title: 'Course HU301',
              shortName: 'HU',
              offeringDepartmentId: a.cse.id,
            },
          })
        ).id,
        sectionIds: [world.sections.a.id],
      },
    });
    const b2 = await owner.student.findFirstOrThrow({
      where: { instituteId, classRollNo: '24B2' },
    });
    await owner.examSeatNeed.create({ data: { instituteId, studentId: b2.id } });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    if (hasTables && a) await purgeExams(fx.owner, a.institute.id);
    await fx.cleanup();
  });

  live('the job sends the solver what the date sheet and rooms say, and stores seats', async () => {
    const res = await as(u.admin.id).post(`/exams/sessions/${ids.morning}/seating`, {
      hallIds: [world.rooms.g1.id, world.rooms.f1.id, world.rooms.lab.id],
    });
    expect(res.status).toBe(202);
    const plan = await finished(res.body.planId);
    expect(plan).toMatchObject({ status: 'ready', solverStatus: 'FEASIBLE', error: null });
    expect(plan.seated).toBe(9);

    const req = sent.at(-1)!;
    expect(req.requestId).toBe(res.body.planId);
    // Rooms in the order given; the lab has no exam seats and is left out.
    expect(
      req.halls.map((h) => [h.code, h.order, h.rows, h.benchesPerRow, h.seatsPerBench]),
    ).toEqual([
      ['G1', 0, 3, 2, 1],
      ['F1', 1, 3, 2, 1],
    ]);
    expect(req.halls[0]?.isAccessible).toBe(true);
    expect(req.students).toHaveLength(9); // 24A6 has left the college
    expect(req.students.filter((s) => s.needsAccessibleSeat).map((s) => s.rollNo)).toEqual([
      '24B2',
    ]);
    expect(req.options.reserveSeatsPerHall).toBe(1);
    expect(new Set(req.papers.map((p) => p.code))).toEqual(new Set(['CS301', 'CS303']));

    expect(plan.halls.map((h) => [h.code, h.used, h.capacity])).toEqual([
      ['G1', 6, 6],
      ['F1', 3, 6],
    ]);
    const seats = await fx.owner.seatAssignment.findMany({
      where: { planId: plan.id },
      orderBy: { label: 'asc' },
    });
    expect(seats[0]).toMatchObject({ hallCode: 'F1', label: 'F1-R1-C1' });
    expect(seats.every((s) => s.rollNo && s.paperCode)).toBe(true);
  });

  live('every room with exam seats is offered when none are picked', async () => {
    const res = await as(u.admin.id).post(`/exams/sessions/${ids.morning}/seating`);
    await finished(res.body.planId);
    // Ground floor first, then by code.
    expect(sent.at(-1)!.halls.map((h) => h.code)).toEqual(['G1', 'F1']);
  });

  live('a section writing two papers in a session fails with a plain message', async () => {
    const res = await as(u.admin.id).post(`/exams/sessions/${ids.evening}/seating`);
    expect(res.status).toBe(202);
    const plan = await finished(res.body.planId);
    expect(plan.status).toBe('failed');
    expect(plan.error).toMatch(
      /^CS A has (MA301 and HU301|HU301 and MA301) in the same session \(Tue 1 Dec, Evening\)\. Fix the date sheet first\.$/,
    );
  });

  live('faculty cannot build plans', async () => {
    const res = await as(u.faculty.id).post(`/exams/sessions/${ids.morning}/seating`);
    expect(res.status).toBe(403);
  });
});
