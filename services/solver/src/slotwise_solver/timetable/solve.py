"""solve(): a solver-timetable.v1 request in, a solver-timetable.v1 response out."""

from __future__ import annotations

import time

from .contract import VERSION
from .explain import Names, involved, message
from .model import solve_model
from .problem import Json, build_problem
from .relax import diagnose
from .score import DEFAULT_WEIGHTS, Placed, score

# Share of the time limit kept for the relaxation pass, messages and score.
AFTER_SHARE = 0.05


def solve(request: Json) -> Json:
    started = time.perf_counter()
    options: Json = request.get("options") or {}
    time_limit = float(options.get("timeLimitSeconds", 60))
    seed = int(options.get("seed", 0))
    weights = {**DEFAULT_WEIGHTS, **(options.get("weights") or {})}

    problem = build_problem(request)
    # The whole answer must come within the limit: building the problem counts, and a share
    # is kept for the relaxation pass and the score.
    left = time_limit * (1 - AFTER_SHARE) - (time.perf_counter() - started)
    result = solve_model(problem, max(0.1, left), seed, weights)

    placed = [
        Placed(s, *result.placements[s.id]) for s in problem.sessions if s.id in result.placements
    ]
    names = Names(problem)
    why = diagnose(problem, placed, result.placement_proven)
    unplaced: list[Json] = [
        {
            "sessionId": s.id,
            "assignmentId": s.assignment_id,
            "reason": why[s.id].reason,
            "message": message(names, s, why[s.id]),
            "involved": involved(problem, s, why[s.id]),
        }
        for s in problem.sessions
        if s.id in why
    ]

    # OPTIMAL needs every penalty proven too; INFEASIBLE only needs the placement count proven.
    if not unplaced:
        status = "OPTIMAL" if result.proven else "FEASIBLE"
    else:
        status = "INFEASIBLE" if result.placement_proven else "TIMEOUT"

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
