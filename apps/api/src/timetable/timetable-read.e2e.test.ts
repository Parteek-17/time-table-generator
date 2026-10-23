/**
 * timetable-read.v1 end to end against a real Postgres: responses follow the contract, drafts
 * never appear, archived versions only by id, another institute's timetable is invisible,
 * published slots cannot be changed, and the route follows the P2T flag.
 *
 * Needs the timetable tables. Until INT writes their migration (requests/…-p2t-timetable-
 * migration.md) CI has none, so the suite is skipped there; locally run
 * `prisma db push` + the RLS SQL from that request first.
 */
import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import type { Prisma } from '@slotwise/db';
import { TimetableReadResponseV1 } from '@slotwise/shared/contracts';
import {
  demoPublishedTimetable,
  demoTermSnapshot,
  demoTermSolution,
} from '@slotwise/shared/fixtures';
import { slotsFromPlacements } from '@slotwise/shared/timetable';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, Fixtures, signToken } from '../../test/helpers';

const fx = new Fixtures();
/** False until the timetable tables exist (CI before INT's migration): tests skip. */
let hasTables = false;

/** A test that skips itself when the timetable tables are missing. */
function live(name: string, fn: () => Promise<void>): void {
  it(name, async (ctx) => {
    if (!hasTables) ctx.skip('timetable tables are not migrated yet');
    await fn();
  });
}

const snapshot = demoTermSnapshot();
const solution = demoTermSolution();
const fixture = demoPublishedTimetable();
/** The section the published-timetable fixture shows. */
const sectionId = fixture.slots
  .map((s) => s.sectionIds)
  .reduce((acc, ids) => acc.filter((id) => ids.includes(id)))[0]!;

let app: INestApplication;
let a: Awaited<ReturnType<Fixtures['institute']>>;
let b: Awaited<ReturnType<Fixtures['institute']>>;
const tokens = new Map<string, string>();
const u = {} as Record<'student' | 'outsider', { id: string }>;
const ids = {} as Record<'term' | 'termB' | 'published' | 'archived' | 'draft', string>;

