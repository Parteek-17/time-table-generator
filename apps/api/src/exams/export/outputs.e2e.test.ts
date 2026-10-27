/**
 * After seating: publishing (one event, the earlier plan archived, undo by publishing it
 * again), the four downloads as Excel (and PDF when a browser is installed), and "my exams"
 * for a student (found by email) and a teacher (by linked login), published plans only.
 *
 * Needs the exam tables and Redis; skipped without the tables.
 */
import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { EventPayloadV1 } from '@slotwise/shared/contracts';
import type { MyExamsDto, SeatingPlanDto } from '@slotwise/shared/exams';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestApp, Fixtures, signToken } from '../../../test/helpers';
import { examWorld, fakeSolve, purgeExams } from '../exams.fixtures';
import { SeatingSolverClient } from '../seating/solver.client';
import { findBrowser } from './pdf';

const fx = new Fixtures();
let hasTables = false;
let app: INestApplication;
let a: Awaited<ReturnType<Fixtures['institute']>>;
let world: Awaited<ReturnType<typeof examWorld>>;
const tokens = new Map<string, string>();
const u = {} as Record<'admin' | 'student' | 'teacher', { id: string; email: string }>;
const published: EventPayloadV1<'exam.seating.published'>[] = [];
const ids = { session: '', first: '', second: '' };

