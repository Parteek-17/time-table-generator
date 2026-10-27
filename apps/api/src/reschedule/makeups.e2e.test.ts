/**
 * Make-ups end to end: free choices for a class cancelled next week (never on top of the
 * section's other classes), booking one with `makeup.approved`, a second class not offered or
 * given the same time, moving and undoing a make-up, a week-long event leaving nothing with a
 * plain reason, and who may book.
 *
 * Fixture setup and CS B's published week through the fake TermSource; dates are relative to
 * today, as make-ups are never offered in the past. Needs P4's tables (skipped until migrated).
 */
import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { EventPayloadV1, TimetableSlotV1 } from '@slotwise/shared/contracts';
import {
  addDays,
  isoWeekday,
  todayIn,
  weekStart,
  type CancellationDto,
  type CreateDisruptionResult,
  type MakeUpDto,
  type MakeUpOptionsDto,
} from '@slotwise/shared/reschedule';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, Fixtures, signToken } from '../../test/helpers';
import { csB, fixturePublished, fixtureSnapshot, useFixtureTermSource } from './fake-term-source';

const fx = new Fixtures();
let hasTables = false;

function live(name: string, fn: () => Promise<void>): void {
  it(
    name,
    async (ctx) => {
      if (!hasTables) ctx.skip('rescheduling tables are not migrated yet');
      await fn();
    },
    90_000,
  );
}

const slots = fixturePublished.slots;
const firstOn = (weekday: number) =>
  slots
    .filter((s) => s.weekday === weekday && s.component === 'lecture')
    .sort((x, y) => x.startMinute - y.startMinute)[0]!;
// Next week, so every period of it is still ahead.
const monday = addDays(weekStart(todayIn(new Date(), fixtureSnapshot.timezone)), 7);
const dateOf = (weekday: number) => addDays(monday, weekday - 1);

let app: INestApplication;
let a: Awaited<ReturnType<Fixtures['institute']>>;
const tokens = new Map<string, string>();
const u = {} as Record<'coord' | 'faculty', { id: string }>;
let termId = '';
const approved: EventPayloadV1<'makeup.approved'>[] = [];

function as(userId: string) {
  const http = request(app.getHttpServer());
  const prep = (req: request.Test) =>
    req
      .set('x-institute-slug', a.institute.slug)
      .set('authorization', `Bearer ${tokens.get(userId)}`);
  return {
    get: (path: string) => prep(http.get(path)),
    post: (path: string, body: object = {}) => prep(http.post(path)).send(body),
    delete: (path: string) => prep(http.delete(path)),
  };
}

async function cancel(slot: TimetableSlotV1, date: string): Promise<CancellationDto> {
  const res = await as(u.coord.id).post(`/terms/${termId}/cancellations`, {
    sectionId: csB,
    slotId: slot.id,
    date,
    reason: 'Teacher unwell',
  });
  expect(res.status).toBe(201);
  return res.body as CancellationDto;
}

const options = async (id: string) =>
  (await as(u.coord.id).get(`/cancellations/${id}/make-up-options`)).body as MakeUpOptionsDto;

/** True if the choice overlaps a published CS B class that still meets (not cancelled). */
function clashesWithTimetable(
  o: { date: string; startMinute: number; endMinute: number },
  cancelledIds: string[],
) {
  return slots.some(
    (s) =>
      !cancelledIds.includes(`${s.id} ${o.date}`) &&
      s.weekday === isoWeekday(o.date) &&
      s.startMinute < o.endMinute &&
      s.endMinute > o.startMinute,
  );
}

