"""CP-SAT models for the weekly timetable (hard constraints).

Two stages keep the model small enough for a laptop:

1. Time: x[s, option] = session s starts at that option. Every session is optional, so a
   problem with a few impossible classes still returns the rest; the objective places as many
   periods as possible (locked ones first). Constraints are at-most-one over time atoms:
   - audience: per sub-group row (or the section when it has none), whole-section classes +
     that sub-group's classes + electives from the section ≤ 1 (sub-groups of one section, and
     electives of one group, may meet in parallel);
   - faculty: ≤ 1 per atom; periods per day and per week ≤ their maximum;
   - rooms, counted: for every distinct set C of candidate rooms, the sessions whose candidates
     all lie in C ≤ rooms of C free at that atom (Hall's condition; exact for nested sets).
2. Rooms, per day: y[s, room] for the sessions stage 1 put on that day; ≤ 1 per room and atom.
   A session no room can take is dropped and offered to the greedy placer again.

The greedy placement is the stage 1 hint, and the answer if CP-SAT can't beat it in time.
"""

from __future__ import annotations

import os
import time
from collections import defaultdict
from dataclasses import dataclass

from ortools.sat.python import cp_model

from .greedy import Occupancy, greedy
from .problem import Option, Problem, Session

LOCKED_WEIGHT = 1000
# Share of the time limit stage 1 may use; rooms and repair get the rest.
TIME_STAGE_SHARE = 0.85
Atom = tuple[int, int]
Placement = tuple[Option, str]


@dataclass
class ModelResult:
    status: str  # OPTIMAL | FEASIBLE
    proven: bool
    placements: dict[str, Placement]


def default_workers() -> int:
    return max(1, min(8, os.cpu_count() or 1))


def solve_model(
    problem: Problem, time_limit: float, seed: int, workers: int | None = None
) -> ModelResult:
    deadline = time.perf_counter() + time_limit
    sessions = problem.model_sessions
    if not sessions:
        return ModelResult("OPTIMAL", True, {})
    workers = workers or default_workers()
    chains = _interchangeable(sessions)
    start = _canonical(sessions, chains, greedy(problem))
    weight = {s.id: (LOCKED_WEIGHT if s.locked else 1) * s.length for s in sessions}

    times, proven = _solve_times(problem, sessions, chains, start, weight, deadline, seed, workers)
    if times is None or _value(times, weight) < _value(start, weight):
        return ModelResult("FEASIBLE", False, start)

    placements = _solve_rooms(problem, sessions, times, start, weight, deadline, seed, workers)
    dropped = [s for s in sessions if s.id in times and s.id not in placements]
    placements = _repair(problem, sessions, placements)
    if _value(placements, weight) < _value(start, weight):
        return ModelResult("FEASIBLE", False, start)
    proven = proven and not dropped
    return ModelResult("OPTIMAL" if proven else "FEASIBLE", proven, placements)


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


def _solve_times(
    problem: Problem,
    sessions: list[Session],
    chains: list[tuple[Session, Session]],
    start: dict[str, Placement],
    weight: dict[str, int],
    deadline: float,
    seed: int,
    workers: int,
) -> tuple[dict[str, Option] | None, bool]:
    m = cp_model.CpModel()
    x: dict[str, list[cp_model.IntVar]] = {}
    for i, s in enumerate(sessions):
        x[s.id] = [m.new_bool_var(f"x{i}_{k}") for k in range(len(s.options))]
        m.add_at_most_one(x[s.id])
        hinted = start.get(s.id)
        for o, v in zip(s.options, x[s.id], strict=True):
            m.add_hint(v, hinted is not None and hinted[0] == o)

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

    terms, coefs = [], []
    for s in sessions:
        terms += x[s.id]
        coefs += [weight[s.id]] * len(x[s.id])
    m.maximize(cp_model.LinearExpr.weighted_sum(terms, coefs))

    solver = cp_model.CpSolver()
    budget = (deadline - time.perf_counter()) * TIME_STAGE_SHARE
    _params(solver, budget, seed, workers)
    status = solver.solve(m)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return None, False
    out: dict[str, Option] = {}
    for s in sessions:
        for o, v in zip(s.options, x[s.id], strict=True):
            if solver.boolean_value(v):
                out[s.id] = o
                break
    return out, status == cp_model.OPTIMAL


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
            if len(vars_) == 1:
                lit = vars_[0]
            else:
                lit = m.new_bool_var("")
                for v in vars_:
                    m.add_implication(v, lit)
                m.add_bool_or(vars_).only_enforce_if(lit)
            elective_busy[sid][atom].append(lit)

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


def _solve_rooms(
    problem: Problem,
    sessions: list[Session],
    times: dict[str, Option],
    start: dict[str, Placement],
    weight: dict[str, int],
    deadline: float,
    seed: int,
    workers: int,
) -> dict[str, Placement]:
    busy = {r: problem.room_busy_atoms(r) for r in problem.rooms}
    by_day: dict[int, list[Session]] = defaultdict(list)
    for s in sessions:
        if s.id in times:
            by_day[times[s.id].weekday].append(s)
    out: dict[str, Placement] = {}
    days = sorted(by_day)
    for n, day in enumerate(days):
        day_sessions = by_day[day]
        m = cp_model.CpModel()
        y: dict[str, dict[str, cp_model.IntVar]] = {}
        rows: dict[tuple[str, Atom], list] = defaultdict(list)
        for s in day_sessions:
            atoms = problem.atoms(times[s.id])
            y[s.id] = {}
            for r in s.rooms:
                if any(a in busy[r] for a in atoms):
                    continue
                v = m.new_bool_var("")
                y[s.id][r] = v
                for a in atoms:
                    rows[(r, a)].append(v)
                hinted = start.get(s.id)
                m.add_hint(v, hinted is not None and hinted == (times[s.id], r))
            m.add_at_most_one(y[s.id].values())
        for row in rows.values():
            if len(row) > 1:
                m.add_at_most_one(row)
        terms, coefs = [], []
        for s in day_sessions:
            # Earlier rooms in s.rooms are preferred (preferred, home room, smallest).
            for rank, v in enumerate(y[s.id].values()):
                terms.append(v)
                coefs.append(weight[s.id] * 1000 - min(rank, 999))
        m.maximize(cp_model.LinearExpr.weighted_sum(terms, coefs))
        solver = cp_model.CpSolver()
        left = max(0.1, (deadline - time.perf_counter()) / (len(days) - n))
        _params(solver, left, seed, workers)
        status = solver.solve(m)
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            continue
        for s in day_sessions:
            room = next((r for r, v in y[s.id].items() if solver.boolean_value(v)), None)
            if room is not None:
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
