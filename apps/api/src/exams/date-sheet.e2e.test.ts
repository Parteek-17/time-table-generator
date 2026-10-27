/**
 * Date sheets end to end: create an exam, add sessions and papers, see student counts and
 * section clashes in plain words, refuse duplicates and changes to published seating, who may
 * change it, and another institute never seeing it.
 *
 * Needs the exam tables (prisma db push locally until INT's migration); skipped without them.
 */
import type { INestApplication } from '@nestjs/common';
import type {
  DateSheetChoicesDto,
  DateSheetDto,
  ExamSummaryDto,
  ExamTermDto,
} from '@slotwise/shared/exams';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, Fixtures, signToken } from '../../test/helpers';
import { examWorld, purgeExams } from './exams.fixtures';

const fx = new Fixtures();
let hasTables = false;
let app: INestApplication;
let a: Awaited<ReturnType<Fixtures['institute']>>;
let other: Awaited<ReturnType<Fixtures['institute']>>;
let world: Awaited<ReturnType<typeof examWorld>>;
const tokens = new Map<string, string>();
const u = {} as Record<'admin' | 'faculty' | 'otherAdmin', { id: string }>;

function live(name: string, fn: () => Promise<void>): void {
  it(
    name,
    async (ctx) => {
      if (!hasTables) ctx.skip('exam tables are not migrated yet');
      await fn();
    },
    60_000,
  );
}

function as(userId: string, slug = a.institute.slug) {
  const http = request(app.getHttpServer());
  const prep = (req: request.Test) =>
    req.set('x-institute-slug', slug).set('authorization', `Bearer ${tokens.get(userId)}`);
  return {
    get: (path: string) => prep(http.get(path)),
    post: (path: string, body: object = {}) => prep(http.post(path)).send(body),
    patch: (path: string, body: object = {}) => prep(http.patch(path)).send(body),
    delete: (path: string) => prep(http.delete(path)),
  };
}