function as(userId: string, slug: string) {
  return (path: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('x-institute-slug', slug)
      .set('authorization', `Bearer ${tokens.get(userId)}`);
}

async function term(instituteId: string): Promise<string> {
  const session = await fx.owner.academicSession.create({
    data: { instituteId, name: '2026-27', startYear: 2026 },
  });
  const t = await fx.owner.term.create({
    data: {
      instituteId,
      sessionId: session.id,
      kind: 'odd',
      label: snapshot.term.label,
      startDate: new Date(`${snapshot.term.startDate}T00:00:00Z`),
      endDate: new Date(`${snapshot.term.endDate}T00:00:00Z`),
    },
  });
  return t.id;
}

/** A version with every fixture slot; published ones get `number`. */
async function version(
  instituteId: string,
  termId: string,
  status: 'draft' | 'published' | 'archived',
  number: number | null,
  createdById: string,
): Promise<string> {
  const hash = createHash('sha256').update(`${instituteId}:${status}:${number}`).digest('hex');
  const snap = await fx.owner.timetableSnapshot.create({
    data: { instituteId, termId, hash, data: snapshot as unknown as Prisma.InputJsonValue },
  });
  const v = await fx.owner.timetableVersion.create({
    data: { instituteId, termId, snapshotId: snap.id, cohortIds: [], createdById },
  });
  await fx.owner.timetableSlot.createMany({
    data: slotsFromPlacements(snapshot, solution.placed).map((slot) => ({
      ...slot,
      faculty: slot.faculty as unknown as Prisma.InputJsonValue,
      instituteId,
      versionId: v.id,
    })),
  });
  if (status !== 'draft') {
    await fx.owner.timetableVersion.update({
      where: { id: v.id },
      data: {
        status,
        number,
        publishedAt: new Date(Date.UTC(2026, 6, number ?? 1)),
        validFrom: new Date(`${snapshot.term.startDate}T00:00:00Z`),
        archivedAt: status === 'archived' ? new Date() : null,
      },
    });
  }
  return v.id;
}

describe('timetable-read.v1', () => {
  beforeAll(async () => {
    const [check] = await fx.owner.$queryRaw<{ ok: boolean }[]>`
      SELECT to_regclass('timetable_slots') IS NOT NULL AS ok`;
    hasTables = check?.ok === true;
    if (!hasTables) return;
    let env;
    ({ app, env } = await createTestApp());
    a = await fx.institute('tt-a');
    b = await fx.institute('tt-b');
    u.student = await fx.user('tt-student');
    u.outsider = await fx.user('tt-outsider');
    for (const user of Object.values(u)) tokens.set(user.id, await signToken(env, user.id));
    await fx.grant(u.student.id, 'student', a.institute.id, { type: 'institute' });
    await fx.grant(u.outsider.id, 'institute_admin', b.institute.id, { type: 'institute' });

    ids.term = await term(a.institute.id);
    ids.termB = await term(b.institute.id);
    ids.archived = await version(a.institute.id, ids.term, 'archived', 1, u.student.id);
    ids.published = await version(a.institute.id, ids.term, 'published', 2, u.student.id);
    ids.draft = await version(a.institute.id, ids.term, 'draft', null, u.student.id);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    if (hasTables) {
      // Not yet in purgeInstitute()'s table list (requests/…-p2t-timetable-migration.md).
      const instituteId = { in: [a.institute.id, b.institute.id] };
      await fx.owner.timetableVersion.deleteMany({ where: { instituteId } });
      await fx.owner.timetableSnapshot.deleteMany({ where: { instituteId } });
    }
    await fx.cleanup();
  });

  const read = (query: string, user = u.student.id, slug = a.institute.slug) =>
    as(user, slug)(`/terms/${ids.term}/timetable?${query}`);

  live("reads a section's published week, matching the contract and the fixture", async () => {
    const res = await read(`sectionId=${sectionId}`);
    expect(res.status).toBe(200);
    const body = TimetableReadResponseV1.parse(res.body);
    expect(body.version).toMatchObject({ id: ids.published, number: 2, status: 'published' });
    expect(body.slots).toHaveLength(fixture.slots.length);
    expect(body.slots.every((s) => s.versionId === ids.published)).toBe(true);
  });

  live('reads a sub-group, a faculty member and a room', async () => {
    const group = snapshot.subGroups.find((g) => g.sectionId === sectionId)!;
    const sub = TimetableReadResponseV1.parse((await read(`subGroupId=${group.id}`)).body);
    expect(sub.slots.some((s) => s.target.kind === 'section')).toBe(true);
    expect(sub.slots.every((s) => s.target.kind !== 'subgroup' || s.target.id === group.id)).toBe(
      true,
    );

    const teacher = fixture.slots[0]!.faculty[0]!.id;
    const byFaculty = TimetableReadResponseV1.parse((await read(`facultyId=${teacher}`)).body);
    expect(byFaculty.slots.length).toBeGreaterThan(0);

    const room = fixture.slots[0]!.room!.id;
    const byRoom = TimetableReadResponseV1.parse((await read(`roomId=${room}`)).body);
    expect(byRoom.slots.every((s) => s.room?.id === room)).toBe(true);
  });

  live('reads an archived version by id, never a draft', async () => {
    const archived = await read(`sectionId=${sectionId}&versionId=${ids.archived}`);
    expect(archived.status).toBe(200);
    expect(archived.body.version).toMatchObject({ id: ids.archived, status: 'archived' });

    const draft = await read(`sectionId=${sectionId}&versionId=${ids.draft}`);
    expect(draft.status).toBe(404);
  });

  live('asks for exactly one of section, sub-group, faculty or room', async () => {
    expect((await read('')).status).toBe(400);
    expect((await read(`sectionId=${sectionId}&roomId=${sectionId}`)).status).toBe(400);
  });

  live('returns no version for a term with nothing published', async () => {
    const res = await as(
      u.outsider.id,
      b.institute.slug,
    )(`/terms/${ids.termB}/timetable?sectionId=${sectionId}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ contract: 'timetable-read.v1', version: null, slots: [] });
  });

  live("never shows another institute's timetable", async () => {
    const res = await read(`sectionId=${sectionId}`, u.outsider.id, b.institute.slug);
    expect(res.status).toBe(404);
  });

  live('keeps published slots unchangeable in the database', async () => {
    await expect(
      fx.owner.timetableSlot.updateMany({
        where: { versionId: ids.published },
        data: { locked: true },
      }),
    ).rejects.toThrow(/Published timetables cannot be changed/);
  });

  live('is 404 while the P2T flag is off', async () => {
    process.env.FLAG_P2T = '0';
    try {
      expect((await read(`sectionId=${sectionId}`)).status).toBe(404);
    } finally {
      delete process.env.FLAG_P2T;
    }
  });
});
