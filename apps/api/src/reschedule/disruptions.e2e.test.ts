/**
 * Holidays and events end to end: an institute event cancels the published classes in its
 * dates, a second overlapping one leaves them alone, undo gives back only what no other
 * disruption covers, single classes are cancelled and restored by hand, events go out once per
 * class, and who may do what.
 *
 * The term's setup and published timetable come from the fixtures (CS B's week) through a
 * fake TermSource (fake-term-source.ts); P4 reads them only through the contracts anyway. Needs P4's tables; skipped
 * until INT's migration is in (requests/2026-10-27-p4-reschedule-migration.md).
 */
import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { EventPayloadV1 } from '@slotwise/shared/contracts';
import type {
  CancellationDto,
  CreateDisruptionResult,
  DisruptionDto,
  UndoDisruptionResult,
} from '@slotwise/shared/reschedule';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, Fixtures, signToken } from '../../test/helpers';
import {
  csB,
  csBDepartment,
  fixturePublished,
  fixtureSnapshot,
  useFixtureTermSource,
} from './fake-term-source';

const fx = new Fixtures();
let hasTables = false;

function live(name: string, fn: () => Promise<void>): void {
  it(
    name,
    async (ctx) => {
      if (!hasTables) ctx.skip('rescheduling tables are not migrated yet');
      await fn();
    },
    60_000,
  );
}

const snapshot = fixtureSnapshot;
const published = fixturePublished;
const csBDept = csBDepartment;
const onDay = (weekday: number) => published.slots.filter((s) => s.weekday === weekday);

let app: INestApplication;
let a: Awaited<ReturnType<Fixtures['institute']>>;
let b: Awaited<ReturnType<Fixtures['institute']>>;
const tokens = new Map<string, string>();
const u = {} as Record<'coord' | 'faculty' | 'deptCoord' | 'otherCoord', { id: string }>;
let termId = '';
const disrupted: EventPayloadV1<'disruption.created'>[] = [];
const cancelled: EventPayloadV1<'class.cancelled'>[] = [];

function as(userId: string, slug = a.institute.slug) {
  const http = request(app.getHttpServer());
  const prep = (req: request.Test) =>
    req.set('x-institute-slug', slug).set('authorization', `Bearer ${tokens.get(userId)}`);
  return {
    get: (path: string) => prep(http.get(path)),
    post: (path: string, body: object = {}) => prep(http.post(path)).send(body),
    delete: (path: string) => prep(http.delete(path)),
  };
}

const fest = {
  kind: 'event',
  title: 'Annual fest',
  startDate: '2026-10-07', // Wednesday
  endDate: '2026-10-08', // Thursday
};