describe('date sheet', () => {
  beforeAll(async () => {
    const [check] = await fx.owner.$queryRaw<{ ok: boolean }[]>`
      SELECT to_regclass('exam_papers') IS NOT NULL AS ok`;
    hasTables = check?.ok === true;
    if (!hasTables) return;
    let env;
    ({ app, env } = await createTestApp());
    a = await fx.institute('exams-a');
    other = await fx.institute('exams-b');
    world = await examWorld(fx.owner, a.institute.id, a.cse.id);
    for (const key of ['admin', 'faculty', 'otherAdmin'] as const) {
      u[key] = await fx.user(`exams-${key}`);
      tokens.set(u[key].id, await signToken(env, u[key].id));
    }
    await fx.grant(u.admin.id, 'institute_admin', a.institute.id, { type: 'institute' });
    await fx.grant(u.faculty.id, 'faculty', a.institute.id, { type: 'institute' });
    await fx.grant(u.otherAdmin.id, 'institute_admin', other.institute.id, { type: 'institute' });
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    if (hasTables) {
      for (const i of [a, other]) if (i) await purgeExams(fx.owner, i.institute.id);
    }
    await fx.cleanup();
  });

  const ids = { exam: '', morning: '', evening: '', paper: '' };

  live('an admin creates an exam with seating defaults', async () => {
    const res = await as(u.admin.id).post('/exams', {
      termId: world.term.id,
      name: 'End-semester exams, Dec 2026',
    });
    expect(res.status).toBe(201);
    const exam = res.body as ExamSummaryDto;
    expect(exam).toMatchObject({
      name: 'End-semester exams, Dec 2026',
      status: 'draft',
      reserveSeatsPerHall: 0,
      studentsPerInvigilator: 30,
      minInvigilatorsPerHall: 1,
      sessionCount: 0,
      firstDate: null,
    });
    ids.exam = exam.id;
  });

  live('the screens get terms, courses taught, sections and exam rooms to pick from', async () => {
    const terms = (await as(u.admin.id).get('/exams/terms')).body as ExamTermDto[];
    expect(terms.map((t) => t.label)).toEqual(['July–Dec 2026']);
    const choices = (await as(u.admin.id).get(`/exams/${ids.exam}/choices`))
      .body as DateSheetChoicesDto;
    expect(choices.courses).toEqual([
      expect.objectContaining({ code: 'CS301', sectionIds: [world.sections.a.id] }),
    ]);
    expect(choices.sections.map((s) => [s.name, s.studentCount])).toEqual([
      ['CS A', 5],
      ['CS B', 4],
    ]);
    // The lab has no exam seats; ground floor first.
    expect(choices.rooms.map((r) => [r.code, r.examSeats, r.isAccessible])).toEqual([
      ['G1', 6, true],
      ['F1', 6, false],
    ]);
  });

  live('sessions and papers build the date sheet with student counts', async () => {
    const admin = as(u.admin.id);
    const morning = await admin.post(`/exams/${ids.exam}/sessions`, {
      date: '2026-12-01',
      label: 'Morning',
      startMinute: 600,
      endMinute: 780,
    });
    expect(morning.status).toBe(201);
    ids.morning = morning.body.id;
    const evening = await admin.post(`/exams/${ids.exam}/sessions`, {
      date: '2026-12-01',
      label: 'Evening',
      startMinute: 840,
      endMinute: 1020,
    });
    ids.evening = evening.body.id;

    const paper = await admin.post(`/exams/${ids.exam}/papers`, {
      sessionId: ids.morning,
      courseId: world.courses.cs301.id,
      sectionIds: [world.sections.a.id, world.sections.b.id],
    });
    expect(paper.status).toBe(201);
    ids.paper = paper.body.id;

    const sheet = (await admin.get(`/exams/${ids.exam}/date-sheet`)).body as DateSheetDto;
    expect(sheet.exam).toMatchObject({ sessionCount: 2, paperCount: 1, firstDate: '2026-12-01' });
    expect(sheet.sessions.map((s) => s.label)).toEqual(['Morning', 'Evening']);
    expect(sheet.sessions[0]?.papers).toEqual([
      expect.objectContaining({
        code: 'CS301',
        sectionNames: ['CS A', 'CS B'],
        // 5 active in CS A (one left) + 4 in CS B.
        studentCount: 9,
      }),
    ]);
    expect(sheet.problems).toEqual([]);
  });

  live('a section writing two papers in one session is a problem in plain words', async () => {
    const admin = as(u.admin.id);
    const res = await admin.post(`/exams/${ids.exam}/papers`, {
      sessionId: ids.morning,
      courseId: world.courses.ma301.id,
      sectionIds: [world.sections.a.id],
    });
    expect(res.status).toBe(201);
    const sheet = (await admin.get(`/exams/${ids.exam}/date-sheet`)).body as DateSheetDto;
    expect(sheet.problems.map((p) => p.message)).toEqual([
      'CS A has CS301 and MA301 in the same session (Tue 1 Dec, Morning).',
    ]);
    // Moving it to the evening fixes it.
    const moved = await admin.patch(`/exams/papers/${res.body.id}`, { sessionId: ids.evening });
    expect(moved.status).toBe(204);
    const after = (await admin.get(`/exams/${ids.exam}/date-sheet`)).body as DateSheetDto;
    expect(after.problems).toEqual([]);
  });

  live('duplicates and bad input are refused with a reason', async () => {
    const admin = as(u.admin.id);
    const twice = await admin.post(`/exams/${ids.exam}/papers`, {
      sessionId: ids.evening,
      courseId: world.courses.cs301.id,
      sectionIds: [world.sections.a.id],
    });
    expect(twice.status).toBe(409);
    expect(twice.body.message).toBe(
      'CS301 is already on this date sheet. Move it instead of adding it again.',
    );
    const session = await admin.post(`/exams/${ids.exam}/sessions`, {
      date: '2026-12-01',
      label: 'Morning',
      startMinute: 600,
      endMinute: 780,
    });
    expect(session.status).toBe(409);
    expect(session.body.message).toBe('There is already a Morning session on Tue 1 Dec.');
    const backwards = await admin.post(`/exams/${ids.exam}/sessions`, {
      date: '2026-12-02',
      label: 'Morning',
      startMinute: 780,
      endMinute: 600,
    });
    expect(backwards.status).toBe(400);
    expect(backwards.body.fieldErrors.endMinute).toEqual(['The session must end after it starts.']);
  });

  live('a session with published seating cannot be changed', async () => {
    const plan = await fx.owner.seatingPlan.create({
      data: {
        instituteId: a.institute.id,
        sessionId: ids.morning,
        status: 'published',
        createdById: u.admin.id,
      },
    });
    const res = await as(u.admin.id).delete(`/exams/papers/${ids.paper}`);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Seating for this session is published/);
    await fx.owner.seatingPlan.delete({ where: { id: plan.id } });
  });

  live('faculty read the date sheet but cannot change it', async () => {
    const faculty = as(u.faculty.id);
    expect((await faculty.get(`/exams/${ids.exam}/date-sheet`)).status).toBe(200);
    expect((await faculty.post('/exams', { termId: world.term.id, name: 'X' })).status).toBe(403);
    expect((await faculty.delete(`/exams/papers/${ids.paper}`)).status).toBe(403);
  });

  live('another institute never sees it', async () => {
    const res = await as(u.otherAdmin.id, other.institute.slug).get(
      `/exams/${ids.exam}/date-sheet`,
    );
    expect(res.status).toBe(404);
    const list = await as(u.otherAdmin.id, other.institute.slug).get('/exams');
    expect(list.body).toEqual([]);
  });

  live('removing an exam hides it', async () => {
    const admin = as(u.admin.id);
    expect((await admin.delete(`/exams/${ids.exam}`)).status).toBe(204);
    expect((await admin.get(`/exams/${ids.exam}/date-sheet`)).status).toBe(404);
    expect((await admin.get(`/exams?termId=${world.term.id}`)).body).toEqual([]);
  });
});
