"""CP-SAT models for the weekly timetable.

Two stages keep the model small enough for a laptop:

1. Times: x[s, option] = session s starts at that option. Every session is optional, so a
   problem with a few impossible classes still returns the rest. Hard constraints are
   at-most-one over time atoms:
   - audience: per sub-group row (or the section when it has none), whole-section classes +
     that sub-group's classes + electives from the section ≤ 1 (sub-groups of one section, and
     electives of one group, may meet in parallel);
   - faculty: ≤ 1 per atom; periods per day and per week ≤ their maximum;
   - rooms, counted: for every distinct set C of candidate rooms, the sessions whose candidates
     all lie in C ≤ rooms of C free at that atom (Hall's condition; exact for nested sets).
   Pass A places as many periods as possible (locked ones first). Pass B keeps that many and
   minimises the time-based soft penalties (theory spread, consecutive periods, late slots,
   idle gaps).
2. Rooms, for the whole week: y[s, room] for the placed sessions; ≤ 1 per room and atom.
   Placing every session comes first, then the room penalties (home room, same lab, preferred
   room). A session no room can take is offered to the greedy placer again.

The greedy placement is the pass A hint, and the answer if CP-SAT can't beat it in time.
Penalty counts mirror score.py, which reports them.
"""

from __future__ import annotations

import os
import random
import time
from collections import defaultdict
from dataclasses import dataclass

from ortools.sat.python import cp_model

from .greedy import Occupancy, greedy
from .problem import Option, Problem, Session
from .score import MAX_CONSECUTIVE, theory_per_day_cap

LOCKED_WEIGHT = 1000
# Share of the time limit kept for the room stage; of the rest, pass A's share (pass B
# gets what remains).
ROOM_SHARE = 0.15
PASS_A_SHARE = 0.25
# Above this many variables, CP-SAT's presolve costs more wall time than it saves.
BIG_MODEL_VARIABLES = 5000
# Improvement loop: deterministic time per wall second (measured on a slow 2-core laptop, so
# faster machines stop on the deterministic budget and stay reproducible), per sub-problem,
# and neighbourhood sizes in sessions.
DTIME_PER_SECOND = 0.15
SUB_DTIME = 0.2
NEIGHBOURHOOD_START = 25
NEIGHBOURHOOD_MIN = 15
# The room model takes about as long to build as the times model did (one variable per
# session and room vs per session and time). With less time left than this many times that
# build, plus a second to solve, the greedy room placer gives the rooms instead.
ROOM_BUILD_FACTOR = 1.0
# Soft weights are numbers; CP-SAT needs whole coefficients.
WEIGHT_SCALE = 100
Atom = tuple[int, int]
Placement = tuple[Option, str]
Terms = list[tuple[cp_model.IntVar, int]]


@dataclass
class ModelResult:
    status: str  # OPTIMAL | FEASIBLE
    # The number of placed periods is proven to be the most possible.
    placement_proven: bool
    # Placement and every penalty proven optimal.
    proven: bool
    placements: dict[str, Placement]


def default_workers() -> int:
    return max(1, min(8, os.cpu_count() or 1))


def scaled(weights: dict[str, float]) -> dict[str, int]:
    return {k: round(v * WEIGHT_SCALE) for k, v in weights.items()}


