# INT status

## Current milestone

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

Still open: `p1-api-raw-upload` and `p2t-api-file-helper` (one file helper next to `api()`),
`p2t-tenant-transaction-timeout`, `p2t-deterministic-sample-ids`, and the UI kit requests.

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
