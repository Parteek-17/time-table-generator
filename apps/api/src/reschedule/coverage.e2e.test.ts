/**
 * Syllabus coverage end to end: CS B's courses from the fixture timetable, a cancelled class
 * lowering its course's delivered periods, its make-up giving them back, and who may read.
 * Needs P4's tables (skipped until migrated).
 */
import type { INestApplication } from '@nestjs/common';
import {
  addDays,
  todayIn,
  weekStart,
  type CancellationDto,
  type CoverageDto,
  type CoverageRow,
  type MakeUpOptionsDto,
} from '@slotwise/shared/reschedule';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

let app: INestApplication;
let a: Awaited<ReturnType<Fixtures['institute']>>;
const tokens = new Map<string, string>();
const u = {} as Record<'coord' | 'student', { id: string }>;
let termId = '';

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

const lecture = fixturePublished.slots.find((s) => s.component === 'lecture' && s.weekday === 2)!;
const nextTuesday = addDays(weekStart(todayIn(new Date(), fixtureSnapshot.timezone)), 8);
const rowOf = (body: CoverageDto): CoverageRow =>
  body.rows.find((r) => r.course.id === lecture.course.id && r.audience.id === csB)!;

describe('syllabus coverage', () => {
  beforeAll(async () => {
    const [check] = await fx.owner.$queryRaw<{ ok: boolean }[]>`
      SELECT to_regclass('cancellations') IS NOT NULL AS ok`;
    hasTables = check?.ok === true;
    if (!hasTables) return;
    let env;
    ({ app, env } = await createTestApp());
    useFixtureTermSource(app);
    a = await fx.institute('p4-cov');
    for (const key of ['coord', 'student'] as const) {
      u[key] = await fx.user(`p4-cov-${key}`);
      tokens.set(u[key].id, await signToken(env, u[key].id));
    }
    await fx.grant(u.coord.id, 'timetable_coordinator', a.institute.id, { type: 'institute' });
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
          label: fixtureSnapshot.term.label,
          startDate: new Date(`${fixtureSnapshot.term.startDate}T00:00:00Z`),
          endDate: new Date('2027-06-30T00:00:00Z'),
        },
      })
    ).id;
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    if (hasTables && a) {
      const instituteId = a.institute.id;
      await fx.owner.makeUp.deleteMany({ where: { instituteId } });
      await fx.owner.cancellation.deleteMany({ where: { instituteId } });
    }
    await fx.cleanup();
  });

  live('a cancelled class lowers coverage and its make-up gives it back', async () => {
    const before = await as(u.coord.id).get(`/terms/${termId}/coverage?sectionId=${csB}`);
    expect(before.status).toBe(200);
    const start = rowOf(before.body as CoverageDto);
    expect(start).toMatchObject({ audience: { kind: 'section', name: 'CS B' }, lost: 0 });
    expect(start.scheduled).toBeGreaterThan(0);

    const cancelled = await as(u.coord.id).post(`/terms/${termId}/cancellations`, {
      sectionId: csB,
      slotId: lecture.id,
      date: nextTuesday,
      reason: 'Teacher unwell',
    });
    expect(cancelled.status).toBe(201);
    const c = cancelled.body as CancellationDto;
    const after = rowOf(
      (await as(u.coord.id).get(`/terms/${termId}/coverage?sectionId=${csB}`)).body,
    );
    expect(after).toMatchObject({
      lost: lecture.length,
      delivered: start.delivered - lecture.length,
    });

    const options = (await as(u.coord.id).get(`/cancellations/${c.id}/make-up-options`))
      .body as MakeUpOptionsDto;
    const pick = options.options[0]!;
    const booked = await as(u.coord.id).post(`/cancellations/${c.id}/make-up`, {
      date: pick.date,
      startPeriodIndex: pick.startPeriodIndex,
      roomId: pick.roomId,
    });
    expect(booked.status).toBe(201);
    const made = rowOf(
      (await as(u.student.id).get(`/terms/${termId}/coverage?sectionId=${csB}`)).body,
    );
    expect(made).toMatchObject({
      lost: lecture.length,
      madeUp: lecture.length,
      delivered: start.delivered,
    });
  });

  live('checks the filter', async () => {
    const res = await as(u.coord.id).get(
      `/terms/${termId}/coverage?sectionId=${csB}&departmentId=${csB}`,
    );
    expect(res.status).toBe(400);
  });
});
