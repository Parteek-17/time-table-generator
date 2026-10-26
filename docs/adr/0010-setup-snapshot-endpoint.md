# ADR 0010: Setup snapshot endpoint

- Status: accepted
- Date: 2026-10-23

## Context

P2T sends the solver one JSON document per term (`setup-snapshot.v1`, CONTRACTS.md #1), and P2E
builds against it. P1 produces it: `GET /terms/:termId/snapshot[?scopeId=]`. The contract is
frozen; this ADR records the choices it leaves open.

## Decision

- **Where:** `apps/api/src/snapshot/` (`SnapshotModule`, registered in
  `registry/modules/p1.ts`). Permission `masterdata.view`, like every master-data read; it runs
  in a tenant transaction, so another institute's term is simply not found (404).
- **Same rows as the readiness check.** The queries mirror
  `packages/db/src/readiness-snapshot.ts` (same filters, same "courses of the cohorts' scheme
  versions"), plus the fields the solver needs. A test compares cohort, section, sub-group and
  assignment ids with `loadReadinessSnapshot()`. Sharing one loader would mean exporting it from
  `packages/db/src/index.ts`, which is INT's file; not worth a request while the two stay in
  step under test.
- **The response is parsed with `SetupSnapshotV1` before it is sent**, so the API can never
  return something that breaks the contract (a bug shows as a 500, not as bad solver input).
- **Every id in the snapshot resolves inside it.** Archived rows are left out, and so are
  references to them: an archived teacher disappears from assignments and fixed slots;
  assignments whose section, sub-group or elective section is not in the snapshot are dropped;
  elective sections keep only source sections that are included.
- **Cohorts not running this term are included** with `isRunning: false` (as in the fixture), so
  P2T can show them; the solver skips them.
- **`?scopeId=`** limits cohorts to the timetable scope, then everything else follows from
  them (sections, sub-groups, elective sections drawing from them, the cohorts' courses, and the
  assignments for those groups). Faculty, rooms, bell schedules and the calendar stay
  institute-wide: teachers and rooms are shared across scopes. A lateral-entry cohort keeps its
  `joinsCohortId` even if the host cohort is outside the scope.
- **Stable order**, independent of database collation (sorted in code), so two snapshots of the
  same data diff cleanly.

## Consequences

- P2T and P2E can switch from `demoTermSnapshot()` to the endpoint once this is on `main`;
  `status/P1.md` then says "Snapshot endpoint: done".
- If the readiness check's queries change, the comparison test fails until the snapshot follows.
