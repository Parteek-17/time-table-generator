# INT status

## Current milestone

C0 — contracts and scaffolding, merged into `main` on 2026-10-23 (`merge(c0): …`). No
migration: `prisma migrate diff` from the migrations to the split schema is empty. All flags
stay off.

**Rebase now: P1, UI, P2E, P2T, P4, P5, P6, P7** (`git fetch && git rebase origin/main` once
`main` is pushed). Contracts, schema files, registries and shared configs are new on `main`.

`pnpm test` is green on `main` (2026-10-26): P1's collation-independent faculty sort test
(`b0b51bc` on `p1/setup-snapshot`) was cherry-picked; P1's rebase drops its copy.
`requests/done/2026-10-23-int-p1-faculty-sort-test.md`.

## Done

- Coordination docs, `pnpm check:ownership` (+ CI on pull requests), merge order.
- Prisma schema split into `packages/db/prisma/schema/*.prisma` (no migration diff); seed
  runner calling `seed/<stream>.ts`.
- API module registry, `QueueService` (BullMQ), EventEmitter, `@FeatureFlag()`, placeholder
  modules with `GET /<area>/health`.
- Web nav registry, per-stream message files, "Coming soon" pages.
- v1 contracts, fixtures, solver JSON Schemas, solver routers per stream.
- `stream-env`, `new-worktree`, stream databases, S3 storage service in compose.

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
