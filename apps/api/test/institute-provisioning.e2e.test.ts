/**
 * institute-provisioning.v1 against a real, migrated Postgres: `POST /platform/institutes`
 * creates an institute, invites its first admin and emits `institute.created`.
 */
import type { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { purgeInstitute } from '@slotwise/db';
import type { EventPayloadV1, ProvisionInstituteResponseV1 } from '@slotwise/shared/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../src/config/env';
import { createTestApp, Fixtures, signToken, type FakeMail } from './helpers';

let app: INestApplication;
let env: Env;
let mail: FakeMail;
const fx = new Fixtures();
const run = Math.random().toString(36).slice(2, 8);
const created: string[] = [];
const events: EventPayloadV1<'institute.created'>[] = [];
let platformToken: string;
let adminToken: string;
let adminInstituteSlug: string;

const body = (slug: string, extra: object = {}) => ({
  version: 'institute-provisioning.v1',
  name: 'Demo Polytechnic College',
  slug,
  type: 'college',
  firstAdmin: { email: `first-admin-${run}@slotwise.test`, name: 'First Admin' },
  ...extra,
});
const post = (token: string | null, payload: object) => {
  const req = request(app.getHttpServer()).post('/platform/institutes');
  if (token) req.set('authorization', `Bearer ${token}`);
  return req.send(payload);
};

beforeAll(async () => {
  ({ app, env, mail } = await createTestApp());
  app.get(EventEmitter2).on('institute.created', (e: EventPayloadV1<'institute.created'>) => {
    events.push(e);
  });
  const platform = await fx.user('platform');
  await fx.owner.membership.create({
    data: { userId: platform.id, role: 'platform_admin', scopeType: 'platform' },
  });
  platformToken = await signToken(env, platform.id);
  const { institute } = await fx.institute('prov');
  adminInstituteSlug = institute.slug;
  const admin = await fx.user('inst-admin');
  await fx.grant(admin.id, 'institute_admin', institute.id, { type: 'institute' });
  adminToken = await signToken(env, admin.id);
});

afterAll(async () => {
  await app?.close();
  for (const id of created) await purgeInstitute(fx.owner, id, { includeInstitute: true });
  await fx.owner.user.deleteMany({ where: { email: `first-admin-${run}@slotwise.test` } });
  await fx.cleanup();
});

describe('POST /platform/institutes', () => {
  it('a platform admin creates an institute; its first admin gets an invite', async () => {
    const res = await post(platformToken, body(`t-prov-${run}`));
    expect(res.status).toBe(201);
    const data = res.body as ProvisionInstituteResponseV1;
    created.push(data.instituteId);
    expect(data).toMatchObject({ version: 'institute-provisioning.v1', slug: `t-prov-${run}` });
    expect(data.url).toBe(env.WEB_URL_TEMPLATE.replace('{slug}', `t-prov-${run}`));

    const invite = await fx.owner.invite.findUniqueOrThrow({ where: { id: data.inviteId } });
    expect(invite).toMatchObject({ role: 'institute_admin', acceptedAt: null });
    const sent = mail.sent.find((m) => m.to === `first-admin-${run}@slotwise.test`);
    expect(sent?.text).toContain(`${data.url}/invite/`);

    expect(events.find((e) => e.instituteId === data.instituteId)).toMatchObject({
      slug: `t-prov-${run}`,
      firstAdminUserId: data.firstAdminUserId,
      withSampleData: false,
    });
    const audit = await fx.owner.auditLog.findFirst({
      where: { instituteId: data.instituteId, action: 'institute.created' },
    });
    expect(audit?.metadata).toMatchObject({ via: 'platform' });
  });

  it('refuses a taken, reserved or invalid address with the contract codes', async () => {
    const taken = await post(platformToken, body(`t-prov-${run}`));
    expect(taken.status).toBe(409);
    expect(taken.body.code).toBe('slug_taken');

    const reserved = await post(platformToken, body('admin'));
    expect(reserved.status).toBe(400);
    expect(reserved.body.code).toBe('slug_reserved');

    const invalid = await post(platformToken, body(`t-prov2-${run}`, { name: 'x' }));
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('invalid_input');
    expect(invalid.body.fieldErrors.name).toBeDefined();
  });

  it('institute admins and signed-out callers cannot use it', async () => {
    const asAdmin = await post(adminToken, body(`t-prov3-${run}`)).set(
      'x-institute-slug',
      adminInstituteSlug,
    );
    expect(asAdmin.status).toBe(403);
    expect((await post(null, body(`t-prov3-${run}`))).status).toBe(401);
    expect(await fx.owner.institute.findUnique({ where: { slug: `t-prov3-${run}` } })).toBeNull();
  });
});
