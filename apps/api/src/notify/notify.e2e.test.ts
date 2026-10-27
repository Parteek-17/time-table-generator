/**
 * Notifications end to end: a class cancelled by hand, a holiday (one notice, not one per
 * class) and a make-up each queue one email request; delivering it mails every person once
 * (duplicates and a second run are skipped); past dates send nothing; a failed send is retried.
 *
 * The queue is replaced by an in-memory list (no Redis), recipients by a fake recipients.v1,
 * mail by the test app's FakeMail. Needs P4's tables (skipped until migrated).
 */
import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NOTIFY_REQUESTED_V1, NOTIFY_V1 } from '@slotwise/shared/contracts';
import {
  addDays,
  todayIn,
  weekStart,
  type CancellationDto,
  type MakeUpOptionsDto,
  type RecipientsQueryV1,
  type RecipientV1,
} from '@slotwise/shared/reschedule';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp, Fixtures, signToken, type FakeMail } from '../../test/helpers';
import {
  csB,
  fixturePublished,
  fixtureSnapshot,
  useFixtureTermSource,
} from '../reschedule/fake-term-source';
import { NotifyService, type NotifyJobData } from './notify.service';
import { RecipientsSource } from './recipients.source';

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

const STUDENTS: RecipientV1[] = [
  { userId: null, email: 'asha@p4-notify.test', name: 'Asha', kind: 'student' },
  { userId: null, email: 'ravi@p4-notify.test', name: 'Ravi', kind: 'student' },
  // Same person twice (another section of the same elective): mailed once.
  { userId: null, email: 'ASHA@p4-notify.test', name: 'Asha', kind: 'student' },
  { userId: null, email: null, name: 'No email yet', kind: 'student' },
];
const TEACHER: RecipientV1 = {
  userId: null,
  email: 'teacher@p4-notify.test',
  name: 'Teacher',
  kind: 'faculty',
};

const firstOn = (weekday: number) =>
  fixturePublished.slots
    .filter((s) => s.weekday === weekday && s.component === 'lecture')
    .sort((a, b) => a.startMinute - b.startMinute)[0]!;
const thisMonday = weekStart(todayIn(new Date(), fixtureSnapshot.timezone));
const nextWeek = (weekday: number) => addDays(thisMonday, 7 + weekday - 1);

let app: INestApplication;
let mail: FakeMail;
let notify: NotifyService;
let a: Awaited<ReturnType<Fixtures['institute']>>;
let coord: { id: string };
let token = '';
let termId = '';
const jobs: NotifyJobData[] = [];
const queries: RecipientsQueryV1[] = [];

const http = () => request(app.getHttpServer());
const post = (path: string, body: object) =>
  http()
    .post(path)
    .set('x-institute-slug', a.institute.slug)
    .set('authorization', `Bearer ${token}`)
    .send(body);
const get = (path: string) =>
  http()
    .get(path)
    .set('x-institute-slug', a.institute.slug)
    .set('authorization', `Bearer ${token}`);

async function cancel(weekday: number, date: string): Promise<CancellationDto> {
  const res = await post(`/terms/${termId}/cancellations`, {
    sectionId: csB,
    slotId: firstOn(weekday).id,
    date,
    reason: 'Teacher unwell',
  });
  expect(res.status).toBe(201);
  return res.body as CancellationDto;
}