def solve_model(
    problem: Problem,
    time_limit: float,
    seed: int,
    weights: dict[str, float],
    workers: int | None = None,
) -> ModelResult:
    deadline = time.perf_counter() + time_limit
    sessions = problem.model_sessions
    if not sessions:
        return ModelResult("OPTIMAL", True, True, {})
    workers = workers or default_workers()
    w = scaled(weights)
    chains = _interchangeable(sessions)
    start = _canonical(sessions, chains, greedy(problem))
    weight = {s.id: (LOCKED_WEIGHT if s.locked else 1) * s.length for s in sessions}
    fallback = ModelResult("FEASIBLE", False, False, start)

    # The greedy start already used part of the limit: the times stage ends at a fixed point
    # before the overall deadline, so the room stage always keeps its share.
    times_deadline = deadline - time_limit * ROOM_SHARE
    times = _solve_times(problem, sessions, chains, start, weight, w, times_deadline, seed, workers)
    if times is None or _value(times.options, weight) < _value(start, weight):
        return fallback

    if deadline - time.perf_counter() > ROOM_BUILD_FACTOR * times.build_seconds + 1:
        rooms, rooms_proven = _solve_rooms(
            problem, sessions, times.options, start, weight, w, deadline, seed, workers
        )
    else:
        rooms, rooms_proven = {}, False
    with_rooms = _greedy_rooms(problem, sessions, times.options, rooms)
    dropped = any(s.id in times.options and s.id not in with_rooms for s in sessions)
    placements = _repair(problem, sessions, with_rooms)
    if _value(placements, weight) < _value(start, weight):
        return fallback
    placement_proven = times.placement_proven and not dropped
    proven = placement_proven and times.penalty_proven and rooms_proven
    return ModelResult("OPTIMAL" if proven else "FEASIBLE", placement_proven, proven, placements)


def _value(placements: dict[str, Placement] | dict[str, Option], weight: dict[str, int]) -> int:
    return sum(weight[sid] for sid in placements)


def _params(solver: cp_model.CpSolver, seconds: float, seed: int, workers: int) -> None:
    p = solver.parameters
    p.random_seed = seed
    p.num_workers = workers
    # Deterministic: interleaved workers and a deterministic time budget. The wall-clock cap
    # only bites on machines much slower than CP-SAT's deterministic clock.
    p.interleave_search = True
    p.max_deterministic_time = max(0.1, seconds)
    p.max_time_in_seconds = max(0.1, seconds)
    # Probing and symmetry detection cost seconds of wall time here and rarely pay off.
    p.cp_model_probing_level = 0
    p.symmetry_level = 0


def _left(deadline: float, share: float) -> float:
    return max(0.1, (deadline - time.perf_counter()) * share)


@dataclass
class Times:
    options: dict[str, Option]
    placement_proven: bool
    penalty_proven: bool
    # Seconds spent building the model before pass A (an estimate for the room model).
    build_seconds: float = 0.0


def _solve_times(
    problem: Problem,
    sessions: list[Session],
    chains: list[tuple[Session, Session]],
    start: dict[str, Placement],
    weight: dict[str, int],
    w: dict[str, int],
    deadline: float,
    seed: int,
    workers: int,
) -> Times | None:
    began = time.perf_counter()
    m = cp_model.CpModel()
    x: dict[str, list[cp_model.IntVar]] = {}
    for i, s in enumerate(sessions):
        x[s.id] = [m.new_bool_var(f"x{i}_{k}") for k in range(len(s.options))]
        m.add_at_most_one(x[s.id])
        # Only the chosen option is hinted; at-most-one makes the others false. Hinting all of
        # them costs seconds of Python on a large institute.
        hinted = start.get(s.id)
        for o, v in zip(s.options, x[s.id], strict=True):
            if hinted is not None and hinted[0] == o:
                m.add_hint(v, True)

    covers: dict[str, list[tuple[Atom, cp_model.IntVar]]] = {
        s.id: [(a, v) for o, v in zip(s.options, x[s.id], strict=True) for a in problem.atoms(o)]
        for s in sessions
    }

    _audience_rows(m, problem, sessions, covers)
    _faculty_rows(m, problem, sessions, x, covers)
    _room_counts(m, problem, sessions, covers)

    # Interchangeable sessions of one assignment are kept in order (symmetry breaking).
    for a, b in chains:
        placed_b = m.new_bool_var("")
        m.add(cp_model.LinearExpr.sum(x[b.id]) == placed_b)
        m.add(cp_model.LinearExpr.sum(x[b.id]) <= cp_model.LinearExpr.sum(x[a.id]))
        ord_a = cp_model.LinearExpr.weighted_sum(x[a.id], list(range(len(x[a.id]))))
        ord_b = cp_model.LinearExpr.weighted_sum(x[b.id], list(range(len(x[b.id]))))
        m.add(ord_a < ord_b).only_enforce_if(placed_b)

    pv, pc = [], []
    for s in sessions:
        pv += x[s.id]
        pc += [weight[s.id]] * len(x[s.id])
    placed_value = cp_model.LinearExpr.weighted_sum(pv, pc)

    def read(solver: cp_model.CpSolver) -> dict[str, Option]:
        out: dict[str, Option] = {}
        for s in sessions:
            for o, v in zip(s.options, x[s.id], strict=True):
                if solver.boolean_value(v):
                    out[s.id] = o
                    break
        return out

    # Pass A: place as many periods as possible. If it finds nothing in time, go on from the
    # greedy timetable (its placement count is then unproven).
    m.maximize(placed_value)
    built = time.perf_counter() - began
    solver = cp_model.CpSolver()
    _params(solver, _left(deadline, PASS_A_SHARE), seed, workers)
    if len(m.proto.variables) > BIG_MODEL_VARIABLES:
        solver.parameters.cp_model_presolve = False
    status = solver.solve(m)
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        best = read(solver)
        placement_proven = status == cp_model.OPTIMAL
    else:
        best = {sid: p[0] for sid, p in start.items()}
        placement_proven = False
    best_value = _value(best, weight)

    penalties = _time_penalties(m, problem, sessions, x, w)
    if not penalties:
        return Times(best, placement_proven, True, built)

    # Pass B: keep that many periods, minimise the time-based penalties.
    m.add(placed_value >= best_value)
    m.clear_hints()
    m.minimize(
        cp_model.LinearExpr.weighted_sum([v for v, _ in penalties], [c for _, c in penalties])
    )
    improved, proven = _improve(m, problem, sessions, x, best, deadline, _left(deadline, 1.0), seed)
    return Times(improved, placement_proven, proven, built)


