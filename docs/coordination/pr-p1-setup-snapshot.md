Title: feat(p1): setup snapshot endpoint and setup wizard with sample data (1b+, 1c)

## What and why

Phase 1 milestones 1b+ and 1c from `docs/phase1/plan.md`, rebased onto `main` with C0.

- **1b+ setup snapshot:** `GET /terms/:termId/snapshot[?scopeId=]` returns all of a term's master
  data as `setup-snapshot.v1` (permission `masterdata.view`, ADR 0010). P2E and P2T build
  timetables from it and use `demoTermSnapshot()` until this lands.
- **1c setup wizard:** `/setup` overview and `/setup/[step]` for the 12 steps (profile →
  departments → programmes → schemes → term → cohorts → faculty → rooms → bell → calendar →
  teaching → ready), with progress, save & resume, skip and links to where each step is edited
  later. The existing master-data pages now share one `section.tsx` per area, so the wizard and
  the standalone pages show the same thing. API: `GET /setup`, `PUT /setup/steps/:step`.
- **Try with sample data:** `POST /setup/sample-institute` provisions a fictional institute
  through `provisioning.mock.ts` (a mock of INT's institute-provisioning.v1; refuses to run in
  production), which emits `institute.created`. `SampleDataListener` loads the sample on P1's
  BullMQ queue `p1.sample-data`, keyed on the event id so a repeated event loads it once.
- **Fix:** `ioredis` 5.11.1 added to `apps/api`. BullMQ 6 needs it as a peer; without it, the
  worker created at startup made the API run out of memory and every API test crashed.

## How to check

1. `docker compose up -d`, `pnpm install`, `pnpm db:reset` (or `pnpm db:deploy && pnpm db:seed`),
   `pnpm dev`.
2. Sign in at http://demo.localhost:3000 as `admin@demo.slotwise.test` (code from Mailpit,
   http://localhost:8025).
3. Open `/setup`: step through, skip one, reload, and check progress is kept.
4. On `/setup`, use "Try with sample data" and open the new institute: departments, faculty,
   rooms and terms are filled.
5. Snapshot: `GET http://localhost:4000/terms/<termId>/snapshot` as the admin returns
   `setup-snapshot.v1`.

Tests: `pnpm test` passes against Postgres (shared 164, db 17, api 58, including the new
`masterdata-setup.e2e.test.ts` and `masterdata-snapshot.e2e.test.ts`). Lint, typecheck,
format and `check:ownership` pass.

Browser: `/setup` and all 12 steps checked at 400px in light and dark (no sideways scroll; the
check found and fixed a missing-text error on steps 1–10). Playwright happy path
(`apps/web/e2e/p1/`, runs in the installed Edge, not in CI yet):
`E2E_BASE_URL=http://demo.localhost:3000 pnpm --filter @slotwise/web exec playwright test -c e2e/p1`.

CI has no Redis yet, so the two "try with sample data" API tests skip themselves there
(`requests/2026-10-26-p1-redis-in-ci.md`); they pass locally with Redis.

## Checklist

- [x] Permission checks use `can()`; no inline role strings (`@RequirePermission` on every route;
      the mock only assigns `institute_admin` to the new institute's first admin)
- [x] New tenant tables have `institute_id` and an RLS policy (with a test). No new tables
- [x] UI works at 400px width, uses plain words, strings are in your stream's
      `messages/en/<stream>.json` (`messages/en/p1.json`)
- [x] `pnpm check:ownership` passes (docs/coordination/OWNERSHIP.md)
- [x] Constraint changes have a solver test fixture. No solver changes
- [x] Decisions not covered by CLAUDE.md are recorded in `docs/adr/` (ADR 0010)

Notes for INT: no migrations. `pnpm-lock.yaml` adds `ioredis`, which P2T also adds (same
version). Open requests: `2026-10-23-p1-env-local-ignored-by-prisma-scripts.md`,
`2026-10-24-p1-home-setup-link.md`, `2026-10-24-p1-ui-progress-and-skeleton.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
