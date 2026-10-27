/**
 * Publishing end to end: a draft becomes version 1, the next publish archives it and becomes
 * version 2, exactly one `timetable.published` per publish (also on a double click), the
 * archived event, published versions refusing edits, undo bringing the previous version back
 * with the undone classes as a new draft, and who may publish.
 *
 * Needs the timetable tables; skipped until INT's migration is in (as the read test).
 */
import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Prisma } from '@slotwise/db';
import type { EventPayloadV1 } from '@slotwise/shared/contracts';
import { demoTermSnapshot, demoTermSolution } from '@slotwise/shared/fixtures';
import {
  slotsFromPlacements,
  TimetableChecker,
  type EditorDataDto,
  type PublishResult,
  type UndoPublishResult,
} from '@slotwise/shared/timetable';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
const u = {} as Record<'coord' | 'faculty' | 'deptCoord', { id: string }>;
let termId = '';
let snapshotId = '';
const published: EventPayloadV1<'timetable.published'>[] = [];
const archived: EventPayloadV1<'timetable.version.archived'>[] = [];

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

async function draft(): Promise<string> {
  const instituteId = a.institute.id;
  const v = await fx.owner.timetableVersion.create({
    data: {
      instituteId,
      termId,
      snapshotId,
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
  return v.id;
}

const publish = (versionId: string, user = u.coord.id) =>
  as(user).post(`/timetable/versions/${versionId}/publish`);

const statusOf = async (id: string) =>
  (await fx.owner.timetableVersion.findUniqueOrThrow({ where: { id } })).status;

describe('publishing a timetable', () => {
  beforeAll(async () => {
    const [check] = await fx.owner.$queryRaw<{ ok: boolean }[]>`
      SELECT to_regclass('timetable_slots') IS NOT NULL AS ok`;
    hasTables = check?.ok === true;
    if (!hasTables) return;
    let env;
    ({ app, env } = await createTestApp());
    const events = app.get(EventEmitter2);
    events.on('timetable.published', (e: EventPayloadV1<'timetable.published'>) => {
      published.push(e);
    });
    events.on('timetable.version.archived', (e: EventPayloadV1<'timetable.version.archived'>) => {
      archived.push(e);
    });
    a = await fx.institute('publish-a');
    for (const key of ['coord', 'faculty', 'deptCoord'] as const) {
      u[key] = await fx.user(`publish-${key}`);
      tokens.set(u[key].id, await signToken(env, u[key].id));
    }
    await fx.grant(u.coord.id, 'timetable_coordinator', a.institute.id, { type: 'institute' });
    await fx.grant(u.faculty.id, 'faculty', a.institute.id, { type: 'institute' });
    await fx.grant(u.deptCoord.id, 'timetable_coordinator', a.institute.id, {
      type: 'department',
      id: a.cse.id,
    });
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
    snapshotId = (
      await fx.owner.timetableSnapshot.create({
        data: {
          instituteId: a.institute.id,
          termId,
          hash: createHash('sha256').update('publish').digest('hex'),
          data: snapshot as unknown as Prisma.InputJsonValue,
        },
      })
    ).id;
  }, 60_000);

  beforeEach(() => {
    published.length = 0;
    archived.length = 0;
  });

  afterAll(async () => {
    await app?.close();
    if (hasTables && a) {
      const instituteId = a.institute.id;
      // Children first: versions point at their parent.
      const versions = await fx.owner.timetableVersion.findMany({
        where: { instituteId },
        orderBy: { createdAt: 'desc' },
      });
      for (const v of versions) await fx.owner.timetableVersion.delete({ where: { id: v.id } });
      await fx.owner.timetableSnapshot.deleteMany({ where: { instituteId } });
    }
    await fx.cleanup();
  });

  const ids = { first: '', second: '' };

  live('a draft becomes version 1, with one event naming every section', async () => {
    ids.first = await draft();
    const res = await publish(ids.first);
    expect(res.status).toBe(200);
    const body = res.body as PublishResult;
    expect(body).toMatchObject({
      versionId: ids.first,
      number: 1,
      previousVersionId: null,
      alreadyPublished: false,
    });
    expect(body.validFrom >= snapshot.term.startDate).toBe(true);
    expect(body.validFrom <= snapshot.term.endDate).toBe(true);
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      instituteId: a.institute.id,
      actorUserId: u.coord.id,
      termId,
      versionId: ids.first,
      previousVersionId: null,
      validFrom: body.validFrom,
    });
    expect(published[0]!.sectionIds).toHaveLength(snapshot.sections.length);
    expect(archived).toHaveLength(0);
  });

  live('a second click changes nothing and sends no second event', async () => {
    const res = await publish(ids.first);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ versionId: ids.first, number: 1, alreadyPublished: true });
    expect(published).toHaveLength(0);
  });

  live('the published version refuses edits', async () => {
    const data = (await as(u.coord.id).get(`/timetable/versions/${ids.first}/editor`))
      .body as EditorDataDto;
    const res = await as(u.coord.id).post(`/timetable/versions/${ids.first}/edits`, {
      type: 'lock',
      slotId: data.slots[0]!.id,
      locked: true,
    });
    expect(res.status).toBe(409);
  });

  live(
    'publishing an edited copy archives version 1 and names only the changed sections',
    async () => {
      const copy = await as(u.coord.id).post(`/timetable/versions/${ids.first}/copy`);
      ids.second = (copy.body as { versionId: string }).versionId;
      const data = (await as(u.coord.id).get(`/timetable/versions/${ids.second}/editor`))
        .body as EditorDataDto;
      const checker = new TimetableChecker(data.snapshot, data.slots, data.busy);
      const slot = data.slots.find(
        (s) => s.component === 'lecture' && s.target.kind === 'section' && s.length === 1,
      )!;
      const to = checker
        .validStarts(slot.id)
        .find((c) => c.weekday !== slot.weekday || c.startPeriodIndex !== slot.startPeriodIndex)!;
      const moved = await as(u.coord.id).post(`/timetable/versions/${ids.second}/edits`, {
        type: 'move',
        slotId: slot.id,
        ...to,
        roomId: slot.room?.id,
      });
      expect(moved.status).toBe(200);

      // Two coordinators at once: still one publish, one of each event.
      const [r1, r2] = await Promise.all([publish(ids.second), publish(ids.second)]);
      expect([r1.status, r2.status]).toEqual([200, 200]);
      expect([r1.body, r2.body].filter((b: PublishResult) => !b.alreadyPublished)).toHaveLength(1);
      expect(published).toHaveLength(1);
      expect(published[0]).toMatchObject({
        versionId: ids.second,
        previousVersionId: ids.first,
      });
      expect(published[0]!.sectionIds).toEqual([...slot.sectionIds].sort());
      expect(archived).toEqual([
        expect.objectContaining({ versionId: ids.first, replacedByVersionId: ids.second }),
      ]);
      expect(await statusOf(ids.first)).toBe('archived');
      const v2 = await fx.owner.timetableVersion.findUniqueOrThrow({ where: { id: ids.second } });
      expect(v2).toMatchObject({ status: 'published', number: 2 });

      // An archived version can't be published again directly.
      expect((await publish(ids.first)).status).toBe(409);
    },
  );

  live('undo brings version 1 back and keeps the undone classes as a draft', async () => {
    const res = await as(u.coord.id).post(`/timetable/versions/${ids.second}/undo-publish`);
    expect(res.status).toBe(200);
    const body = res.body as UndoPublishResult;
    expect(body.restoredVersionId).toBe(ids.first);
    expect(await statusOf(ids.first)).toBe('published');
    expect(await statusOf(ids.second)).toBe('archived');
    const copy = await fx.owner.timetableVersion.findUniqueOrThrow({
      where: { id: body.draftVersionId },
      include: { _count: { select: { slots: true } } },
    });
    expect(copy).toMatchObject({ status: 'draft', parentId: ids.second });
    expect(copy._count.slots).toBe(demoTermSolution().placed.length);
    expect(archived).toEqual([
      expect.objectContaining({ versionId: ids.second, replacedByVersionId: ids.first }),
    ]);
    expect(published).toEqual([
      expect.objectContaining({ versionId: ids.first, previousVersionId: ids.second }),
    ]);

    // Publishing the copy makes version 3.
    const again = await publish(body.draftVersionId);
    expect(again.body).toMatchObject({ number: 3, previousVersionId: ids.first });
  });

  live('only coordinators of every department in it may publish', async () => {
    const id = await draft();
    expect((await publish(id, u.faculty.id)).status).toBe(403);
    expect((await publish(id, u.deptCoord.id)).status).toBe(403);
    expect(await statusOf(id)).toBe('draft');
    expect(published).toHaveLength(0);
  });
});
