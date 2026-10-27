# INT status

## Current milestone

2026-10-27, evening (local `main`, not pushed): merged UI kit, P2E M1–M5, P5 M1 (Today/week,
`FLAG_P5`) and P1 1e. No schema changes. Lint, typecheck, UI 20, shared 227, db 17 and ruff pass.
Re-run on a quiet machine (2026-10-27): shared 227, UI 20, db 17, API 127 (13 files) and the
solver demo/determinism tests pass. Green.

2026-10-27: P1 1d (Excel/CSV import) and P2T 2T-a…2T-e (timetable module, behind `FLAG_P2T`)
merged into `main`. P2T merged ahead of UI and P2E under MERGE-ORDER's flag rule.
Migrations `20261027000000_p2t_timetable` (P2T's tables + its RLS, publish and immutability
SQL) and `20261027000100_import_rows_unchanged` (P1's request); `prisma migrate diff` is empty.
`TENANT_TABLES_DELETE_ORDER` deletes timetable versions before slots: slots cascade with their
version, and the draft-only trigger refuses deleting a published version's slots directly.

**Rebase now: P1, P2E, P2T, UI, P4, P5, P6, P7** (`git fetch && git rebase origin/main` once
`main` is pushed). Run `pnpm db:deploy` in your stream database; a P2T database built with
`prisma db push` must be reset first (`pnpm db:reset` there) so the migrations apply.

Earlier: P1 1b+/1c merged 2026-10-26, C0 on 2026-10-23.

## Done

- Coordination docs, `pnpm check:ownership` (+ CI on pull requests), merge order.
- Prisma schema split into `packages/db/prisma/schema/*.prisma` (no migration diff); seed
  runner calling `seed/<stream>.ts`.
- API module registry, `QueueService` (BullMQ), EventEmitter, `@FeatureFlag()`, placeholder
  modules with `GET /<area>/health`.
- Web nav registry, per-stream message files, "Coming soon" pages.
- v1 contracts, fixtures, solver JSON Schemas, solver routers per stream.
- `stream-env`, `new-worktree`, stream databases, S3 storage service in compose.
- 2026-10-26, P1's requests: Redis service in CI, home page card opens `/setup`,
  `packages/db/src/load-env.ts` loaded first by the seed, fixtures and db tests.
- 2026-10-27: P2T's migration, env variables in `apps/api/.env.example` and stream-database
  requests; P1's `unchanged` import action. Sign-in no longer fails with `error=Configuration`
  when the browser holds a cookie for a session that no longer exists (`apps/web/src/auth.ts`).
- 2026-10-27, later: `api()` takes a `raw` Blob (uploads) and `apiFile()` returns a file
  Response (downloads); P1's upload and P2T's export route use them, so only `lib/api.ts` mints
  API tokens. `withTenant()` / `PrismaService.tenant()` take `{ timeout, maxWait }`; P2T's
  `tenantLong()` uses it. `PDF_BROWSER_PATH` in `.env.example`, Chromium note in deployment.md.
  Worktrees P1, P2T and P2E rebased onto `main`; `slotwise_p2t` reset onto the migrations.
  Test isolation: under NODE_ENV=test `QueueService` prefixes BullMQ keys per process, so a
  worker in another test file can't take a job; `purgeInstitute()` allows 60 s.

Still open: `p2t-deterministic-sample-ids` (changes every demo id, so it needs a database reset
and rebuilt fixtures, which shifts P2E's and P2T's fixture tests; do it with those streams), and
the UI kit requests.

## Next

- Implement `POST /platform/institutes` (institute-provisioning.v1) in
  `apps/api/src/institute-provisioning/` for P7.
- Write migrations for streams' schema files as they merge.

## Blocked by

Nothing.

## New dependencies

- `apps/api`: `bullmq` 6.3.11, `@nestjs/event-emitter` 3.1.0.

## Env variables added

- API: `SOLVER_URL`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
  `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` (all optional with dev defaults);
  `REDIS_URL` is now read by the API.
- API and web: `FLAG_UI`, `FLAG_P2T`, `FLAG_P4`, `FLAG_P5`, `FLAG_P6`, `FLAG_P7` (optional).
- Stream worktrees: `.env.local` from `scripts/stream-env.mjs` (`WEB_PORT`, `API_PORT`,
  database names, Redis index, `SOLVER_PORT`).

## Contract change requests

## Last pushed

`c0/contracts` on 2026-10-22; PR to `main` opened from the GitHub compare page.
`main` with the C0 merge: not pushed yet.
