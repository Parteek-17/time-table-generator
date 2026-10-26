# INT status

## Current milestone

P1 merged into `main` on 2026-10-26 (`merge(p1): …`, 1b+ setup snapshot and 1c setup
wizard). No migration: P1 changed no schema file. All checks, the full suite (API 58, sample-data
tests now run with Redis) and the build pass.

**Rebase now: UI, P2E, P2T, P4, P5, P6, P7** (`git fetch && git rebase origin/main` once `main`
is pushed). New on `main`: P1's snapshot route, `ioredis` and `@playwright/test`, and the env
loader in `packages/db`, so `pnpm db:seed` and the db tests now use a worktree's `.env.local`.

C0 merged on 2026-10-23.

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
