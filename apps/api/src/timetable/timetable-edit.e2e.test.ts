/**
 * Editing end to end: editor data, a valid move saved, a clashing move refused with reasons
 * (the same shared checker the web uses), locks, published versions refusing edits, editable
 * copies, department limits, and "re-solve the rest" keeping a locked class in place.
 *
 * Needs the timetable tables and Redis; skipped until INT's migration is in (as the read test).
 */
import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Prisma } from '@slotwise/db';
import { demoTermSnapshot, demoTermSolution } from '@slotwise/shared/fixtures';
import {
  slotsFromPlacements,
  TimetableChecker,
  type EditorDataDto,
  type EditRefusal,
  type EditResult,
  type SolveJobDto,
  type VersionSummaryDto,
} from '@slotwise/shared/timetable';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, Fixtures, signToken } from '../../test/helpers';

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
const u = {} as Record<'coord' | 'deptCoord', { id: string }>;
const ids = { term: '', draft: '', published: '' };

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

async function version(status: 'draft' | 'published'): Promise<string> {
  const instituteId = a.institute.id;
  const hash = createHash('sha256').update(`edit:${status}`).digest('hex');
  const snap = await fx.owner.timetableSnapshot.create({
    data: {
      instituteId,
      termId: ids.term,
      hash,
      data: snapshot as unknown as Prisma.InputJsonValue,
    },
  });
  const v = await fx.owner.timetableVersion.create({
    data: {
      instituteId,
      termId: ids.term,
      snapshotId: snap.id,
      cohortIds: snapshot.cohorts.map((c) => c.id),
      createdById: u.coord.id,
    },
  });
  await fx.owner.timetableSlot.createMany({
    data: slotsFromPlacements(snapshot, demoTermSolution().placed).map((slot) => ({
      ...slot,
      faculty: slot.faculty as unknown as Prisma.InputJsonValue,
      instituteId,
      versionId: v.id,
    })),
  });
  if (status === 'published') {
    await fx.owner.timetableVersion.update({
      where: { id: v.id },
      data: { status, number: 1, publishedAt: new Date(), validFrom: new Date('2026-07-27') },
    });
  }
  return v.id;
}

const editor = async (versionId: string) =>
  (await as(u.coord.id).get(`/timetable/versions/${versionId}/editor`)).body as EditorDataDto;

