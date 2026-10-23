# P2T status

## Current milestone

2T-b — generate job with mock solver: done (branch `p2t/schema`, based on `c0/contracts`
until C0 is on `main`; rebase then).

## Done

- 2T-a: `timetable.prisma` (snapshots, versions, slots, solve jobs; back-relations on
  Institute, Term, TimetableScope), ADR 0050. RLS + integrity SQL handed to INT (request below).
- `@slotwise/shared/timetable`: `slotsFromPlacements()` (solver placements → slot rows with
  names copied from the snapshot), `slotIsFor()` / `readResponse()` (timetable-read.v1 shape).
  Reproduces `demo-term.published-timetable.json` from the snapshot + solution fixtures.
- `GET /terms/:termId/timetable` (timetable-read.v1) behind `@FeatureFlag('P2T')`, permission
  `timetable.view`; drafts never returned; responses parsed with the contract.
- `seed/p2t.ts`: publishes version 1 of the demo term from the fixtures (394 classes, 20 not
  placed).
- 2T-b: `POST /terms/:termId/timetable/generate` (202, `timetable.edit` for every department of
  the scope's cohorts; a second click follows the running job), `GET /timetable/jobs/:jobId`
  (progress 0–100, plain-language error), `GET /terms/:termId/timetable/jobs`,
  `GET /terms/:termId/timetable/versions` (drafts included, editors only).
- BullMQ queue `p2t.solve` (`timetable/jobs/solve.worker.ts`): snapshot (fixture or P1's route,
  called as the coordinator) → stored snapshot → solver (mock or HTTP) → draft version.
  Other scopes' published slots go in as `busySlots` (`busySlotsFrom()` in shared). The worker
  starts with the API, or on first enqueue under tests (CI has no Redis).

## Next

- 2T-c: views by section, sub-group, faculty and room; week grid with breaks and lab blocks;
  phone day view; the Generate screen with its progress bar (polls the job).

## Blocked by

- Nothing for 2T-c. CI runs the timetable API e2e tests only after INT's migration (they skip
  themselves until the tables exist).

## New dependencies

- `apps/api`: `ioredis` 5.11.1 (BullMQ 6's optional peer; without it `QueueService` hangs).

## Env variables added

- API, read in `timetable/timetable.config.ts` (all optional): `SNAPSHOT_SOURCE` (`fixture` |
  `api`, default `fixture`), `SOLVER_SOURCE` (`mock` | `http`, default `mock`),
  `SOLVER_MOCK_DELAY_MS` (default 3000). `SOLVER_URL` already existed.

## Contract change requests

None. Open requests:

- `requests/2026-10-23-p2t-timetable-migration.md` — migration + RLS SQL, purge order (INT).
- `requests/2026-10-23-p2t-seed-uses-stream-database.md` — `pnpm db:seed` in a worktree writes
  to the main database (INT).
- `requests/2026-10-23-p2t-deterministic-sample-ids.md` — fixtures' ids don't exist in a
  seeded database (P1, INT).
- `requests/2026-10-23-p2t-env-variables.md` — P2T settings in `.env.example` (INT).

## Notes for other streams

- Published slots carry copies of course/audience/faculty/room names (ADR 0050); P4/P5/P6
  should read through `timetable-read.v1`, never the tables.
- The demo term's published timetable uses the fixture's section/faculty/room ids until the
  deterministic-ids request lands.
- Using `QueueService`? `apps/api` needs `ioredis` (added on this branch).

## Last pushed

Not pushed yet.
