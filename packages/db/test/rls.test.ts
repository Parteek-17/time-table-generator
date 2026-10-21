/**
 * Proves row-level security isolates institutes at the database level, even for raw SQL.
 * Needs a migrated Postgres: `docker compose up -d && pnpm db:migrate`.
 *   DATABASE_URL      owner role (creates fixtures)
 *   APP_DATABASE_URL  restricted slotwise_app role (what the API uses)
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient, withTenant } from '../src/index';

try {
  process.loadEnvFile('.env');
} catch {
  // CI passes the URLs as environment variables.
}

const ownerUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;
if (!ownerUrl || !appUrl) {
  throw new Error(
    'DATABASE_URL and APP_DATABASE_URL must be set (copy packages/db/.env.example to .env, then start Postgres with `docker compose up -d`).',
  );
}

const owner = new PrismaClient({ datasources: { db: { url: ownerUrl } } });
const app = new PrismaClient({ datasources: { db: { url: appUrl } } });

const suffix = randomUUID().slice(0, 8);
const ids = { instA: '', instB: '', userA: '', userB: '' };

beforeAll(async () => {
  const [instA, instB] = await Promise.all([
    owner.institute.create({ data: { name: 'RLS Test A', slug: `rls-a-${suffix}` } }),
    owner.institute.create({ data: { name: 'RLS Test B', slug: `rls-b-${suffix}` } }),
  ]);
  const [userA, userB] = await Promise.all([
    owner.user.create({ data: { email: `rls-a-${suffix}@slotwise.test` } }),
    owner.user.create({ data: { email: `rls-b-${suffix}@slotwise.test` } }),
  ]);
  Object.assign(ids, { instA: instA.id, instB: instB.id, userA: userA.id, userB: userB.id });

  for (const [inst, user] of [
    [instA, userA],
    [instB, userB],
  ] as const) {
    await owner.membership.create({
      data: {
        userId: user.id,
        role: 'institute_admin',
        scopeType: 'institute',
        scopeId: inst.id,
        instituteId: inst.id,
      },
    });
    await owner.invite.create({
      data: {
        instituteId: inst.id,
        email: `invitee-${inst.slug}@slotwise.test`,
        role: 'faculty',
        scopeType: 'institute',
        scopeId: inst.id,
        tokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
        invitedById: user.id,
      },
    });
    await owner.auditLog.create({
      data: {
        instituteId: inst.id,
        actorUserId: user.id,
        action: 'test.event',
        targetType: 'test',
      },
    });
    await owner.department.create({
      data: { instituteId: inst.id, name: 'Test Dept', code: `T${suffix}` },
    });
  }
});

afterAll(async () => {
  const instituteIds = [ids.instA, ids.instB].filter(Boolean);
  await owner.auditLog.deleteMany({ where: { instituteId: { in: instituteIds } } });
  await owner.invite.deleteMany({ where: { instituteId: { in: instituteIds } } });
  await owner.membership.deleteMany({ where: { instituteId: { in: instituteIds } } });
  await owner.department.deleteMany({ where: { instituteId: { in: instituteIds } } });
  await owner.institute.deleteMany({ where: { id: { in: instituteIds } } });
  await owner.user.deleteMany({ where: { id: { in: [ids.userA, ids.userB].filter(Boolean) } } });
  await Promise.all([owner.$disconnect(), app.$disconnect()]);
});

describe('row-level security (as slotwise_app)', () => {
  it('the app role cannot bypass RLS', async () => {
    const [role] = await app.$queryRaw<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;
    expect(role).toEqual({ rolsuper: false, rolbypassrls: false });
  });

  it('a raw query for another institute returns nothing', async () => {
    const rows = await withTenant(app, { instituteId: ids.instA, userId: ids.userA }, (tx) =>
      Promise.all([
        tx.$queryRaw<unknown[]>`SELECT id FROM memberships WHERE institute_id = ${ids.instB}::uuid`,
        tx.$queryRaw<unknown[]>`SELECT id FROM invites WHERE institute_id = ${ids.instB}::uuid`,
        tx.$queryRaw<unknown[]>`SELECT id FROM audit_logs WHERE institute_id = ${ids.instB}::uuid`,
        tx.$queryRaw<unknown[]>`SELECT id FROM departments WHERE institute_id = ${ids.instB}::uuid`,
      ]),
    );
    for (const result of rows) expect(result).toHaveLength(0);
  });

  it('unfiltered reads only see the current institute', async () => {
    const invites = await withTenant(
      app,
      { instituteId: ids.instA, userId: null },
      (tx) => tx.$queryRaw<{ institute_id: string }[]>`SELECT institute_id FROM invites`,
    );
    expect(invites.length).toBeGreaterThan(0);
    expect(new Set(invites.map((i) => i.institute_id))).toEqual(new Set([ids.instA]));
  });

  it('with no institute set, tenant tables look empty', async () => {
    const [memberships, invites] = await Promise.all([
      app.$queryRaw<unknown[]>`SELECT id FROM memberships`,
      app.$queryRaw<unknown[]>`SELECT id FROM invites`,
    ]);
    expect(memberships).toHaveLength(0);
    expect(invites).toHaveLength(0);
  });

  it('cannot write rows into another institute', async () => {
    await expect(
      withTenant(
        app,
        { instituteId: ids.instA, userId: ids.userA },
        (tx) =>
          tx.$executeRaw`INSERT INTO audit_logs (id, institute_id, action, target_type)
                       VALUES (gen_random_uuid(), ${ids.instB}::uuid, 'evil', 'test')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('cannot update rows of another institute', async () => {
    const updated = await withTenant(
      app,
      { instituteId: ids.instA, userId: ids.userA },
      (tx) =>
        tx.$executeRaw`UPDATE invites SET cancelled_at = now() WHERE institute_id = ${ids.instB}::uuid`,
    );
    expect(updated).toBe(0);
  });

  it("a user can read their own memberships elsewhere, but not other people's", async () => {
    const rows = await withTenant(
      app,
      { instituteId: ids.instA, userId: ids.userB },
      (tx) =>
        tx.$queryRaw<
          { user_id: string; institute_id: string }[]
        >`SELECT user_id, institute_id FROM memberships`,
    );
    // userB's own membership in B, plus institute A's memberships (current tenant).
    const outsideA = rows.filter((r) => r.institute_id !== ids.instA);
    expect(outsideA.every((r) => r.user_id === ids.userB)).toBe(true);
  });

  it('the audit log is append-only for the app', async () => {
    await expect(
      withTenant(
        app,
        { instituteId: ids.instA, userId: null },
        (tx) => tx.$executeRaw`DELETE FROM audit_logs`,
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('turning row security off is refused', async () => {
    await expect(
      app.$transaction(async (tx) => {
        await tx.$executeRaw`SET LOCAL row_security = off`;
        return tx.$queryRaw`SELECT id FROM invites`;
      }),
    ).rejects.toThrow(/row-level security/);
  });
});
