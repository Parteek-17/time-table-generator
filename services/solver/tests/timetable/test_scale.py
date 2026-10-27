"""Milestone 4: a large institute solves within its time limit, every hard rule checked.

big_institute(): 4 departments, 48 sections, 96 teachers, 64 rooms, 1,536 periods a week.
solve_ok() runs the independent checker on the response.
"""

from timetable_builders import big_institute, solve_ok

LIMIT = 60
# CP-SAT can stop a little after its own wall-clock limit when other programs load the CPU.
SLACK = 1.05


def test_large_institute_solves_within_its_time_limit() -> None:
    request = big_institute().request(timeLimitSeconds=LIMIT)
    snap = request["snapshot"]
    assert len({c["departmentId"] for c in snap["cohorts"][1:]}) == 4
    assert sum(a["periodsPerWeek"] for a in snap["assignments"]) >= 1500

    r = solve_ok(request)
    assert r["solveSeconds"] <= LIMIT * SLACK
    assert r["unplaced"] == []
    assert sum(p["length"] for p in r["placed"]) == 1536
    assert r["status"] in ("FEASIBLE", "OPTIMAL")