def _improve(
    m: cp_model.CpModel,
    problem: Problem,
    sessions: list[Session],
    x: dict[str, list[cp_model.IntVar]],
    current: dict[str, Option],
    deadline: float,
    seconds: float,
    seed: int,
) -> tuple[dict[str, Option], bool]:
    """Large-neighbourhood search: free the classes of a few sections or teachers, fix the rest
    and re-solve single-threaded from the current timetable. Keeps the best (lowest penalty).

    Deterministic: the neighbourhoods come from `seed` and the budget is deterministic time
    (DTIME_PER_SECOND × seconds), so a wall-clock stop only happens on slower machines.
    Returns the timetable and whether its penalty is proven minimal (only when the whole
    problem fits in one neighbourhood, or the penalty is 0).
    """
    rng = random.Random(seed)
    stop = min(deadline, time.perf_counter() + seconds)
    budget = seconds * DTIME_PER_SECOND
    used = 0.0
    owners: dict[str, list[Session]] = defaultdict(list)
    for s in sessions:
        for sid in s.section_ids:
            owners[f"s:{sid}"].append(s)
        for fid in s.faculty_ids:
            owners[f"f:{fid}"].append(s)
    keys = sorted(owners)
    size = min(len(sessions), NEIGHBOURHOOD_START)
    best_obj: float | None = None
    iteration = 0
    while used < budget and time.perf_counter() < stop:
        if size >= len(sessions):
            free = {s.id for s in sessions}
        else:
            free = set()
            while len(free) < size:
                free.update(s.id for s in owners[keys[rng.randrange(len(keys))]])
        sub = m.clone()
        for s in sessions:
            hinted = current.get(s.id)
            for o, v in zip(s.options, x[s.id], strict=True):
                value = int(hinted == o)
                if s.id in free:
                    sub.add_hint(v, value)
                else:
                    domain = sub.proto.variables[v.index].domain  # [lo, hi] of a bool
                    domain[0] = domain[1] = value
        solver = cp_model.CpSolver()
        p = solver.parameters
        p.random_seed = seed + iteration
        p.num_workers = 1
        p.max_deterministic_time = min(SUB_DTIME, budget - used)
        p.max_time_in_seconds = max(0.05, stop - time.perf_counter())
        p.symmetry_level = 0
        status = solver.solve(sub)
        used += solver.response_proto.deterministic_time
        iteration += 1
        if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            if best_obj is None or solver.objective_value <= best_obj:
                best_obj = solver.objective_value
                current = {
                    s.id: o
                    for s in sessions
                    for o, v in zip(s.options, x[s.id], strict=True)
                    if solver.boolean_value(v)
                }
            if status == cp_model.OPTIMAL and len(free) == len(sessions):
                return current, True
            if best_obj == 0:
                return current, True
        # Grow the neighbourhood while sub-problems solve to optimality, shrink otherwise.
        if status == cp_model.OPTIMAL:
            size = min(len(sessions), int(size * 1.25) + 1)
        else:
            size = max(NEIGHBOURHOOD_MIN, int(size * 0.8))
    return current, False


