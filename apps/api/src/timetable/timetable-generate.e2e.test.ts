/**
 * Generating a timetable end to end with the fixture snapshot and the mock solver: the job
 * runs on BullMQ (Redis), reports progress, and leaves a draft version that the published read
 * API does not show. Also: permissions, a double click, and a failing job's plain message.
 *
 * Needs the timetable tables and Redis; skipped until INT's migration is in (as the read test).
 */
import type { INestApplication } from '@nestjs/common';
import type { SolveJobDto, TimetableViewDto, VersionSummaryDto } from '@slotwise/shared/timetable';
import { demoTermSnapshot } from '@slotwise/shared/fixtures';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, Fixtures, signToken } from '../../test/helpers';
import { SnapshotClient, SolveProblem } from './jobs/clients';

const fx = new Fixtures();
let hasTables = false;

function live(name: string, fn: () => Promise<void>): void {
  it(
    name,
    async (ctx) => {
      if (!hasTables) ctx.skip('timetable tables are not migrated yet');
      await fn();
    },
    60_000,
  );
}

const snapshot = demoTermSnapshot();
let app: INestApplication;
let a: Awaited<ReturnType<Fixtures['institute']>>;
const tokens = new Map<string, string>();
const u = {} as Record<'coord' | 'deptCoord' | 'student', { id: string }>;
let termId = '';
let draftId = '';

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

/** Polls the job until it is finished. */
async function finished(jobId: string): Promise<SolveJobDto> {
  const seen = new Set<number>();
  for (let i = 0; i < 100; i++) {
    const res = await as(u.coord.id).get(`/timetable/jobs/${jobId}`);
    expect(res.status).toBe(200);
    const job = res.body as SolveJobDto;
    seen.add(job.progress);
    if (job.status === 'succeeded' || job.status === 'failed') return job;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`job ${jobId} did not finish; progress seen: ${[...seen].join(', ')}`);
}

