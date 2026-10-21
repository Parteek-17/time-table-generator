# ADR 0002: Multi-institute isolation with subdomains and row-level security

- Status: accepted
- Date: 2026-10-21

## Context

Every tenant table has `institute_id`. CLAUDE.md asks that no query can read another
institute's rows, and the Phase 0 brief asks for Postgres row-level security (RLS) driven by
`current_setting('app.institute_id')`, set with `SET LOCAL` per request transaction.

## Decision

**Resolve the institute from the subdomain.** `apps/web/src/proxy.ts` (Next 16's name for
middleware) parses `<slug>.<WEB_ROOT_DOMAIN>` from `x-forwarded-host`/`host`, drops any
client-sent `x-institute-slug`, and sets it. The web forwards it to the API. The API's
`TenantGuard` loads the institute and returns 403 unless the user has a membership that reaches
it (`belongsToInstitute()` in `packages/shared`). Trusting `x-forwarded-host` is fine: the slug
only selects which institute to check; access still requires a membership.

**Two database roles.**

| Role                                              | Used by                               | RLS                    |
| ------------------------------------------------- | ------------------------------------- | ---------------------- |
| owner (`OWNER_DATABASE_URL`, dev user `slotwise`) | `prisma migrate`, seed, test fixtures | bypasses (table owner) |
| `slotwise_app` (`DATABASE_URL` in api and web)    | API, Auth.js adapter                  | always applies         |

The owner variable is deliberately not called `DATABASE_URL`: Prisma auto-loads
`packages/db/.env` on import, and a shared name once handed the owner URL to the API.

**Policies** (`packages/db/prisma/migrations/*_row_level_security`):

- `departments`, `invites`, `audit_logs`: rows visible and writable only when
  `institute_id = app_current_institute_id()`.
- `memberships`: readable when it is the current institute **or** the row is the current
  user's own (`app.user_id`), so we can tell which institutes someone belongs to. Writes only
  in the current institute.
- `audit_logs`: the app role has no `UPDATE`/`DELETE` (append-only).
- Unset settings mean "no tenant", so a query that forgets the context sees nothing.

**Per-request context.** `withTenant(prisma, { instituteId, userId }, fn)` in `packages/db` runs
`fn` in one transaction that first calls `set_config('app.institute_id', $1, true)`. That is
the parameterised form of `SET LOCAL` (which cannot take bind parameters). It ends with the
transaction, so it works with transaction-mode connection poolers and never leaks between
requests.

**Not `FORCE ROW LEVEL SECURITY`.** On hosted Postgres the owner is not a superuser, so FORCE
would also block the seed from writing platform rows. Instead the API **refuses to start** if
its login is a superuser, has `BYPASSRLS`, or owns the tables (`PrismaService`).

## Consequences

- Isolation holds even for raw SQL and for bugs in a `where` clause: proven by
  `packages/db/test/rls.test.ts`.
- Every new tenant table needs `institute_id`, an RLS policy in its migration, and a line in the
  RLS test.
- Each request opens one short transaction per service call. Fine for now; revisit if we add
  long-running reads.
- Global tables (`institutes`, `users`, Auth.js tables) have no RLS; the app reads them only
  by id, slug or email.