function live(name: string, fn: () => Promise<void>): void {
  it(
    name,
    async (ctx) => {
      if (!hasTables) ctx.skip('exam tables are not migrated yet');
      await fn();
    },
    120_000,
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

const binary = (res: request.Response, done: (e: Error | null, b: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};

async function build(): Promise<string> {
  const res = await as(u.admin.id).post(`/exams/sessions/${ids.session}/seating`, {
    hallIds: [world.rooms.g1.id, world.rooms.f1.id],
  });
  for (let i = 0; i < 120; i++) {
    const plan = (await as(u.admin.id).get(`/exams/seating/${res.body.planId}`))
      .body as SeatingPlanDto;
    if (plan.status === 'ready') return plan.id;
    if (plan.status === 'failed') throw new Error(plan.error ?? 'failed');
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('seating job did not finish');
}

describe('publishing, downloads and my exams', () => {
  beforeAll(async () => {
    const [check] = await fx.owner.$queryRaw<{ ok: boolean }[]>`
      SELECT to_regclass('seating_plans') IS NOT NULL AS ok`;
    hasTables = check?.ok === true;
    if (!hasTables) return;
    let env;
    ({ app, env } = await createTestApp());
    vi.spyOn(app.get(SeatingSolverClient), 'solve').mockImplementation(async (req) =>
      fakeSolve(req),
    );
    app.get(EventEmitter2).on('exam.seating.published', (e) => published.push(e));
    a = await fx.institute('outputs-a');
    world = await examWorld(fx.owner, a.institute.id, a.cse.id);
    for (const key of ['admin', 'student', 'teacher'] as const) {
      u[key] = await fx.user(`outputs-${key}`);
      tokens.set(u[key].id, await signToken(env, u[key].id));
    }
    const instituteId = a.institute.id;
    await fx.grant(u.admin.id, 'institute_admin', instituteId, { type: 'institute' });
    await fx.grant(u.student.id, 'student', instituteId, { type: 'institute' });
    await fx.grant(u.teacher.id, 'faculty', instituteId, { type: 'institute' });
    await fx.owner.student.updateMany({
      where: { instituteId, classRollNo: '24A1' },
      data: { email: u.student.email.toUpperCase() },
    });
    await fx.owner.faculty.update({
      where: { id: world.faculty.chopra.id },
      data: { userId: u.teacher.id },
    });

    // Far in the future, so "today and later" includes it whatever the date of the run.
    const exam = await fx.owner.exam.create({
      data: { instituteId, termId: world.term.id, name: 'End-semester exams' },
    });
    const session = await fx.owner.examSession.create({
      data: {
        instituteId,
        examId: exam.id,
        date: new Date('2099-12-01T00:00:00Z'),
        label: 'Morning',
        startMinute: 600,
        endMinute: 780,
      },
    });
    ids.session = session.id;
    await fx.owner.examPaper.create({
      data: {
        instituteId,
        examId: exam.id,
        sessionId: session.id,
        courseId: world.courses.cs301.id,
        sectionIds: [world.sections.a.id, world.sections.b.id],
      },
    });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    if (hasTables && a) await purgeExams(fx.owner, a.institute.id);
    await fx.cleanup();
  });

  live('nobody sees a seat before it is published', async () => {
    ids.first = await build();
    const mine = (await as(u.student.id).get('/exams/me')).body as MyExamsDto;
    expect(mine).toMatchObject({ shows: 'seats', rollNo: '24A1', seats: [] });
  });

  live('publishing emits one event; publishing another archives the first', async () => {
    const res = await as(u.admin.id).post(`/exams/seating/${ids.first}/publish`);
    expect(res.status).toBe(200);
    expect((res.body as SeatingPlanDto).status).toBe('published');
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      seatingPlanId: ids.first,
      examSessionId: ids.session,
      date: '2099-12-01',
      sessionLabel: 'Morning',
      actorUserId: u.admin.id,
    });
    expect(new Set(published[0]!.roomIds)).toEqual(new Set([world.rooms.g1.id, world.rooms.f1.id]));
    expect(new Set(published[0]!.sectionIds)).toEqual(
      new Set([world.sections.a.id, world.sections.b.id]),
    );
    // A second click changes nothing.
    await as(u.admin.id).post(`/exams/seating/${ids.first}/publish`);
    expect(published).toHaveLength(1);

    ids.second = await build();
    await as(u.admin.id).post(`/exams/seating/${ids.second}/publish`);
    const plans = (await as(u.admin.id).get(`/exams/sessions/${ids.session}/seating`))
      .body as SeatingPlanDto[];
    expect(plans.map((p) => [p.id, p.status])).toEqual([
      [ids.second, 'published'],
      [ids.first, 'archived'],
    ]);
    // Undo: publish the first again.
    await as(u.admin.id).post(`/exams/seating/${ids.first}/publish`);
    expect((await as(u.admin.id).get(`/exams/seating/${ids.second}`)).body.status).toBe('archived');
  });

  live('a published plan cannot be changed in the database either', async () => {
    await expect(
      fx.owner.seatAssignment.updateMany({ where: { planId: ids.first }, data: { row: 9 } }),
    ).rejects.toThrow(/published seating plan cannot be changed/);
  });

  live('a student finds their seat; a teacher finds their duty', async () => {
    const mine = (await as(u.student.id).get('/exams/me')).body as MyExamsDto;
    expect(mine.shows).toBe('seats');
    expect(mine.seats).toHaveLength(1);
    expect(mine.seats[0]).toMatchObject({
      date: '2099-12-01',
      sessionLabel: 'Morning',
      paperCode: 'CS301',
      paperTitle: 'Course CS301',
      building: 'Exam Block',
    });
    expect(mine.seats[0]!.seatLabel).toMatch(/^(G1|F1)-R\d-C\d$/);

    const duty = (await as(u.teacher.id).get('/exams/me')).body as MyExamsDto;
    expect(duty.shows).toBe('duties');
    expect(duty.name).toBe('Mr. Chopra');
    expect(duty.duties.map((d) => [d.date, d.hallCode])).toEqual([['2099-12-01', 'G1']]);
  });

  live('students cannot download hall charts', async () => {
    const res = await as(u.student.id).get(
      `/exams/seating/${ids.first}/export?doc=hall-chart&format=xlsx`,
    );
    expect(res.status).toBe(403);
  });

  live('the four documents download as Excel', async () => {
    for (const doc of ['hall-chart', 'notice', 'attendance', 'duties']) {
      const res = await as(u.admin.id)
        .get(`/exams/seating/${ids.first}/export?doc=${doc}&format=xlsx`)
        .buffer(true)
        .parse(binary);
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toMatch(/2099-12-01-morning\.xlsx"$/);
      const book = new ExcelJS.Workbook();
      await book.xlsx.load(res.body as unknown as ExcelJS.Buffer);
      const sheet = book.worksheets[0]!;
      if (doc === 'hall-chart') {
        expect(book.worksheets.map((s) => s.name)).toEqual([
          'Hall G1 seating chart',
          'Hall F1 seating chart',
        ]);
        expect([sheet.getCell('B3').value, sheet.getCell('C3').value]).toEqual([
          'Seat 1',
          'Seat 2',
        ]);
      }
      if (doc === 'notice') {
        expect(sheet.getCell('A1').value).toBe('Where to sit');
        expect(['A3', 'B3', 'C3', 'D3', 'E3'].map((c) => sheet.getCell(c).value)).toEqual([
          'Paper',
          'Section',
          'Roll numbers',
          'Students',
          'Hall',
        ]);
      }
      if (doc === 'attendance') expect(sheet.getCell('B4').value).toBe('24A1');
      if (doc === 'duties') expect(sheet.getCell('B4').value).toBe('Mr. Chopra');
    }
  });

  live('PDF downloads work when a browser is installed', async () => {
    if (!findBrowser(process.env.PDF_BROWSER_PATH)) return;
    const res = await as(u.admin.id)
      .get(`/exams/seating/${ids.first}/export?doc=notice&format=pdf`)
      .buffer(true)
      .parse(binary);
    expect(res.status).toBe(200);
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });
});