describe('editing a draft timetable', () => {
  beforeAll(async () => {
    const [check] = await fx.owner.$queryRaw<{ ok: boolean }[]>`
      SELECT to_regclass('timetable_slots') IS NOT NULL AS ok`;
    hasTables = check?.ok === true;
    if (!hasTables) return;
    process.env.SNAPSHOT_SOURCE = 'fixture';
    process.env.SOLVER_SOURCE = 'mock';
    process.env.SOLVER_MOCK_DELAY_MS = '200';
    let env;
    ({ app, env } = await createTestApp());
    a = await fx.institute('edit-a');
    for (const key of ['coord', 'deptCoord'] as const) {
      u[key] = await fx.user(`edit-${key}`);
      tokens.set(u[key].id, await signToken(env, u[key].id));
    }
    await fx.grant(u.coord.id, 'timetable_coordinator', a.institute.id, { type: 'institute' });
    await fx.grant(u.deptCoord.id, 'timetable_coordinator', a.institute.id, {
      type: 'department',
      id: a.cse.id,
    });
    const session = await fx.owner.academicSession.create({
      data: { instituteId: a.institute.id, name: '2026-27', startYear: 2026 },
    });
    ids.term = (
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
    ids.draft = await version('draft');
    ids.published = await version('published');
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    if (hasTables && a) {
      const instituteId = a.institute.id;
      await fx.owner.timetableVersion.deleteMany({ where: { instituteId } });
      await fx.owner.solveJob.deleteMany({ where: { instituteId } });
      await fx.owner.timetableSnapshot.deleteMany({ where: { instituteId } });
    }
    for (const key of ['SNAPSHOT_SOURCE', 'SOLVER_SOURCE', 'SOLVER_MOCK_DELAY_MS']) {
      delete process.env[key];
    }
    await fx.cleanup();
  });

  const edit = (versionId: string, body: object, user = u.coord.id) =>
    as(user).post(`/timetable/versions/${versionId}/edits`, body);

  live('gives the editor everything it needs', async () => {
    const data = await editor(ids.draft);
    expect(data.version).toMatchObject({ id: ids.draft, status: 'draft', slotCount: 394 });
    expect(data.slots).toHaveLength(394);
    expect(data.snapshot.version).toBe('setup-snapshot.v1');
    expect(data.busy).toEqual([]);
  });

  live('saves a move the checker allows, and refuses a clash with the reasons', async () => {
    const data = await editor(ids.draft);
    const checker = new TimetableChecker(data.snapshot, data.slots, data.busy);
    const slot = data.slots.find((s) => s.component === 'lecture')!;
    const to = checker
      .validStarts(slot.id)
      .find((c) => c.weekday !== slot.weekday || c.startPeriodIndex !== slot.startPeriodIndex)!;

    const ok = await edit(ids.draft, { type: 'move', slotId: slot.id, ...to });
    expect(ok.status).toBe(200);
    expect((ok.body as EditResult).slot).toMatchObject({
      id: slot.id,
      weekday: to.weekday,
      startPeriodIndex: to.startPeriodIndex,
    });

    // Back where it was (what undo sends).
    const back = await edit(ids.draft, {
      type: 'move',
      slotId: slot.id,
      weekday: slot.weekday,
      startPeriodIndex: slot.startPeriodIndex,
    });
    expect(back.status).toBe(200);

    const clash = data.slots.find(
      (s) =>
        s.id !== slot.id &&
        s.target.id === slot.target.id &&
        (s.weekday !== slot.weekday || s.startPeriodIndex !== slot.startPeriodIndex),
    )!;
    const refused = await edit(ids.draft, {
      type: 'move',
      slotId: slot.id,
      weekday: clash.weekday,
      startPeriodIndex: clash.startPeriodIndex,
    });
    expect(refused.status).toBe(409);
    const body = refused.body as EditRefusal;
    expect(body.problems.map((p) => p.code)).toContain('section_busy');
    expect(body.message).toMatch(/already has|teaches|not available|kept free|No suitable room/);
  });

  live('a locked class stays put until unlocked', async () => {
    const { slots } = await editor(ids.draft);
    const slot = slots[0]!;
    const lock = await edit(ids.draft, { type: 'lock', slotId: slot.id, locked: true });
    expect((lock.body as EditResult).slot.locked).toBe(true);
    const move = await edit(ids.draft, {
      type: 'move',
      slotId: slot.id,
      weekday: slot.weekday,
      startPeriodIndex: slot.startPeriodIndex,
    });
    expect(move.status).toBe(409);
    expect((move.body as EditRefusal).problems[0]!.code).toBe('locked');
    await edit(ids.draft, { type: 'lock', slotId: slot.id, locked: false });
  });

  live('published timetables never change; an editable copy is a new draft', async () => {
    const { slots } = await editor(ids.published);
    const refused = await edit(ids.published, { type: 'lock', slotId: slots[0]!.id, locked: true });
    expect(refused.status).toBe(409);

    const copy = await as(u.coord.id).post(`/timetable/versions/${ids.published}/copy`);
    expect(copy.status).toBe(201);
    const copyId = (copy.body as { versionId: string }).versionId;
    const versions = (await as(u.coord.id).get(`/terms/${ids.term}/timetable/versions`))
      .body as VersionSummaryDto[];
    expect(versions.find((v) => v.id === copyId)).toMatchObject({
      status: 'draft',
      parentId: ids.published,
      slotCount: 394,
    });
  });

  live("a department coordinator cannot change another department's classes", async () => {
    const { slots } = await editor(ids.draft);
    const res = await edit(
      ids.draft,
      { type: 'lock', slotId: slots[0]!.id, locked: true },
      u.deptCoord.id,
    );
    expect(res.status).toBe(403);
  });

  live('re-solving the rest keeps a locked class exactly where it is', async () => {
    const data = await editor(ids.draft);
    const checker = new TimetableChecker(data.snapshot, data.slots, data.busy);
    const slot = data.slots.find((s) => s.component === 'lecture' && s.length === 1)!;
    const to = checker
      .validStarts(slot.id)
      .find((c) => c.weekday !== slot.weekday || c.startPeriodIndex !== slot.startPeriodIndex)!;
    await edit(ids.draft, { type: 'move', slotId: slot.id, ...to });
    await edit(ids.draft, { type: 'lock', slotId: slot.id, locked: true });

    const start = await as(u.coord.id).post(`/terms/${ids.term}/timetable/generate`, {
      baseVersionId: ids.draft,
    });
    expect(start.status).toBe(202);
    let job = start.body as SolveJobDto;
    for (let i = 0; i < 100 && (job.status === 'queued' || job.status === 'running'); i++) {
      await new Promise((r) => setTimeout(r, 200));
      job = (await as(u.coord.id).get(`/timetable/jobs/${job.id}`)).body as SolveJobDto;
    }
    expect(job.status).toBe('succeeded');
    const next = await editor(job.versionId!);
    expect(next.version.parentId).toBe(ids.draft);
    const kept = next.slots.find((s) => s.sessionId === slot.sessionId)!;
    expect(kept).toMatchObject({ ...to, locked: true });
  });
});
