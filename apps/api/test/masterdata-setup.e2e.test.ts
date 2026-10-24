/**
 * Setup wizard API (milestone 1c): progress that is saved and resumed, "needs attention",
 * permissions, and "Try with sample data" (provisioning mock → institute.created → P1's
 * sample-data queue → the sample institute's master data).
 */
import type { INestApplication } from '@nestjs/common';
import { purgeInstitute } from '@slotwise/db';
import type { SampleInstituteDto, SetupStateDto } from '@slotwise/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SampleDataListener } from '../src/setup/sample-data.listener';
import { createTestApp, Fixtures, signToken } from './helpers';

let app: INestApplication;
const fx = new Fixtures();
const tokens = new Map<string, string>();
let a: Awaited<ReturnType<Fixtures['institute']>>;
const u = {} as Record<'admin' | 'hod', { id: string; email: string }>;
const sampleIds: string[] = [];

function as(userId: string) {
  const http = request(app.getHttpServer());
  const prep = (req: request.Test) =>
    req
      .set('x-institute-slug', a.institute.slug)
      .set('authorization', `Bearer ${tokens.get(userId)}`);
  return {
    get: (path: string) => prep(http.get(path)),
    put: (path: string, body?: object) => prep(http.put(path)).send(body),
    post: (path: string, body?: object) => prep(http.post(path)).send(body),
  };
}

const auditCount = () => fx.owner.auditLog.count({ where: { instituteId: a.institute.id } });

beforeAll(async () => {
  let env;
  ({ app, env } = await createTestApp());
  a = await fx.institute('setup');
  for (const key of ['admin', 'hod'] as const) {
    u[key] = await fx.user(`setup-${key}`);
    tokens.set(u[key].id, await signToken(env, u[key].id));
  }
  await fx.grant(u.admin.id, 'institute_admin', a.institute.id, { type: 'institute' });
  await fx.grant(u.hod.id, 'hod', a.institute.id, { type: 'department', id: a.cse.id });
}, 60_000);

afterAll(async () => {
  await app?.close();
  for (const id of sampleIds) await purgeInstitute(fx.owner, id, { includeInstitute: true });
  await fx.cleanup();
});

describe('setup progress', () => {
  it('starts from what the institute already has, and says what needs attention', async () => {
    const res = await as(u.admin.id).get('/setup');
    expect(res.status).toBe(200);
    const state = res.body as SetupStateDto;
    expect(state.steps.map((s) => s.id)).toEqual([
      'profile',
      'departments',
      'programmes',
      'schemes',
      'term',
      'cohorts',
      'faculty',
      'rooms',
      'bell',
      'calendar',
      'teaching',
      'ready',
    ]);
    expect(state.steps.find((s) => s.id === 'departments')).toMatchObject({
      hasData: true,
      count: 2,
    });
    expect(state.steps.filter((s) => !s.available).map((s) => s.id)).toEqual(['teaching', 'ready']);
    expect(state).toMatchObject({ nextStep: 'profile', percent: 0, activeTermId: null });
    expect(state.attention.map((x) => x.code)).toEqual([
      'no_programmes',
      'no_active_term',
      'no_faculty',
      'no_rooms',
      'no_bell_schedule',
    ]);
    expect(state.attention[0]).toMatchObject({ href: '/setup/programmes' });
  });

  it('saves done and skipped steps, resumes at the next one, and audits each change', async () => {
    const before = await auditCount();
    await as(u.admin.id).put('/setup/steps/profile', { status: 'done' }).expect(200);
    await as(u.admin.id).put('/setup/steps/departments', { status: 'done' }).expect(200);
    const skipped = await as(u.admin.id).put('/setup/steps/programmes', { status: 'skipped' });
    const state = skipped.body as SetupStateDto;
    expect(state.steps.slice(0, 4).map((s) => s.status)).toEqual([
      'done',
      'done',
      'skipped',
      'todo',
    ]);
    expect(state.nextStep).toBe('schemes');
    expect(state.percent).toBe(30); // 3 of 10 available steps
    expect((await auditCount()) - before).toBe(3);

    // A fresh read resumes from what was saved; "todo" undoes a skip.
    const again = (await as(u.admin.id).get('/setup')).body as SetupStateDto;
    expect(again.nextStep).toBe('schemes');
    const undone = (await as(u.admin.id).put('/setup/steps/programmes', { status: 'todo' }))
      .body as SetupStateDto;
    expect(undone.nextStep).toBe('programmes');
  });

  it('only institute admins change progress; others may read it', async () => {
    expect((await as(u.hod.id).get('/setup')).status).toBe(200);
    expect((await as(u.hod.id).put('/setup/steps/profile', { status: 'done' })).status).toBe(403);
    expect((await as(u.admin.id).put('/setup/steps/nonsense', { status: 'done' })).status).toBe(
      400,
    );
    expect((await as(u.admin.id).put('/setup/steps/profile', { status: 'maybe' })).status).toBe(
      400,
    );
  });
});

describe('try with sample data', () => {
  it('creates a separate institute with the caller as admin and loads the sample in the background', async () => {
    expect((await as(u.hod.id).post('/setup/sample-institute')).status).toBe(403);

    const res = await as(u.admin.id).post('/setup/sample-institute');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const body = res.body as SampleInstituteDto;
    expect(body.slug).toMatch(new RegExp(`^${a.institute.slug.slice(0, 40)}-sample-[0-9a-f]{6}$`));
    expect(body.url).toContain(`${body.slug}.localhost`);

    const sample = await fx.owner.institute.findUniqueOrThrow({ where: { slug: body.slug } });
    sampleIds.push(sample.id);
    expect(sample.isSample).toBe(true);
    const membership = await fx.owner.membership.findFirst({
      where: { instituteId: sample.id, userId: u.admin.id, revokedAt: null },
    });
    expect(membership?.role).toBe('institute_admin');

    // The queue worker loads the master data; wait for it (normally a second or two).
    let courses = 0;
    for (let i = 0; i < 60 && courses < 52; i++) {
      courses = await fx.owner.course.count({ where: { instituteId: sample.id } });
      if (courses < 52) await new Promise((r) => setTimeout(r, 500));
    }
    expect(courses).toBe(52);
    expect(await fx.owner.faculty.count({ where: { instituteId: sample.id } })).toBe(44);
    expect(
      await fx.owner.auditLog.count({ where: { instituteId: sample.id, action: 'sample.loaded' } }),
    ).toBe(1);
    // The caller's own institute is untouched.
    expect(await fx.owner.course.count({ where: { instituteId: a.institute.id } })).toBe(0);
  }, 60_000);

  it('loading the same institute twice does nothing the second time', async () => {
    const listener = app.get(SampleDataListener);
    const sample = await fx.owner.institute.findUniqueOrThrow({ where: { id: sampleIds[0]! } });
    const again = await listener.load({
      eventId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
      instituteId: sample.id,
      actorUserId: u.admin.id,
      slug: sample.slug,
      name: sample.name,
      firstAdminUserId: u.admin.id,
      withSampleData: true,
    });
    expect(again).toBe('skipped');
    expect(await fx.owner.course.count({ where: { instituteId: sample.id } })).toBe(52);
  });
});