def _audience_rows(
    m: cp_model.CpModel,
    problem: Problem,
    sessions: list[Session],
    covers: dict[str, list[tuple[Atom, cp_model.IntVar]]],
) -> None:
    whole: dict[str, dict[Atom, list]] = defaultdict(lambda: defaultdict(list))
    part: dict[str, dict[Atom, list]] = defaultdict(lambda: defaultdict(list))
    elective_terms: dict[tuple[str, str], dict[Atom, list]] = defaultdict(lambda: defaultdict(list))
    elective_own: dict[str, dict[Atom, list]] = defaultdict(lambda: defaultdict(list))
    for s in sessions:
        for atom, var in covers[s.id]:
            if s.target_kind == "section":
                whole[s.target_id][atom].append(var)
            elif s.target_kind == "subgroup":
                part[s.target_id][atom].append(var)
            else:
                elective_own[s.target_id][atom].append(var)
                for sid in s.section_ids:
                    elective_terms[(sid, s.group_key)][atom].append(var)

    # One "the section is at an elective of this group" literal per (section, group, atom).
    elective_busy: dict[str, dict[Atom, list]] = defaultdict(lambda: defaultdict(list))
    for (sid, _group), by_atom in elective_terms.items():
        for atom, vars_ in by_atom.items():
            elective_busy[sid][atom].append(_any(m, vars_))

    for sid, subs in problem.subgroups_of.items():
        rows = subs or [None]
        atoms = set(whole.get(sid, {})) | set(elective_busy.get(sid, {}))
        for gid in subs:
            atoms |= set(part.get(gid, {}))
        for atom in sorted(atoms):
            base = whole[sid].get(atom, []) + elective_busy[sid].get(atom, [])
            for gid in rows:
                row = base + (part[gid].get(atom, []) if gid is not None else [])
                if len(row) > 1:
                    m.add_at_most_one(row)
    for by_atom in elective_own.values():
        for row in by_atom.values():
            if len(row) > 1:
                m.add_at_most_one(row)


def _any(m: cp_model.CpModel, lits: list[cp_model.IntVar]) -> cp_model.IntVar:
    """A literal equal to OR(lits)."""
    if len(lits) == 1:
        return lits[0]
    lit = m.new_bool_var("")
    for v in lits:
        m.add_implication(v, lit)
    m.add_bool_or(lits).only_enforce_if(lit)
    return lit


def _faculty_rows(
    m: cp_model.CpModel,
    problem: Problem,
    sessions: list[Session],
    x: dict[str, list[cp_model.IntVar]],
    covers: dict[str, list[tuple[Atom, cp_model.IntVar]]],
) -> None:
    fac_atoms: dict[str, dict[Atom, list]] = defaultdict(lambda: defaultdict(list))
    fac_day: dict[str, dict[int, tuple[list, list]]] = defaultdict(
        lambda: defaultdict(lambda: ([], []))
    )
    for s in sessions:
        for fid in s.faculty_ids:
            for atom, var in covers[s.id]:
                fac_atoms[fid][atom].append(var)
            for o, var in zip(s.options, x[s.id], strict=True):
                vs, cs = fac_day[fid][o.weekday]
                vs.append(var)
                cs.append(s.length)
    for by_atom in fac_atoms.values():
        for row in by_atom.values():
            if len(row) > 1:
                m.add_at_most_one(row)
    for fid, by_day in fac_day.items():
        f = problem.faculty.get(fid)
        if f is None:
            continue
        busy = problem.faculty_busy_load.get(fid, {})
        week_v: list = []
        week_c: list[int] = []
        for day, (vs, cs) in by_day.items():
            cap = max(0, f["maxPeriodsPerDay"] - busy.get(day, 0))
            if sum(cs) > cap:
                m.add(cp_model.LinearExpr.weighted_sum(vs, cs) <= cap)
            week_v += vs
            week_c += cs
        cap = max(0, f["maxPeriodsPerWeek"] - sum(busy.values()))
        m.add(cp_model.LinearExpr.weighted_sum(week_v, week_c) <= cap)