describe('holidays, events and cancelled classes', () => {
  beforeAll(async () => {
    const [check] = await fx.owner.$queryRaw<{ ok: boolean }[]>`
      SELECT to_regclass('disruptions') IS NOT NULL AS ok`;
    hasTables = check?.ok === true;
    if (!hasTables) return;
    let env;
    ({ app, env } = await createTestApp());
    useFixtureTermSource(app);
    const events = app.get(EventEmitter2);
    events.on('disruption.created', (e: EventPayloadV1<'disruption.created'>) => disrupted.push(e));
    events.on('class.cancelled', (e: EventPayloadV1<'class.cancelled'>) => cancelled.push(e));
    a = await fx.institute('p4-a');
    b = await fx.institute('p4-b');
    for (const key of ['coord', 'faculty', 'deptCoord', 'otherCoord'] as const) {
      u[key] = await fx.user(`p4-${key}`);
      tokens.set(u[key].id, await signToken(env, u[key].id));
    }
    await fx.grant(u.coord.id, 'timetable_coordinator', a.institute.id, { type: 'institute' });
    await fx.grant(u.faculty.id, 'faculty', a.institute.id, { type: 'institute' });
    await fx.grant(u.deptCoord.id, 'timetable_coordinator', a.institute.id, {
      type: 'department',
      id: a.cse.id,
    });
    await fx.grant(u.otherCoord.id, 'timetable_coordinator', b.institute.id, {
      type: 'institute',
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
  }, 60_000);

  beforeEach(() => {
    disrupted.length = 0;
    cancelled.length = 0;
  });

  afterAll(async () => {
    await app?.close();
    if (hasTables && a) {
      const instituteId = a.institute.id;
      await fx.owner.makeUp.deleteMany({ where: { instituteId } });
      await fx.owner.cancellation.deleteMany({ where: { instituteId } });
      await fx.owner.disruption.deleteMany({ where: { instituteId } });
    }
    await fx.cleanup();
  });

  const ids = { fest: '', deptDay: '' };

  live('an institute event cancels every class in its dates, one event per class', async () => {
    const res = await as(u.coord.id).post(`/terms/${termId}/disruptions`, fest);
    expect(res.status).toBe(201);
    const body = res.body as CreateDisruptionResult;
    const expected = onDay(3).length + onDay(4).length;
    expect(expected).toBeGreaterThan(0);
    expect(body).toMatchObject({ cancelled: expected, alreadyCancelled: 0, noTimetable: false });
    expect(body.disruption).toMatchObject({ title: 'Annual fest', scopeType: 'institute' });
    ids.fest = body.disruption.id;

    expect(disrupted).toHaveLength(1);
    expect(disrupted[0]).toMatchObject({
      disruptionId: ids.fest,
      kind: 'event',
      startDate: '2026-10-07',
    });
    expect(cancelled).toHaveLength(expected);
    expect(new Set(cancelled.map((c) => c.cancellationId)).size).toBe(expected);
    expect(cancelled.every((c) => c.reason === 'Annual fest' && c.disruptionId === ids.fest)).toBe(
      true,
    );
  });

  live('a second event on the same day leaves already cancelled classes alone', async () => {
    const res = await as(u.coord.id).post(`/terms/${termId}/disruptions`, {
      kind: 'event',
      title: 'Industrial visit',
      scopeType: 'department',
      departmentId: csBDept,
      startDate: '2026-10-08',
      endDate: '2026-10-08',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ cancelled: 0, alreadyCancelled: onDay(4).length });
    ids.deptDay = (res.body as CreateDisruptionResult).disruption.id;
    expect(cancelled).toHaveLength(0);

    const list = await as(u.faculty.id).get(`/terms/${termId}/disruptions`);
    expect(list.status).toBe(200);
    expect((list.body as DisruptionDto[]).map((d) => [d.title, d.cancelledCount])).toEqual([
      ['Industrial visit', 0],
      ['Annual fest', onDay(3).length + onDay(4).length],
    ]);
  });

  live('undo gives back classes, except those another event still covers', async () => {
    const res = await as(u.coord.id).delete(`/disruptions/${ids.fest}`);
    expect(res.status).toBe(200);
    expect(res.body as UndoDisruptionResult).toEqual({
      disruptionId: ids.fest,
      restored: onDay(3).length,
      keptByOther: onDay(4).length,
    });
    const left = await as(u.faculty.id).get(`/terms/${termId}/cancellations?sectionId=${csB}`);
    const rows = left.body as CancellationDto[];
    expect(rows).toHaveLength(onDay(4).length);
    expect(rows.every((c) => c.date === '2026-10-08' && c.reason === 'Industrial visit')).toBe(
      true,
    );
    expect(rows.every((c) => c.disruptionId === ids.deptDay)).toBe(true);

    // A second click finds nothing to undo.
    expect((await as(u.coord.id).delete(`/disruptions/${ids.fest}`)).status).toBe(404);
  });

  live('cancels one class by hand, refuses doubles and wrong dates, and undoes it', async () => {
    const friday = onDay(5)[0]!;
    const body = {
      sectionId: csB,
      slotId: friday.id,
      date: '2026-10-09',
      reason: 'Teacher unwell',
    };
    const res = await as(u.coord.id).post(`/terms/${termId}/cancellations`, body);
    expect(res.status).toBe(201);
    const c = res.body as CancellationDto;
    expect(c).toMatchObject({ date: '2026-10-09', reason: 'Teacher unwell', disruptionId: null });
    expect(cancelled).toHaveLength(1);

    const again = await as(u.coord.id).post(`/terms/${termId}/cancellations`, body);
    expect(again.status).toBe(409);
    const thursday = await as(u.coord.id).post(`/terms/${termId}/cancellations`, {
      ...body,
      date: '2026-10-08',
    });
    expect(thursday.status).toBe(400);
    expect(thursday.body.message).toBe('This class doesn’t meet on that date.');

    expect((await as(u.coord.id).delete(`/cancellations/${c.id}`)).status).toBe(200);
    const byDisruption = (
      (await as(u.coord.id).get(`/terms/${termId}/cancellations?from=2026-10-08&to=2026-10-08`))
        .body as CancellationDto[]
    )[0]!;
    const refused = await as(u.coord.id).delete(`/cancellations/${byDisruption.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body.message).toContain('Industrial visit');
  });

  live('checks input and dates in plain words', async () => {
    const res = await as(u.coord.id).post(`/terms/${termId}/disruptions`, {
      ...fest,
      endDate: '2026-10-01',
    });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.endDate).toEqual(['The last day is before the first day.']);
    const outside = await as(u.coord.id).post(`/terms/${termId}/disruptions`, {
      ...fest,
      startDate: '2027-08-02',
      endDate: '2027-08-03',
    });
    expect(outside.status).toBe(400);
    expect(outside.body.message).toMatch(/inside the term/);
  });

  live('who may add and undo', async () => {
    expect((await as(u.faculty.id).post(`/terms/${termId}/disruptions`, fest)).status).toBe(403);
    // A department coordinator may not cancel the whole institute, nor another department.
    expect((await as(u.deptCoord.id).post(`/terms/${termId}/disruptions`, fest)).status).toBe(403);
    const otherDept = await as(u.deptCoord.id).post(`/terms/${termId}/disruptions`, {
      ...fest,
      scopeType: 'department',
      departmentId: csBDept,
    });
    expect(otherDept.status).toBe(403);
    expect(otherDept.body.message).toMatch(/permission/);
    // Another institute's coordinator does not see this one's disruptions at all.
    expect(
      (await as(u.otherCoord.id, b.institute.slug).delete(`/disruptions/${ids.deptDay}`)).status,
    ).toBe(404);
    expect(disrupted).toHaveLength(0);
  });
});
