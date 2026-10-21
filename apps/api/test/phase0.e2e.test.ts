/**
 * End-to-end tests for Phase 0 against a real, migrated Postgres:
 * tenancy (403 across institutes), invite → accept, revoke → undo, audit log.
 */
import type { INestApplication } from '@nestjs/common';
import type { CreateInviteResponse, MeResponse, MemberDto } from '@slotwise/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../src/config/env';
import { createTestApp, Fixtures, signToken, type FakeMail } from './helpers';

let app: INestApplication;
let env: Env;
let mail: FakeMail;
const fx = new Fixtures();

let a: Awaited<ReturnType<Fixtures['institute']>>;
let b: Awaited<ReturnType<Fixtures['institute']>>;
const users = {} as Record<
  'adminA' | 'adminB' | 'invitee' | 'stranger',
  { id: string; email: string }
>;

/** Requests as a user (or signed out) on an institute's subdomain. */
const tokens = new Map<string, string>();
function as(userId: string | null, slug: string) {
  const auth = userId ? `Bearer ${tokens.get(userId)}` : null;
  const http = request(app.getHttpServer());
  const prep = (req: request.Test) => {
    req.set('x-institute-slug', slug);
    if (auth) req.set('authorization', auth);
    return req;
  };
  return {
    get: (path: string) => prep(http.get(path)),
    post: (path: string, body?: object) => prep(http.post(path)).send(body),
    delete: (path: string) => prep(http.delete(path)),
  };
}

beforeAll(async () => {
  ({ app, env, mail } = await createTestApp());
  a = await fx.institute('a');
  b = await fx.institute('b');
  users.adminA = await fx.user('admin-a');
  users.adminB = await fx.user('admin-b');
  users.invitee = await fx.user('invitee');
  users.stranger = await fx.user('stranger');
  for (const u of Object.values(users)) tokens.set(u.id, await signToken(env, u.id));
  await fx.grant(users.adminA.id, 'institute_admin', a.institute.id, { type: 'institute' });
  await fx.grant(users.adminB.id, 'institute_admin', b.institute.id, { type: 'institute' });
});

afterAll(async () => {
  await app?.close();
  await fx.cleanup();
});

describe('tenancy', () => {
  it('a member gets their institute and role from /me', async () => {
    const res = await as(users.adminA.id, a.institute.slug).get('/me');
    expect(res.status).toBe(200);
    const me = res.body as MeResponse;
    expect(me.institute.slug).toBe(a.institute.slug);
    expect(me.memberships.map((m) => m.role)).toEqual(['institute_admin']);
  });

  it("a user from one institute gets 403 on another institute's subdomain", async () => {
    expect((await as(users.adminA.id, b.institute.slug).get('/me')).status).toBe(403);
    expect((await as(users.adminB.id, a.institute.slug).get('/members')).status).toBe(403);
    expect(
      (
        await as(users.adminB.id, a.institute.slug).post('/invites', {
          email: 'x@slotwise.test',
          role: 'faculty',
          scopeType: 'institute',
        })
      ).status,
    ).toBe(403);
  });

  it('a signed-in user with no membership gets 403', async () => {
    expect((await as(users.stranger.id, a.institute.slug).get('/me')).status).toBe(403);
  });

  it('no token is 401, unknown institute is 404', async () => {
    expect((await as(null, a.institute.slug).get('/me')).status).toBe(401);
    expect((await as(users.adminA.id, 'no-such-institute').get('/me')).status).toBe(404);
  });

  it('a forged token is rejected', async () => {
    const res = await request(app.getHttpServer())
      .get('/me')
      .set('x-institute-slug', a.institute.slug)
      .set('authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.bad');
    expect(res.status).toBe(401);
  });

  it('the institute name is public, for the sign-in page', async () => {
    const res = await as(null, a.institute.slug).get('/institute');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(a.institute.name);
  });

  it('health needs no institute or sign-in', async () => {
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
  });
});

