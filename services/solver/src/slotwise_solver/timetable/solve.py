"""solve(): a solver-timetable.v1 request in, a solver-timetable.v1 response out."""

from __future__ import annotations

import time
from collections import defaultdict

from .contract import VERSION
from .explain import Names, involved, message
from .model import solve_model
from .problem import Json, Problem, Session, build_problem
from .score import DEFAULT_WEIGHTS, Placed, score


def solve(request: Json) -> Json:
    started = time.perf_counter()
    options: Json = request.get("options") or {}
    time_limit = float(options.get("timeLimitSeconds", 60))
    seed = int(options.get("seed", 0))
    weights = {**DEFAULT_WEIGHTS, **(options.get("weights") or {})}

    problem = build_problem(request)
    result = solve_model(problem, time_limit, seed)

    placed = [
        Placed(s, *result.placements[s.id]) for s in problem.sessions if s.id in result.placements
    ]
    names = Names(problem)
    unplaced: list[Json] = []
    load = _faculty_load(problem, placed)
    for s in problem.sessions:
        if s.id in result.placements:
            continue
        reason, extra = _reason(problem, s, result.proven, load)
        unplaced.append(
            {
                "sessionId": s.id,
                "assignmentId": s.assignment_id,
                "reason": reason,
                "message": message(names, s, reason, extra),
                "involved": involved(problem, s),
            }
        )

    if result.status == "UNKNOWN":
        status = "TIMEOUT"
    elif not unplaced:
        status = "OPTIMAL" if result.proven else "FEASIBLE"
    else:
        status = "INFEASIBLE" if result.proven else "TIMEOUT"

    return {
        "version": VERSION,
        "requestId": request["requestId"],
        "status": status,
        "solveSeconds": round(time.perf_counter() - started, 3),
        "placed": [_placed_json(p) for p in placed],
        "unplaced": unplaced,
        "score": score(placed, problem, weights),
    }


def _placed_json(p: Placed) -> Json:
    s = p.session
    return {
        "sessionId": s.id,
        "weekday": p.option.weekday,
        "startPeriodIndex": p.option.start_index,
        "length": s.length,
        "roomId": p.room_id,
        "assignmentId": s.assignment_id,
        "courseId": s.course_id,
        "component": s.component,
        "target": {"kind": s.target_kind, "id": s.target_id},
        "facultyIds": list(s.faculty_ids),
        "locked": s.locked,
    }


def _faculty_load(problem: Problem, placed: list[Placed]) -> dict[str, dict[int, int]]:
    load: dict[str, dict[int, int]] = defaultdict(lambda: defaultdict(int))
    for fid, per_day in problem.faculty_busy_load.items():
        for day, n in per_day.items():
            load[fid][day] += n
    for p in placed:
        for fid in p.session.faculty_ids:
            load[fid][p.option.weekday] += p.session.length
    return load


def _reason(
    problem: Problem, s: Session, proven: bool, load: dict[str, dict[int, int]]
) -> tuple[str, Json | None]:
    if s.reason is not None:
        return s.reason, None
    if s.locked:
        return "locked_conflict", None
    for fid in s.faculty_ids:
        f = problem.faculty.get(fid)
        if f is None:
            continue
        if sum(load[fid].values()) + s.length > f["maxPeriodsPerWeek"]:
            return "faculty_over_max", {"facultyIds": [fid], "limit": "periods-per-week"}
        days = {o.weekday for o in s.options}
        if days and all(load[fid][d] + s.length > f["maxPeriodsPerDay"] for d in days):
            return "faculty_over_max", {"facultyIds": [fid], "limit": "periods-per-day"}
    return ("no_free_slot" if proven else "time_limit"), None