def _room_counts(
    m: cp_model.CpModel,
    problem: Problem,
    sessions: list[Session],
    covers: dict[str, list[tuple[Atom, cp_model.IntVar]]],
) -> None:
    sets = sorted({frozenset(s.rooms) for s in sessions}, key=lambda c: (len(c), sorted(c)))
    busy = {r: problem.room_busy_atoms(r) for r in problem.rooms}
    for c in sets:
        inside = [s for s in sessions if frozenset(s.rooms) <= c]
        by_atom: dict[Atom, list] = defaultdict(list)
        for s in inside:
            for atom, var in covers[s.id]:
                by_atom[atom].append(var)
        for atom in sorted(by_atom):
            row = by_atom[atom]
            cap = sum(1 for r in c if atom not in busy[r])
            if len(row) > cap:
                if cap == 1:
                    m.add_at_most_one(row)
                else:
                    m.add(cp_model.LinearExpr.sum(row) <= cap)


def _periods(o: Option, length: int) -> range:
    return range(o.start_index, o.start_index + length)


def _time_penalties(
    m: cp_model.CpModel,
    problem: Problem,
    sessions: list[Session],
    x: dict[str, list[cp_model.IntVar]],
    w: dict[str, int],
) -> Terms:
    """Time-based soft penalties as (literal or count variable, coefficient)."""
    terms: Terms = []

    # theory_spread: a course's theory periods per day above the cap.
    if w["theory_spread"]:
        total: dict[tuple[str, str], int] = defaultdict(int)
        for s in problem.sessions:
            if s.component in ("lecture", "tutorial"):
                total[(s.course_id, s.target_id)] += 1
        per_day: dict[tuple[str, str], dict[int, list]] = defaultdict(lambda: defaultdict(list))
        days: dict[tuple[str, str], int] = {}
        for s in sessions:
            if s.component not in ("lecture", "tutorial") or s.bell is None:
                continue
            key = (s.course_id, s.target_id)
            days[key] = len(s.bell.working_days)
            for o, v in zip(s.options, x[s.id], strict=True):
                per_day[key][o.weekday].append(v)
        for key, by_day in per_day.items():
            cap = theory_per_day_cap(total[key], days[key])
            for vs in by_day.values():
                if len(vs) > cap:
                    excess = m.new_int_var(0, len(vs) - cap, "")
                    m.add(excess >= cp_model.LinearExpr.sum(vs) - cap)
                    terms.append((excess, w["theory_spread"]))

    # late_slots: classes reaching the last period of the day.
    if w["late_slots"]:
        for s in sessions:
            if s.bell is None:
                continue
            for o, v in zip(s.options, x[s.id], strict=True):
                if o.start_index + s.length - 1 >= s.bell.last_index:
                    terms.append((v, w["late_slots"]))

    # Busy literals per (owner, bell, day, period) for the two patterns below. Keyed by the
    # bell's id: hashing the Bell itself (all its periods) is slow on a large institute.
    bells = {b.id: b for b in problem.bells}

    def busy_grid(owner_of) -> dict[tuple[str, str, int], dict[int, list]]:  # noqa: ANN001
        grid: dict[tuple[str, str, int], dict[int, list]] = defaultdict(lambda: defaultdict(list))
        for s in sessions:
            if s.bell is None:
                continue
            bell_id = s.bell.id
            for o, v in zip(s.options, x[s.id], strict=True):
                periods = _periods(o, s.length)
                for owner in owner_of(s):
                    row = grid[(owner, bell_id, o.weekday)]
                    for p in periods:
                        row[p].append(v)
        return grid

    # faculty_consecutive: every window of MAX_CONSECUTIVE + 1 back-to-back busy periods.
    if w["faculty_consecutive"]:
        window = MAX_CONSECUTIVE + 1
        starts = {bid: b.block_starts(window) for bid, b in bells.items()}
        for (_fid, bell_id, _day), by_p in busy_grid(lambda s: s.faculty_ids).items():
            for first in starts[bell_id]:
                ps = range(first, first + window)
                if not all(p in by_p for p in ps):
                    continue
                v = m.new_bool_var("")
                m.add(
                    cp_model.LinearExpr.sum([t for p in ps for t in by_p[p]]) <= MAX_CONSECUTIVE + v
                )
                terms.append((v, w["faculty_consecutive"]))

    # section_idle_gaps: free periods with a class before and after, per section and day.
    if w["section_idle_gaps"]:
        for (_sid, bell_id, _day), by_p in busy_grid(lambda s: s.section_ids).items():
            indexes = [p.index for p in bells[bell_id].periods]
            if len([p for p in indexes if p in by_p]) < 2:
                continue
            busy = {}
            for p in indexes:
                lits = by_p.get(p, [])
                if not lits:
                    busy[p] = None
                    continue
                b = m.new_bool_var("")
                for v in lits:
                    m.add_implication(v, b)
                m.add(b <= cp_model.LinearExpr.sum(lits))
                busy[p] = b
            # before[p]: some class at or before p; after[p]: at or after p.
            before: dict[int, cp_model.IntVar | None] = {}
            prev = None
            for p in indexes:
                before[p] = _or_upper(m, prev, busy[p])
                prev = before[p]
            after: dict[int, cp_model.IntVar | None] = {}
            nxt = None
            for p in reversed(indexes):
                after[p] = _or_upper(m, nxt, busy[p])
                nxt = after[p]
            for k in range(1, len(indexes) - 1):
                p = indexes[k]
                b, a = before[indexes[k - 1]], after[indexes[k + 1]]
                if a is None or b is None:
                    continue
                gap = m.new_bool_var("")
                own = busy[p]
                if own is None:
                    m.add(gap >= b + a - 1)
                else:
                    m.add(gap >= b + a - 1 - own)
                terms.append((gap, w["section_idle_gaps"]))

    return terms


