# P2T settings in the API's env schema and .env.example

- Stream: P2T
- Streams affected: INT
- Files: `apps/api/src/config/env.ts`, `apps/api/.env.example`

## What

P2T reads three settings itself (`apps/api/src/timetable/timetable.config.ts`) because
`config/env.ts` and `apps/api/.env.example` are INT's. Please list them in `.env.example`;
moving them into `envSchema` is optional (P2T then reads them from `ENV`).

## Why

So `pnpm install` copies them into new `.env` files and deployers see them.

## Exact proposed diff

```diff
--- a/apps/api/.env.example
+++ b/apps/api/.env.example
 # Python solver (services/solver). Called from background jobs only.
 SOLVER_URL="http://localhost:8000"
+
+# Timetable generation (P2T). Until P1's snapshot endpoint and P2E's solver are on main:
+# fixture = demo-term.snapshot.json, api = GET /terms/:termId/snapshot.
+SNAPSHOT_SOURCE="fixture"
+# mock = demo-term.solution.json after SOLVER_MOCK_DELAY_MS, http = POST {SOLVER_URL}/v1/timetable/solve.
+SOLVER_SOURCE="mock"
+SOLVER_MOCK_DELAY_MS="3000"
```

Production values: `SNAPSHOT_SOURCE=api`, `SOLVER_SOURCE=http`.

## Also (no change needed now)

`apps/api` had `bullmq` 6.3.11 but not `ioredis`, which BullMQ 6 treats as an optional peer:
without it `queue.add()` never connects and waits forever. P2T added `ioredis` 5.11.1 to
`apps/api` (allowed: dependencies of a package it owns files in). Any stream using
`QueueService` before P2T merges needs it too.
