/**
 * P7 against a real, migrated Postgres: public sign-up (on institute-provisioning.v1), the
 * free trial every new institute gets, plan limits, and the platform admin's institute list.
 */
import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { purgeInstitute } from '@slotwise/db';
import type { EventPayloadV1 } from '@slotwise/shared/contracts';
import type { PlanStatusDto, PlatformInstituteDto } from '@slotwise/shared/platform';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, Fixtures, signToken, type FakeMail } from '../../test/helpers';
import { BillingService } from '../billing/billing.service';
import type { Env } from '../config/env';
import { PrismaService } from '../db/prisma.service';

let app: INestApplication;
let env: Env;
let mail: FakeMail;
const fx = new Fixtures();
const run = Math.random().toString(36).slice(2, 8);
const slug = `t-signup-${run}`;
const email = `signup-${run}@slotwise.test`;
const created: string[] = [];
const events: EventPayloadV1<'institute.created'>[] = [];
let platformToken: string;
let fixture: Awaited<ReturnType<Fixtures['institute']>>;
let fixtureAdminToken: string;

const http = () => request(app.getHttpServer());
const form = (extra: object = {}) => ({
  instituteName: 'Demo College of Engineering',
  slug,
  type: 'college',
  affiliatingUniversityName: 'Demo Technical University',
  adminName: 'Signup Admin',
  adminEmail: email,
  ...extra,
});

async function until<T>(read: () => Promise<T | null>): Promise<T> {
  for (let i = 0; i < 50; i++) {
    const value = await read();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('timed out');
}

beforeAll(async () => {
  ({ app, env, mail } = await createTestApp());
  app.get(EventEmitter2).on('institute.created', (e: EventPayloadV1<'institute.created'>) => {
    events.push(e);
  });
  const platform = await fx.user('p7-platform');
  await fx.owner.membership.create({
    data: { userId: platform.id, role: 'platform_admin', scopeType: 'platform' },
  });
  platformToken = await signToken(env, platform.id);
  fixture = await fx.institute('p7');
  const admin = await fx.user('p7-admin');
  await fx.grant(admin.id, 'institute_admin', fixture.institute.id, { type: 'institute' });
  fixtureAdminToken = await signToken(env, admin.id);
});

afterAll(async () => {
  await app?.close();
  for (const id of created) await purgeInstitute(fx.owner, id, { includeInstitute: true });
  await fx.owner.user.deleteMany({ where: { email } });
  await fx.cleanup();
});

describe('POST /signup', () => {
  it('creates the institute on a free trial and emails its first admin an invite', async () => {
    const res = await http().post('/signup').send(form());
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      slug,
      email,
      url: env.WEB_URL_TEMPLATE.replace('{slug}', slug),
    });
    const institute = await fx.owner.institute.findUniqueOrThrow({ where: { slug } });
    created.push(institute.id);
    expect(institute.affiliatingUniversityName).toBe('Demo Technical University');

    // The admin is a member only after following the invite.
    const user = await fx.owner.user.findUniqueOrThrow({ where: { email } });
    expect(await fx.owner.membership.count({ where: { userId: user.id } })).toBe(0);
    const invite = await fx.owner.invite.findFirstOrThrow({ where: { instituteId: institute.id } });
    expect(invite).toMatchObject({ email, invitedById: user.id, acceptedAt: null });
    expect(mail.sent.some((m) => m.to === email && m.text.includes('/invite/'))).toBe(true);

    expect(events.find((e) => e.instituteId === institute.id)).toMatchObject({
      actorUserId: null,
      firstAdminUserId: user.id,
    });
    const sub = await until(() =>
      fx.owner.instituteSubscription.findUnique({ where: { instituteId: institute.id } }),
    );
    expect(sub.planCode).toBe('trial');
    expect(sub.trialEndsOn).not.toBeNull();
  });

  it('says plainly when the address is taken, reserved or the form is wrong', async () => {
    const taken = await http().post('/signup').send(form());
    expect(taken.status).toBe(409);
    expect(taken.body.message).toContain('already taken');

    const reserved = await http()
      .post('/signup')
      .send(form({ slug: 'www' }));
    expect(reserved.status).toBe(400);
    expect(reserved.body.fieldErrors.slug).toBeDefined();

    const bot = await http()
      .post('/signup')
      .send(form({ slug: `t-bot-${run}`, website: 'https://spam.example' }));
    expect(bot.status).toBe(400);
    expect(await fx.owner.institute.findUnique({ where: { slug: `t-bot-${run}` } })).toBeNull();
  });

  it('tells the form whether an address is free', async () => {
    const takenRes = await http().get('/signup/slug').query({ slug });
    expect(takenRes.body).toEqual({ slug, available: false });
    const free = await http()
      .get('/signup/slug')
      .query({ slug: `T-Free-${run}` });
    expect(free.body).toEqual({ slug: `t-free-${run}`, available: true });
    const reserved = await http().get('/signup/slug').query({ slug: 'api' });
    expect(reserved.body.available).toBe(false);
  });
});