describe('invite → accept → revoke → undo', () => {
  let token = '';
  let hodMembershipId = '';

  it('validates input with plain messages', async () => {
    const res = await as(users.adminA.id, a.institute.slug).post('/invites', {
      email: 'not-an-email',
      role: 'hod',
      scopeType: 'institute',
    });
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors.email).toBeDefined();
    expect(res.body.fieldErrors.scopeType).toBeDefined(); // hod must be department-scoped
  });

  it('institute admin invites a hod of a department and an email is sent', async () => {
    const res = await as(users.adminA.id, a.institute.slug).post('/invites', {
      email: users.invitee.email.toUpperCase(),
      role: 'hod',
      scopeType: 'department',
      departmentId: a.cse.id,
    });
    expect(res.status).toBe(201);
    const body = res.body as CreateInviteResponse;
    expect(body.emailSent).toBe(true);
    expect(body.invite.email).toBe(users.invitee.email);
    expect(body.invite.scope).toMatchObject({ type: 'department', name: 'Test CSE' });

    const sent = mail.sent.at(-1)!;
    expect(sent.to).toBe(users.invitee.email);
    expect(sent.text).toContain('Head of department');
    token = body.acceptUrl.split('/invite/')[1]!;
    expect(sent.text).toContain(body.acceptUrl);
  });

  it('cannot invite into a department of another institute', async () => {
    const res = await as(users.adminA.id, a.institute.slug).post('/invites', {
      email: 'x@slotwise.test',
      role: 'hod',
      scopeType: 'department',
      departmentId: b.cse.id,
    });
    expect(res.status).toBe(404); // RLS hides B's department entirely
  });

  it('anyone with the link can preview it, but only on the right institute', async () => {
    const res = await as(null, a.institute.slug).get(`/invites/token/${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'pending', role: 'hod', email: users.invitee.email });
    expect((await as(null, b.institute.slug).get(`/invites/token/${token}`)).status).toBe(404);
  });

  it('only the invited email can accept', async () => {
    const res = await as(users.stranger.id, a.institute.slug).post(
      `/invites/token/${token}/accept`,
    );
    expect(res.status).toBe(403);
  });

  it('the invitee accepts and sees their role', async () => {
    const res = await as(users.invitee.id, a.institute.slug).post(`/invites/token/${token}/accept`);
    expect(res.status).toBe(201);
    hodMembershipId = res.body.id;

    const me = (await as(users.invitee.id, a.institute.slug).get('/me')).body as MeResponse;
    expect(me.memberships).toEqual([
      expect.objectContaining({
        role: 'hod',
        scope: expect.objectContaining({ name: 'Test CSE' }),
      }),
    ]);
    // Accepting twice is refused.
    expect(
      (await as(users.invitee.id, a.institute.slug).post(`/invites/token/${token}/accept`)).status,
    ).toBe(410);
  });

  it('the hod sees only their department and cannot act on another', async () => {
    const hod = as(users.invitee.id, a.institute.slug);
    const members = (await hod.get('/members')).body as MemberDto[];
    expect(members.map((m) => m.user.id)).toEqual([users.invitee.id]);

    const otherDept = await hod.post('/invites', {
      email: 'f@slotwise.test',
      role: 'faculty',
      scopeType: 'department',
      departmentId: a.ece.id,
    });
    expect(otherDept.status).toBe(403);

    const ownDept = await hod.post('/invites', {
      email: 'f@slotwise.test',
      role: 'faculty',
      scopeType: 'department',
      departmentId: a.cse.id,
    });
    expect(ownDept.status).toBe(201);
  });

  it('the admin revokes the hod, then undoes it', async () => {
    const admin = as(users.adminA.id, a.institute.slug);
    expect((await admin.delete(`/members/${hodMembershipId}`)).status).toBe(204);
    expect((await as(users.invitee.id, a.institute.slug).get('/me')).status).toBe(403);

    expect((await admin.post(`/members/${hodMembershipId}/restore`)).status).toBe(204);
    expect((await as(users.invitee.id, a.institute.slug).get('/me')).status).toBe(200);
  });

  it('an admin cannot remove their own access', async () => {
    const admin = as(users.adminA.id, a.institute.slug);
    const members = (await admin.get('/members')).body as MemberDto[];
    const own = members.find((m) => m.user.id === users.adminA.id)!;
    expect((await admin.delete(`/members/${own.membershipId}`)).status).toBe(400);
  });

  it('writes audit entries for invite, accept, revoke and undo', async () => {
    const logs = await fx.owner.auditLog.findMany({
      where: { instituteId: a.institute.id },
      orderBy: { createdAt: 'asc' },
    });
    const actions = logs.map((l) => l.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'invite.created',
        'invite.accepted',
        'membership.revoked',
        'membership.restored',
      ]),
    );
    expect(await fx.owner.auditLog.count({ where: { instituteId: b.institute.id } })).toBe(0);
  });
});