describe('make-up classes', () => {
  beforeAll(async () => {
    const [check] = await fx.owner.$queryRaw<{ ok: boolean }[]>`
      SELECT to_regclass('make_ups') IS NOT NULL AS ok`;
    hasTables = check?.ok === true;
    if (!hasTables) return;
    let env;
    ({ app, env } = await createTestApp());
    useFixtureTermSource(app);
    app.get(EventEmitter2).on('makeup.approved', (e: EventPayloadV1<'makeup.approved'>) => {
      approved.push(e);
    });
    a = await fx.institute('p4-mu');
    for (const key of ['coord', 'faculty'] as const) {
      u[key] = await fx.user(`p4-mu-${key}`);
      tokens.set(u[key].id, await signToken(env, u[key].id));
    }
    await fx.grant(u.coord.id, 'timetable_coordinator', a.institute.id, { type: 'institute' });
    await fx.grant(u.faculty.id, 'faculty', a.institute.id, { type: 'institute' });
    const session = await fx.owner.academicSession.create({
      data: { instituteId: a.institute.id, name: '2026-27', startYear: 2026 },
    });
    termId = (
      await fx.owner.term.create({
        data: {
          instituteId: a.institute.id,
          sessionId: session.id,
          kind: 'odd',
          label: fixtureSnapshot.term.label,
          startDate: new Date(`${fixtureSnapshot.term.startDate}T00:00:00Z`),
          endDate: new Date('2027-06-30T00:00:00Z'),
        },
      })
    ).id;
  }, 60_000);

  beforeEach(() => {
    approved.length = 0;
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

  const wed = { id: '', slot: firstOn(3) };
  const thu = { id: '', slot: firstOn(4) };
  let booked: MakeUpDto;

  live('offers free times in the same week first and books one', async () => {
    wed.id = (await cancel(wed.slot, dateOf(3))).id;
    const found = await options(wed.id);
    expect(found.problem).toBeNull();
    expect(found.options.length).toBeGreaterThan(0);
    expect(found.options[0]!.week).toBe('same');
    const cancelledIds = [`${wed.slot.id} ${dateOf(3)}`];
    for (const o of found.options) expect(clashesWithTimetable(o, cancelledIds)).toBe(false);

    const pick = found.options[0]!;
    const res = await as(u.coord.id).post(`/cancellations/${wed.id}/make-up`, {
      date: pick.date,
      startPeriodIndex: pick.startPeriodIndex,
      roomId: pick.roomId,
    });
    expect(res.status).toBe(201);
    booked = res.body as MakeUpDto;
    expect(booked).toMatchObject({ date: pick.date, roomId: pick.roomId, roomCode: pick.roomCode });
    expect(approved).toHaveLength(1);
    expect(approved[0]).toMatchObject({
      cancellationId: wed.id,
      makeUpId: booked.id,
      sectionIds: wed.slot.sectionIds,
      facultyIds: wed.slot.faculty.map((f) => f.id),
    });
  });

  live('a second class is not offered the booked time, and cannot take it', async () => {
    thu.id = (await cancel(thu.slot, dateOf(4))).id;
    const found = await options(thu.id);
    const overlap = found.options.some(
      (o) =>
        o.date === booked.date &&
        o.startMinute < booked.endMinute &&
        o.endMinute > booked.startMinute,
    );
    expect(overlap).toBe(false);

    const res = await as(u.coord.id).post(`/cancellations/${thu.id}/make-up`, {
      date: booked.date,
      startPeriodIndex: booked.startPeriodIndex,
      roomId: booked.roomId,
    });
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(`${thu.slot.target.name} has another class then.`);
    expect(approved).toHaveLength(0);
  });

  live('booking again moves the make-up; undo removes it', async () => {
    const found = await options(wed.id);
    // Its own booking is not a clash: the same time is offered again.
    expect(
      found.options.some((o) => o.date === booked.date && o.startMinute === booked.startMinute),
    ).toBe(true);
    const other = found.options.find(
      (o) => o.date !== booked.date || o.startMinute !== booked.startMinute,
    )!;
    const moved = await as(u.coord.id).post(`/cancellations/${wed.id}/make-up`, {
      date: other.date,
      startPeriodIndex: other.startPeriodIndex,
      roomId: other.roomId,
    });
    expect(moved.status).toBe(201);
    expect(await fx.owner.makeUp.count({ where: { cancellationId: wed.id } })).toBe(1);

    const list = await as(u.faculty.id).get(`/terms/${termId}/cancellations?sectionId=${csB}`);
    const row = (list.body as CancellationDto[]).find((c) => c.id === wed.id)!;
    expect(row.makeUp).toMatchObject({ date: other.date, startMinute: other.startMinute });

    expect((await as(u.coord.id).delete(`/make-ups/${(moved.body as MakeUpDto).id}`)).status).toBe(
      200,
    );
    expect(await fx.owner.makeUp.count({ where: { cancellationId: wed.id } })).toBe(0);
  });

  live('explains when two weeks of events leave no time', async () => {
    const res = await as(u.coord.id).post(`/terms/${termId}/disruptions`, {
      kind: 'event',
      title: 'Annual fest',
      startDate: monday,
      endDate: addDays(monday, 13),
    });
    expect(res.status).toBe(201);
    const fest = res.body as CreateDisruptionResult;
    const list = await as(u.coord.id).get(
      `/terms/${termId}/cancellations?from=${dateOf(5)}&to=${dateOf(5)}`,
    );
    const friday = (list.body as CancellationDto[])[0]!;
    expect(friday.disruptionId).toBe(fest.disruption.id);
    const found = await options(friday.id);
    expect(found.options).toEqual([]);
    expect(found.problem).toBe(
      `${friday.slot.target.name} has no teaching days left in this week or the next.`,
    );
  });

  live('only coordinators book make-ups', async () => {
    expect((await as(u.faculty.id).get(`/cancellations/${thu.id}/make-up-options`)).status).toBe(
      403,
    );
    expect(
      (
        await as(u.faculty.id).post(`/cancellations/${thu.id}/make-up`, {
          date: dateOf(5),
          startPeriodIndex: 1,
          roomId: fixtureSnapshot.rooms[0]!.id,
        })
      ).status,
    ).toBe(403);
  });
});