describe('platform institutes', () => {
  it('a platform admin sees every institute with its plan and changes the plan', async () => {
    const list = await http()
      .get('/platform/institutes')
      .query({ q: slug })
      .set('authorization', `Bearer ${platformToken}`);
    expect(list.status).toBe(200);
    const row = (list.body as PlatformInstituteDto[]).find((i) => i.slug === slug);
    expect(row?.plan).toMatchObject({ code: 'trial', name: 'Free trial' });

    const put = await http()
      .put(`/platform/institutes/${row!.id}/plan`)
      .set('authorization', `Bearer ${platformToken}`)
      .send({ planCode: 'college' });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ code: 'college', name: 'College', trialEndsOn: null });
    const audit = await fx.owner.auditLog.findFirst({
      where: { instituteId: row!.id, action: 'billing.plan_changed' },
    });
    expect(audit?.metadata).toMatchObject({ from: 'trial', to: 'college' });

    const bad = await http()
      .put(`/platform/institutes/${row!.id}/plan`)
      .set('authorization', `Bearer ${platformToken}`)
      .send({ planCode: 'gold' });
    expect(bad.status).toBe(400);
  });

  it('institute admins cannot list institutes or change plans', async () => {
    const list = await http()
      .get('/platform/institutes')
      .set('authorization', `Bearer ${fixtureAdminToken}`);
    expect(list.status).toBe(403);
    const put = await http()
      .put(`/platform/institutes/${fixture.institute.id}/plan`)
      .set('authorization', `Bearer ${fixtureAdminToken}`)
      .send({ planCode: 'university' });
    expect(put.status).toBe(403);
  });
});

describe('plan and limits', () => {
  it("an institute admin sees their plan and usage (no row yet = the trial's limits)", async () => {
    const res = await http()
      .get('/billing/plan')
      .set('authorization', `Bearer ${fixtureAdminToken}`)
      .set('x-institute-slug', fixture.institute.slug);
    expect(res.status).toBe(200);
    const status = res.body as PlanStatusDto;
    expect(status.plan.code).toBe('trial');
    expect(status.usage.find((u) => u.kind === 'departments')).toEqual({
      kind: 'departments',
      used: 2,
      limit: 3,
      level: 'ok',
    });
  });

  it('assertCanAdd refuses going past the limit in plain words', async () => {
    const billing = app.get(BillingService);
    const prisma = app.get(PrismaService);
    const ctx = { instituteId: fixture.institute.id, userId: null };
    await expect(
      prisma.tenant(ctx, (tx) => billing.assertCanAdd(tx, fixture.institute.id, 'departments')),
    ).resolves.toBeUndefined();
    await expect(
      prisma.tenant(ctx, (tx) => billing.assertCanAdd(tx, fixture.institute.id, 'departments', 2)),
    ).rejects.toMatchObject({
      response: { code: 'plan_limit', message: expect.stringContaining('allows 3 departments') },
    });
  });
});
