# P2E status

## Current milestone

1 — Model + hard constraints: done on `p2e/engine` (branched from `c0/contracts` because C0
was not on `main` yet; rebase onto `origin/main` once C0 merges).

## Done

- `POST /v1/timetable/solve` accepts solver-timetable.v1 (validated with the JSON Schema; 422
  with plain issues otherwise) and returns a schema-valid response.
- Engine (`services/solver/src/slotwise_solver/timetable/`):
  - `problem.py` sessions, time options and candidate rooms from the snapshot;
  - `greedy.py` fast valid placement, used as the CP-SAT hint and fallback;
  - `model.py` CP-SAT in two stages: times (audience, faculty, load limits, counted rooms),
    then rooms per day; anything left is re-offered to the greedy placer;
  - `score.py` soft-constraint counts for the breakdown (not optimised yet: milestone 2);
  - `explain.py` plain-language messages for unplaced sessions;
  - `checker.py` independent hard-constraint checker (shares no code with the model).
- Tests: every hard constraint on a tiny fixture, checker catches each kind of break, demo
  fixture, determinism (same input + seed → same output), router.
- Demo fixture (this 2-core laptop, 10 s limit): 396 of 414 placed; 16 unplaced for lack of a
  drawing hall (planned gaps), 1 over a teacher's weekly limit (15 periods needed, max 14),
  1 lab reported `time_limit` (not proven impossible yet; milestone 3's relaxation explains it).

Decisions (behaviour other streams may notice):

- Electives with the same `electiveGroup` may meet at the same time for the same source
  sections; different groups (or no group) never overlap. Not forced to be parallel yet.
- Clashes are checked in minutes, so cohorts on different bell schedules clash only when their
  times overlap. Faculty unavailability, faculty/room busy slots and fixed-slot teachers are
  read in the default bell schedule's periods; section busy slots in the section's schedule.
- Faculty busy slots count towards their per-day and per-week limits.
- Reason codes are the contract's (`no_free_slot`, `faculty_over_max`, …), not the names in
  the stream brief.
- Status: OPTIMAL/INFEASIBLE only when CP-SAT proves the placement count; otherwise
  FEASIBLE (all placed) or TIMEOUT (some unplaced).
- Determinism: interleaved CP-SAT workers + a deterministic time budget. A wall-clock cap of
  `timeLimitSeconds` also applies; on a much slower machine it can stop the search first.

## Next

- Milestone 2: soft constraints in the model + score breakdown (two-phase: keep the placement
  count, then minimise penalties).
- Milestone 3: relaxation pass for reason codes, tiny fixture per code.

## Blocked by

- C0 (`c0/contracts`) merging to `main`.
- `2026-10-23-p2e-solver-image-contracts.md`: the solver image needs `contracts/` for request
  validation.

## New dependencies

- `services/solver`: `ortools` 9.15.6755, `jsonschema` 4.26.0 (runtime). OWNERSHIP.md lets
  P2E edit solver dependencies; P6 shares `pyproject.toml`/`uv.lock`.

## Env variables added

- `SOLVER_CONTRACTS_DIR` (optional): folder holding `timetable_v1.schema.json`; defaults to
  `services/solver/contracts`.

## Contract change requests

- None.

## Last pushed

Not pushed yet.