def _or_upper(
    m: cp_model.CpModel, a: cp_model.IntVar | None, b: cp_model.IntVar | None
) -> cp_model.IntVar | None:
    """A literal ≥ a and ≥ b (minimisation keeps it at OR(a, b))."""
    if a is None:
        return b
    if b is None:
        return a
    lit = m.new_bool_var("")
    m.add_implication(a, lit)
    m.add_implication(b, lit)
    return lit


def _solve_rooms(
    problem: Problem,
    sessions: list[Session],
    times: dict[str, Option],
    start: dict[str, Placement],
    weight: dict[str, int],
    w: dict[str, int],
    deadline: float,
    seed: int,
    workers: int,
) -> tuple[dict[str, Placement], bool]:
    busy = {r: problem.room_busy_atoms(r) for r in problem.rooms}
    sections = {s["id"]: s for s in problem.snapshot["sections"]}
    assignments = {a["id"]: a for a in problem.snapshot["assignments"]}
    m = cp_model.CpModel()
    y: dict[str, dict[str, cp_model.IntVar]] = {}
    rows: dict[tuple[str, Atom], list] = defaultdict(list)
    penalties: Terms = []
    labs: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    placed = [s for s in sessions if s.id in times]
    for s in placed:
        atoms = problem.atoms(times[s.id])
        home = (
            sections.get(s.target_id, {}).get("homeRoomId") if s.target_kind == "section" else None
        )
        a = assignments[s.assignment_id]
        y[s.id] = {}
        for r in s.rooms:
            if any(at in busy[r] for at in atoms):
                continue
            v = m.new_bool_var("")
            y[s.id][r] = v
            for at in atoms:
                rows[(r, at)].append(v)
            if start.get(s.id) == (times[s.id], r):
                m.add_hint(v, True)
            if s.component == "practical":
                labs[s.assignment_id][r].append(v)
            elif home and r != home and w["home_room"]:
                penalties.append((v, w["home_room"]))
            if w["preferred_room"] and _misses_preference(a, problem.rooms[r]):
                penalties.append((v, w["preferred_room"]))
        m.add_at_most_one(y[s.id].values())
    for row in rows.values():
        if len(row) > 1:
            m.add_at_most_one(row)
    # home_room also counts each extra lab a lab group uses (same lab every week).
    if w["home_room"]:
        for by_room in labs.values():
            if len(by_room) > 1:
                for vs in by_room.values():
                    penalties.append((_any(m, vs), w["home_room"]))

    # Placing every session outweighs any penalty.
    big = 1 + sum(c for _, c in penalties)
    terms = [v for s in placed for v in y[s.id].values()]
    coefs = [big * weight[s.id] for s in placed for _ in y[s.id]]
    terms += [v for v, _ in penalties]
    coefs += [-c for _, c in penalties]
    m.maximize(cp_model.LinearExpr.weighted_sum(terms, coefs))
    solver = cp_model.CpSolver()
    _params(solver, _left(deadline, 1.0), seed, workers)
    status = solver.solve(m)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {}, False
    out: dict[str, Placement] = {}
    for s in placed:
        room = next((r for r, v in y[s.id].items() if solver.boolean_value(v)), None)
        if room is not None:
            out[s.id] = (times[s.id], room)
    return out, status == cp_model.OPTIMAL


