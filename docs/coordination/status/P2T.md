# P2T status

## Current milestone

2T-a — schema + read API on fixtures: done (branch `p2t/schema`, based on `c0/contracts`
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

## Next

- 2T-b: generate job (BullMQ via `QueueService`) with `SOLVER_SOURCE=mock` and
  `SNAPSHOT_SOURCE=fixture`, live progress, draft version.

## Blocked by

- Nothing for 2T-b. CI runs the read-API e2e test only after INT's migration (it skips
  itself until the tables exist).

## New dependencies

None.

## Env variables added

None yet. 2T-b adds `SNAPSHOT_SOURCE` (`fixture` | `api`) and `SOLVER_SOURCE` (`mock` | `http`)
to the API; `SOLVER_URL` already exists.

## Contract change requests

None. Open requests:

- `requests/2026-10-23-p2t-timetable-migration.md` — migration + RLS SQL, purge order (INT).
- `requests/2026-10-23-p2t-seed-uses-stream-database.md` — `pnpm db:seed` in a worktree writes
  to the main database (INT).
- `requests/2026-10-23-p2t-deterministic-sample-ids.md` — fixtures' ids don't exist in a
  seeded database (P1, INT).

## Notes for other streams

- Published slots carry copies of course/audience/faculty/room names (ADR 0050); P4/P5/P6
  should read through `timetable-read.v1`, never the tables.
- The demo term's published timetable uses the fixture's section/faculty/room ids until the
  deterministic-ids request lands.

## Last pushed

Not pushed yet.
