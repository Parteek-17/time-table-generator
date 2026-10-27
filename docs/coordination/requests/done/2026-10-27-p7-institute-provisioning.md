# Implement institute-provisioning.v1 (`POST /platform/institutes`) and retire P1's mock

- Stream: P7
- Streams affected: P1 (its `provisioning.mock.ts` is replaced by the real service), P7
- Files (part A, before P7 merges): `apps/api/src/institute-provisioning/**` (new),
  `apps/api/src/app.module.ts`, `apps/api/src/setup/{setup.controller,setup.module}.ts`,
  `apps/api/src/setup/provisioning.mock.ts` (deleted), `packages/shared/src/auth/platform.ts`
  (+ test, new), `packages/shared/src/index.ts`, `apps/api/test/institute-provisioning.e2e.test.ts`
  (new), one comment in `apps/api/test/masterdata-setup.e2e.test.ts`
- Files (part B, when P7 merges): `packages/db/src/purge.ts`, migration for
  `institute_subscriptions` (P7's `platform.prisma`)

## What

**Part A** is INT's "Next" item, written out so it can be applied as is:

```bash
git apply docs/coordination/requests/2026-10-27-p7-institute-provisioning-a.patch
```

- `InstituteProvisioningService.provision(request, { actorUserId, via, grantNow? })`: parses
  `ProvisionInstituteRequestV1`, then in **one** tenant transaction creates the institute (id
  generated first so RLS can be set), upserts the first admin's user, creates the
  `institute_admin` invite and audits `institute.created` (`via`: platform, signup or sample).
  After commit it emails the invite (skipped with `grantNow`) and emits the real
  `institute.created`. Refusals use the contract's codes as `{ code, message }`:
  `slug_taken` (409, also on a unique-index race), `slug_reserved` and `invalid_input` (400,
  with `fieldErrors`).
  - `actorUserId: null` is P7's public sign-up acting as the platform. `invites.invited_by_id`
    is NOT NULL, so a sign-up's invite records the new admin as its inviter (they asked for it).
  - `grantNow: true` is P1's "Try with sample data": the signed-in caller is the first admin and
    gets the membership straight away (invite stored as accepted), like the mock did.
- `InstituteProvisioningController`: `POST /platform/institutes`, `@SkipTenant()`,
  `@UseGuards(PlatformAdminGuard)`. Body validated by the service so errors carry the codes.
- `PlatformAdminGuard` (exported for P7's `/platform/*` routes): loads the caller's platform
  memberships with `{ instituteId: null, userId }` (RLS shows a user their own memberships) and
  checks `canManagePlatform()`.
- `packages/shared/src/auth/platform.ts`: `canManagePlatform(user)` =
  `can(user, 'institute.manage', PLATFORM_RESOURCE)` with the nil-UUID institute id. Only a
  platform-scope grant covers an institute that is nobody's (institute, university and
  department scopes compare real ids), so no new action and no role string checks. Tests
  include institute and university admins being refused.
- `InstituteProvisioningModule` exports the service and guard; imported in `app.module.ts`,
  by P1's `SetupModule` (mock deleted, controller passes `{ actorUserId, via: 'sample',
grantNow: true }`) and by P7's `SignupModule`/`PlatformModule`.
- One behaviour change for P1: the mock refused in production; the real service doesn't (the
  sample data is fictional, so that seems right; say if P1 wants the guard kept).

**Part B**, with P7's merge (P7's schema adds `institute_subscriptions`):

- `git apply docs/coordination/requests/2026-10-27-p7-institute-provisioning-b.patch`
  (adds `institute_subscriptions` first in `TENANT_TABLES_DELETE_ORDER`; it must not land
  before the table exists).
- Migration, e.g. `prisma/migrations/2026MMDD000000_p7_platform/migration.sql`. Prisma's
  generated part plus the usual RLS; `prisma migrate diff` was empty against P7's schema with
  exactly this SQL applied to `slotwise_p7`:

```sql
-- CreateTable
CREATE TABLE "institute_subscriptions" (
    "id" UUID NOT NULL,
    "institute_id" UUID NOT NULL,
    "plan_code" TEXT NOT NULL,
    "trial_ends_on" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institute_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "institute_subscriptions_institute_id_key" ON "institute_subscriptions"("institute_id");

-- AddForeignKey
ALTER TABLE "institute_subscriptions" ADD CONSTRAINT "institute_subscriptions_institute_id_fkey" FOREIGN KEY ("institute_id") REFERENCES "institutes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-level security (same policy as the other tenant tables).
ALTER TABLE "institute_subscriptions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "institute_subscriptions"
  USING (institute_id = app_current_institute_id())
  WITH CHECK (institute_id = app_current_institute_id());
```

## Why

P7's platform screen and public sign-up need the real provisioning service and the real
`institute.created`, and P1's "Try with sample data" can then drop its mock. `p7/launch`
imports `InstituteProvisioningService`, `InstituteProvisioningModule` and `PlatformAdminGuard`
and `canManagePlatform` from `@slotwise/shared`, so **it compiles only with part A on `main`**.

## Tested (in `../slotwise-p7` with part A applied, stream DB `slotwise_p7`)

- `apps/api/test/institute-provisioning.e2e.test.ts`: 3 passed (create + invite email + event +
  audit; slug_taken / slug_reserved / invalid_input; institute admin 403, signed out 401).
- `apps/api/test/masterdata-setup.e2e.test.ts` (P1's sample institute on the real service):
  5 passed.
- P7's `apps/api/src/signup/signup.e2e.test.ts`: 7 passed; `packages/shared` platform tests:
  11 passed. API and web `tsc --noEmit` clean, eslint clean on the changed files.

## Exact proposed diff

Part A: [`2026-10-27-p7-institute-provisioning-a.patch`](2026-10-27-p7-institute-provisioning-a.patch)
(735 lines; `git diff HEAD` against `main` 271f570). Part B:
[`2026-10-27-p7-institute-provisioning-b.patch`](2026-10-27-p7-institute-provisioning-b.patch)
plus the SQL above.