describe('notifications', () => {
  beforeAll(async () => {
    const [check] = await fx.owner.$queryRaw<{ ok: boolean }[]>`
      SELECT to_regclass('notification_deliveries') IS NOT NULL AS ok`;
    hasTables = check?.ok === true;
    if (!hasTables) return;
    let env;
    ({ app, env, mail } = await createTestApp());
    useFixtureTermSource(app);
    notify = app.get(NotifyService);
    // No Redis in tests: queued jobs land in a list; delivery runs them by hand.
    Object.assign(notify, {
      started: true,
      queue: { add: async (_name: string, data: NotifyJobData) => void jobs.push(data) },
    });
    Object.assign(app.get(RecipientsSource), {
      resolve: async ({ query }: { query: RecipientsQueryV1 }) => {
        queries.push(query);
        return [
          ...((query.sectionIds ?? []).includes(csB) ? STUDENTS : []),
          ...((query.facultyIds ?? []).length > 0 ? [TEACHER] : []),
        ];
      },
    });
    a = await fx.institute('p4-notify');
    coord = await fx.user('p4-notify-coord');
    token = await signToken(env, coord.id);
    await fx.grant(coord.id, 'timetable_coordinator', a.institute.id, { type: 'institute' });
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
    jobs.length = 0;
    queries.length = 0;
    mail.sent.length = 0;
  });

  afterAll(async () => {
    await app?.close();
    if (hasTables && a) {
      const instituteId = a.institute.id;
      await fx.owner.notificationDelivery.deleteMany({ where: { instituteId } });
      await fx.owner.makeUp.deleteMany({ where: { instituteId } });
      await fx.owner.cancellation.deleteMany({ where: { instituteId } });
      await fx.owner.disruption.deleteMany({ where: { instituteId } });
    }
    await fx.cleanup();
  });

  let handCancelled: CancellationDto;

  live('a class cancelled by hand mails its students and teacher once', async () => {
    handCancelled = await cancel(3, nextWeek(3));
    await vi.waitFor(() => expect(jobs).toHaveLength(1));
    const job = jobs[0]!;
    expect(job.actorUserId).toBe(coord.id);
    expect(job.request).toMatchObject({
      version: NOTIFY_V1,
      templateKey: 'p4.classCancelled',
      idempotencyKey: `p4.classCancelled:${handCancelled.id}`,
      recipients: { sectionIds: handCancelled.slot.sectionIds },
    });

    expect(await notify.deliver(job)).toEqual({ sent: 3, failed: 0, skipped: 0 });
    expect(mail.sent.map((m) => m.to).sort()).toEqual([
      'asha@p4-notify.test',
      'ravi@p4-notify.test',
      'teacher@p4-notify.test',
    ]);
    expect(mail.sent[0]!.subject).toMatch(/^Class cancelled: /);
    expect(mail.sent[0]!.text).toContain('Reason: Teacher unwell.');

    // A re-delivered job sends nothing again.
    expect(await notify.deliver(job)).toEqual({ sent: 0, failed: 0, skipped: 3 });
    expect(mail.sent).toHaveLength(3);
  });

  live('a holiday sends one notice, not one per class', async () => {
    const day = nextWeek(4);
    const res = await post(`/terms/${termId}/disruptions`, {
      kind: 'holiday',
      title: 'Founders day',
      startDate: day,
      endDate: day,
    });
    expect(res.status).toBe(201);
    const count = fixturePublished.slots.filter((s) => s.weekday === 4).length;
    expect(res.body.cancelled).toBe(count);
    await vi.waitFor(() => expect(jobs).toHaveLength(1));
    expect(jobs[0]!.request).toMatchObject({
      templateKey: 'p4.classesCancelled',
      data: { title: 'Founders day', count },
    });
    await notify.deliver(jobs[0]!);
    expect(mail.sent).toHaveLength(3);
    expect(mail.sent[0]!.text).toContain(`Founders day (`);
  });

  live('a make-up booked tells the same people where and when', async () => {
    const found = (await get(`/cancellations/${handCancelled.id}/make-up-options`))
      .body as MakeUpOptionsDto;
    const pick = found.options[0]!;
    const res = await post(`/cancellations/${handCancelled.id}/make-up`, {
      date: pick.date,
      startPeriodIndex: pick.startPeriodIndex,
      roomId: pick.roomId,
    });
    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(jobs).toHaveLength(1));
    expect(jobs[0]!.request.templateKey).toBe('p4.makeUpBooked');
    await notify.deliver(jobs[0]!);
    expect(mail.sent).toHaveLength(3);
    expect(mail.sent[0]!.text).toContain(`room ${pick.roomCode}`);
  });

  live('nothing is sent for a class in the past', async () => {
    await cancel(2, addDays(thisMonday, -6));
    // Give the listener a moment; it should decide not to queue anything.
    await new Promise((r) => setTimeout(r, 1500));
    expect(jobs).toHaveLength(0);
  });

  live('a failed send is retried; other streams’ unknown templates are refused', async () => {
    const send = mail.send.bind(mail);
    let failNext = true;
    mail.send = async (m) => {
      if (failNext && m.to === 'ravi@p4-notify.test') {
        failNext = false;
        return false;
      }
      return send(m);
    };
    await cancel(5, nextWeek(5));
    await vi.waitFor(() => expect(jobs).toHaveLength(1));
    expect(await notify.deliver(jobs[0]!)).toEqual({ sent: 2, failed: 1, skipped: 0 });
    expect(await notify.deliver(jobs[0]!)).toEqual({ sent: 1, failed: 0, skipped: 2 });
    mail.send = send;

    jobs.length = 0;
    app.get(EventEmitter2).emit(NOTIFY_REQUESTED_V1, {
      version: NOTIFY_V1,
      idempotencyKey: 'p6.seatNotice:unknown-1',
      instituteId: a.institute.id,
      templateKey: 'p6.seatNotice',
      recipients: { sectionIds: [csB] },
      data: {},
    });
    await new Promise((r) => setTimeout(r, 500));
    expect(jobs).toHaveLength(0);
  });
});
