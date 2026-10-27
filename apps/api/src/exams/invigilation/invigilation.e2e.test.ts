/**
 * Invigilation end to end: the coordinator marks a teacher unavailable for a session, the
 * seating job sends the solver every teacher with availability, the papers they teach and
 * their duties in the exam's other sessions, and stores the duties it gets back. The solver is
 * the fake from exams.fixtures.ts (rules: services/solver/tests/seating/test_invigilation.py).
 *
 * Needs the exam tables and Redis; skipped without the tables.
 */
import type { INestApplication } from '@nestjs/common';
import type { SolverSeatingRequestV1 } from '@slotwise/shared/contracts';
import type { InvigilatorDto, SeatingPlanDto } from '@slotwise/shared/exams';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, Fixtures, signToken } from '../../../test/helpers';
import { examWorld, fakeSolve, purgeExams } from '../exams.fixtures';
import { SeatingSolverClient } from '../seating/solver.client';

const fx = new Fixtures();
let hasTables = false;
let app: INestApplication;
let a: Awaited<ReturnType<Fixtures['institute']>>;
let world: Awaited<ReturnType<typeof examWorld>>;
const tokens = new Map<string, string>();
const u = {} as Record<'admin' | 'faculty', { id: string }>;
const sent: SolverSeatingRequestV1[] = [];
const ids = { day1: '', day2: '' };

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
    put: (path: string, body: object = {}) => prep(http.put(path)).send(body),
  };
}

async function build(sessionId: string): Promise<SeatingPlanDto> {
  const res = await as(u.admin.id).post(`/exams/sessions/${sessionId}/seating`, {
    hallIds: [world.rooms.g1.id, world.rooms.f1.id],
  });
  expect(res.status).toBe(202);
  for (let i = 0; i < 120; i++) {
    const plan = (await as(u.admin.id).get(`/exams/seating/${res.body.planId}`))
      .body as SeatingPlanDto;
    if (plan.status !== 'queued' && plan.status !== 'running') return plan;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('seating job did not finish');
}

describe('invigilation', () => {
  beforeAll(async () => {
    const [check] = await fx.owner.$queryRaw<{ ok: boolean }[]>`
      SELECT to_regclass('invigilator_unavailability') IS NOT NULL AS ok`;
    hasTables = check?.ok === true;
    if (!hasTables) return;
    let env;
    ({ app, env } = await createTestApp());
    vi.spyOn(app.get(SeatingSolverClient), 'solve').mockImplementation(async (req) => {
      sent.push(req);
      return fakeSolve(req);
    });
    a = await fx.institute('invig-a');
    world = await examWorld(fx.owner, a.institute.id, a.cse.id);
    for (const key of ['admin', 'faculty'] as const) {
      u[key] = await fx.user(`invig-${key}`);
      tokens.set(u[key].id, await signToken(env, u[key].id));
    }
    await fx.grant(u.admin.id, 'institute_admin', a.institute.id, { type: 'institute' });
    await fx.grant(u.faculty.id, 'faculty', a.institute.id, { type: 'institute' });

    const instituteId = a.institute.id;
    const exam = await fx.owner.exam.create({
      data: { instituteId, termId: world.term.id, name: 'End-sem' },
    });
    const day = async (date: string, courseId: string) => {
      const session = await fx.owner.examSession.create({
        data: {
          instituteId,
          examId: exam.id,
          date: new Date(`${date}T00:00:00Z`),
          label: 'Morning',
          startMinute: 600,
          endMinute: 780,
        },
      });
      await fx.owner.examPaper.create({
        data: {
          instituteId,
          examId: exam.id,
          sessionId: session.id,
          courseId,
          sectionIds: [world.sections.a.id, world.sections.b.id],
        },
      });
      return session.id;
    };
    ids.day1 = await day('2026-12-01', world.courses.cs301.id);
    ids.day2 = await day('2026-12-02', world.courses.ma301.id);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    if (hasTables && a) await purgeExams(fx.owner, a.institute.id);
    await fx.cleanup();
  });

  live('the coordinator marks a teacher unavailable for a session', async () => {
    const put = await as(u.admin.id).put(`/exams/sessions/${ids.day1}/unavailable`, {
      facultyIds: [world.faculty.bedi.id],
    });
    expect(put.status).toBe(204);
    const list = (await as(u.admin.id).get(`/exams/sessions/${ids.day1}/invigilators`))
      .body as InvigilatorDto[];
    expect(list.map((f) => [f.name, f.available, f.teaches, f.dutiesSoFar])).toEqual([
      ['Dr. Anand', true, ['CS301'], 0],
      ['Mr. Chopra', true, [], 0],
      ['Ms. Bedi', false, [], 0],
      ['Ms. Dutt', true, [], 0],
    ]);
    // Faculty may look but not change it.
    expect((await as(u.faculty.id).get(`/exams/sessions/${ids.day1}/invigilators`)).status).toBe(
      200,
    );
    expect(
      (await as(u.faculty.id).put(`/exams/sessions/${ids.day1}/unavailable`, { facultyIds: [] }))
        .status,
    ).toBe(403);
  });

  live('the seating job sends teachers to the solver and stores their duties', async () => {
    const plan = await build(ids.day1);
    expect(plan.status).toBe('ready');
    const req = sent.at(-1)!;
    const byName = new Map(req.faculty.map((f) => [f.name, f]));
    expect(byName.get('Ms. Bedi')?.available).toBe(false);
    expect(byName.get('Dr. Anand')?.teachesPaperIds).toEqual([req.papers[0]!.id]);
    // G1 (6 students) and F1 (3): Chopra and Dutt; Anand teaches CS301, Bedi is away.
    expect(plan.halls.map((h) => [h.code, h.invigilators])).toEqual([
      ['G1', ['Mr. Chopra']],
      ['F1', ['Ms. Dutt']],
    ]);
    const duties = await fx.owner.invigilationDuty.findMany({ where: { planId: plan.id } });
    expect(duties.map((d) => [d.facultyName, d.hallCode]).sort()).toEqual([
      ['Mr. Chopra', 'G1'],
      ['Ms. Dutt', 'F1'],
    ]);
  });

  live('duties in other sessions count towards balance', async () => {
    await build(ids.day2);
    const load = new Map(sent.at(-1)!.faculty.map((f) => [f.name, f.dutiesSoFar]));
    expect(Object.fromEntries(load)).toEqual({
      'Dr. Anand': 0,
      'Mr. Chopra': 1,
      'Ms. Bedi': 0,
      'Ms. Dutt': 1,
    });
    // Day 2 has MA301, which nobody teaches, and Bedi is free: the two least loaded go.
    const plan = (await as(u.admin.id).get(`/exams/sessions/${ids.day2}/seating`))
      .body as SeatingPlanDto[];
    expect(plan[0]?.halls.flatMap((h) => h.invigilators).sort()).toEqual(['Dr. Anand', 'Ms. Bedi']);
  });
});