describe('generate a timetable (mock solver, fixture snapshot)', () => {
  beforeAll(async () => {
    const [check] = await fx.owner.$queryRaw<{ ok: boolean }[]>`
      SELECT to_regclass('timetable_solve_jobs') IS NOT NULL AS ok`;
    hasTables = check?.ok === true;
    if (!hasTables) return;
    process.env.SNAPSHOT_SOURCE = 'fixture';
    process.env.SOLVER_SOURCE = 'mock';
    process.env.SOLVER_MOCK_DELAY_MS = '1500';
    let env;
    ({ app, env } = await createTestApp());
    a = await fx.institute('gen-a');
    for (const key of ['coord', 'deptCoord', 'student'] as const) {
      u[key] = await fx.user(`gen-${key}`);
      tokens.set(u[key].id, await signToken(env, u[key].id));
    }
    await fx.grant(u.coord.id, 'timetable_coordinator', a.institute.id, { type: 'institute' });
    await fx.grant(u.deptCoord.id, 'timetable_coordinator', a.institute.id, {
      type: 'department',
      id: a.cse.id,
    });
    await fx.grant(u.student.id, 'student', a.institute.id, { type: 'institute' });
    const session = await fx.owner.academicSession.create({
      data: { instituteId: a.institute.id, name: '2026-27', startYear: 2026 },
    });
    termId = (
      await fx.owner.term.create({
        data: {
          instituteId: a.institute.id,
          sessionId: session.id,
          kind: 'odd',
          label: snapshot.term.label,
          startDate: new Date(`${snapshot.term.startDate}T00:00:00Z`),
          endDate: new Date(`${snapshot.term.endDate}T00:00:00Z`),
        },
      })
    ).id;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    if (hasTables && a) {
      const instituteId = a.institute.id;
      await fx.owner.timetableVersion.deleteMany({ where: { instituteId } });
      await fx.owner.solveJob.deleteMany({ where: { instituteId } });
      await fx.owner.timetableSnapshot.deleteMany({ where: { instituteId } });
    }
    for (const key of ['SNAPSHOT_SOURCE', 'SOLVER_SOURCE', 'SOLVER_MOCK_DELAY_MS'])
      delete process.env[key];
    await fx.cleanup();
  });

  live('runs in the background and leaves a draft with the solver’s result', async () => {
    const start = await as(u.coord.id).post(`/terms/${termId}/timetable/generate`, {
      timeLimitSeconds: 30,
    });
    expect(start.status).toBe(202);
    const queued = start.body as SolveJobDto;
    expect(queued.status).toBe('queued');

    // A second click while it runs follows the same job.
    const again = await as(u.coord.id).post(`/terms/${termId}/timetable/generate`);
    expect(again.status).toBe(202);
    expect((again.body as SolveJobDto).id).toBe(queued.id);

    const job = await finished(queued.id);
    expect(job).toMatchObject({ status: 'succeeded', progress: 100, error: null });
    expect(job.summary).toMatchObject({ solverStatus: 'INFEASIBLE', placed: 394, unplaced: 20 });
    expect(job.versionId).toBeTruthy();

    const versions = (await as(u.coord.id).get(`/terms/${termId}/timetable/versions`))
      .body as VersionSummaryDto[];
    expect(versions).toEqual([
      expect.objectContaining({
        id: job.versionId,
        status: 'draft',
        number: null,
        slotCount: 394,
        unplacedCount: 20,
        solveJobId: job.id,
      }),
    ]);

    // Drafts never reach the published read API.
    const section = snapshot.sections[0]!.id;
    const read = await as(u.student.id).get(`/terms/${termId}/timetable?sectionId=${section}`);
    expect(read.body).toEqual({ contract: 'timetable-read.v1', version: null, slots: [] });

    const recent = (await as(u.coord.id).get(`/terms/${termId}/timetable/jobs`))
      .body as SolveJobDto[];
    expect(recent[0]!.id).toBe(job.id);
    draftId = job.versionId!;
  });

  live('shows the draft week to editors only', async () => {
    const view = await as(u.coord.id).get(`/timetable/versions/${draftId}/view`);
    expect(view.status).toBe(200);
    const body = view.body as TimetableViewDto;
    expect(body.version).toMatchObject({ id: draftId, status: 'draft', slotCount: 394 });
    expect(body.who).toMatchObject({ kind: 'section', id: body.choices.section[0]!.id });
    expect(body.slots.length).toBeGreaterThan(0);
    expect(body.bell.periods.length).toBeGreaterThan(0);
    expect(body.choices.faculty.length).toBe(snapshot.faculty.length);

    const teacher = body.slots[0]!.faculty[0]!.id;
    const byTeacher = (
      await as(u.coord.id).get(`/timetable/versions/${draftId}/view?kind=faculty&id=${teacher}`)
    ).body as TimetableViewDto;
    expect(byTeacher.slots.every((s) => s.faculty.some((f) => f.id === teacher))).toBe(true);

    const unknown = '00000000-0000-4000-8000-000000000002';
    expect(
      (await as(u.coord.id).get(`/timetable/versions/${draftId}/view?kind=room&id=${unknown}`))
        .status,
    ).toBe(404);
    expect((await as(u.student.id).get(`/timetable/versions/${draftId}/view`)).status).toBe(403);
  });

  live('explains a failure in plain words', async () => {
    const spy = vi
      .spyOn(app.get(SnapshotClient), 'get')
      .mockRejectedValueOnce(
        new SolveProblem('The setup data for this term is incomplete. Run the readiness check.'),
      );
    try {
      const start = await as(u.coord.id).post(`/terms/${termId}/timetable/generate`);
      const job = await finished((start.body as SolveJobDto).id);
      expect(job).toMatchObject({
        status: 'failed',
        versionId: null,
        error: 'The setup data for this term is incomplete. Run the readiness check.',
      });
    } finally {
      spy.mockRestore();
    }
  });

  live('only coordinators who cover the classes may generate', async () => {
    expect((await as(u.student.id).post(`/terms/${termId}/timetable/generate`)).status).toBe(403);
    // A department coordinator cannot generate the whole term.
    expect((await as(u.deptCoord.id).post(`/terms/${termId}/timetable/generate`)).status).toBe(403);
    // Students see published versions only: here, none yet.
    const asStudent = await as(u.student.id).get(`/terms/${termId}/timetable/versions`);
    expect(asStudent.status).toBe(200);
    expect(asStudent.body).toEqual([]);
  });

  live('checks the term, the timetable group and the input', async () => {
    const missing = '00000000-0000-4000-8000-000000000001';
    expect((await as(u.coord.id).post(`/terms/${missing}/timetable/generate`)).status).toBe(404);
    const badScope = await as(u.coord.id).post(`/terms/${termId}/timetable/generate`, {
      scopeId: missing,
    });
    expect(badScope.status).toBe(404);
    const badLimit = await as(u.coord.id).post(`/terms/${termId}/timetable/generate`, {
      timeLimitSeconds: 1,
    });
    expect(badLimit.status).toBe(400);
    expect((await as(u.coord.id).get(`/timetable/jobs/${missing}`)).status).toBe(404);
  });
});