def _misses_preference(assignment: dict, room: dict) -> bool:
    """Same rule as score.count_preferred_room."""
    if assignment.get("preferredRoomId"):
        return room["id"] != assignment["preferredRoomId"]
    if assignment.get("preferredLabCategory"):
        wanted = assignment["preferredLabCategory"].strip().lower()
        return not any(c.strip().lower() == wanted for c in room["labCategories"])
    return False


def _greedy_rooms(
    problem: Problem,
    sessions: list[Session],
    times: dict[str, Option],
    placements: dict[str, Placement],
) -> dict[str, Placement]:
    """Give sessions the room stage left out a free room at their chosen time, if any."""
    occ = Occupancy(problem)
    for s in sessions:
        if s.id in placements:
            occ.add(s, *placements[s.id])
    out = dict(placements)
    for s in sessions:
        if s.id in out or s.id not in times:
            continue
        room = next((r for r in s.rooms if occ.fits(s, times[s.id], r)), None)
        if room is not None:
            occ.add(s, times[s.id], room)
            out[s.id] = (times[s.id], room)
    return out


def _repair(
    problem: Problem, sessions: list[Session], placements: dict[str, Placement]
) -> dict[str, Placement]:
    """Offer every unplaced session to the greedy placer around the current timetable."""
    occ = Occupancy(problem)
    for s in sessions:
        if s.id in placements:
            occ.add(s, *placements[s.id])
    out = dict(placements)
    for s in sessions:
        if s.id in out:
            continue
        for o in s.options:
            room = next((r for r in s.rooms if occ.fits(s, o, r)), None)
            if room is not None:
                occ.add(s, o, room)
                out[s.id] = (o, room)
                break
    return out


def _interchangeable(sessions: list[Session]) -> list[tuple[Session, Session]]:
    """Consecutive (a, b) sessions of one assignment with identical choices."""
    out = []
    for a, b in zip(sessions, sessions[1:], strict=False):
        if (
            a.assignment_id == b.assignment_id
            and not a.locked
            and not b.locked
            and a.options == b.options
            and a.rooms == b.rooms
        ):
            out.append((a, b))
    return out


def _canonical(
    sessions: list[Session],
    chains: list[tuple[Session, Session]],
    start: dict[str, Placement],
) -> dict[str, Placement]:
    """Reorder a placement so interchangeable sessions satisfy the symmetry breaking."""
    nxt = {a.id: b for a, b in chains}
    has_prev = {b.id for _, b in chains}
    out = dict(start)
    for s in sessions:
        if s.id in has_prev or s.id not in nxt:
            continue
        group = [s]
        while group[-1].id in nxt:
            group.append(nxt[group[-1].id])
        index = {o: k for k, o in enumerate(s.options)}
        chosen = sorted((start[g.id] for g in group if g.id in start), key=lambda p: index[p[0]])
        for g in group:
            out.pop(g.id, None)
        for g, p in zip(group, chosen, strict=False):
            out[g.id] = p
    return out
