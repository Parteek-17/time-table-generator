# P2E status

## Current milestone

2 — Soft constraints + score breakdown: done on `p2e/engine` (branched from `c0/contracts`
because C0 was not on `main` yet; rebase onto `origin/main` once C0 merges). Milestone 1
(hard constraints) is done too.

## Done

- `POST /v1/timetable/solve` accepts solver-timetable.v1 (validated with the JSON Schema; 422
  with plain issues otherwise) and returns a schema-valid response.
- Engine (`services/solver/src/slotwise_solver/timetable/`):
  - `problem.py` sessions, time options and candidate rooms from the snapshot;
  - `greedy.py` fast valid placement, used as the CP-SAT hint and fallback;
  - `model.py` CP-SAT in two stages. Times: pass A places as many periods as possible
    (audience, faculty, load limits, counted rooms); pass B keeps that many and lowers the
    time penalties (theory spread, >3 periods in a row, last period, idle gaps) with a
    deterministic large-neighbourhood search (free a few sections' or teachers' classes,
    re-solve, repeat). Rooms: one model for the week, placement first, then home room,
    same lab per lab group, preferred room. Anything left goes to the greedy placer;
  - `score.py` soft-constraint counts for the breakdown (the model's penalties mirror it);
  - `explain.py` plain-language messages for unplaced sessions;
  - `checker.py` independent hard-constraint checker (shares no code with the model).
- Tests: every hard constraint and every soft constraint on a tiny fixture, request weights,
  checker catches each kind of break, demo fixture, determinism, router (46 tests, ~18 s).
- Demo fixture (this 2-core laptop): 397 of 414 placed; 16 unplaced for lack of a drawing hall
  (planned gaps), 1 over a teacher's weekly limit (15 periods needed, max 14). Penalty with
  default weights: greedy start 202 → 80 with a 10 s limit, → 29 with 30 s. Two 10 s runs give
  identical output.

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
- Determinism: the improvement loop runs single-threaded on a deterministic-time budget of
  0.15 × seconds (this laptop does ~0.2 per second), and pass A uses interleaved workers. A
  wall-clock cap of `timeLimitSeconds` also applies; only a machine slower than this laptop
  would stop on it first and lose reproducibility.
- Time split: 15 % of the limit is kept for rooms; pass A gets a quarter of the rest. Status
  OPTIMAL needs every penalty proven (only realistic for small problems); INFEASIBLE needs
  only the placement count proven.
- Same-lab and home-room penalties share the `home_room` count (the contract has no separate
  same-lab key).

## Next

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
