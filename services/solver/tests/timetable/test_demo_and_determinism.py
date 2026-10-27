"""The demo fixture solves validly, and the same input + seed gives the same output."""

from collections import Counter

from timetable_builders import Tiny, demo_request, reasons, solve_ok


def without_time(r: dict) -> dict:
    return {k: v for k, v in r.items() if k != "solveSeconds"}


def test_demo_fixture_solves() -> None:
    r = solve_ok(demo_request(timeLimitSeconds=10))
    # The sample data has 16 sessions with no suitable room on purpose (CONTRACTS.md);
    # the greedy fixture placed 394 of 414.
    assert Counter(reasons(r))["no_suitable_room"] == 16
    assert len(r["placed"]) >= 394
    # Milestone 3: every other unplaced session has a specific reason, not "other".
    assert "other" not in reasons(r)
    assert all(u["message"] and u["involved"]["courseIds"] for u in r["unplaced"])
    assert r["solveSeconds"] <= 12
    # The greedy starting timetable scores 202; the improvement loop must beat it.
    assert r["score"]["total"] < 202
    assert [b["constraint"] for b in r["score"]["breakdown"]] == [
        "theory_spread",
        "faculty_consecutive",
        "late_slots",
        "section_idle_gaps",
        "home_room",
        "preferred_room",
    ]


def medium() -> Tiny:
    t = Tiny()
    teachers = [t.teacher(f"Dr. Teacher {i}", max_day=4, max_week=16) for i in range(4)]
    for r in range(3):
        t.room(f"LT {r}")
    t.room("Lab 1", "lab", 40, ("Software lab",))
    t.room("Lab 2", "lab", 40, ("Software lab",))
    for s in "ABC":
        sec = t.section(f"CS {s}", subgroups=("G1", "G2"))
        for c in range(3):
            course = t.course(f"CS4{c}{s}", lectures=3, practicals=2)
            teacher = teachers[(c + ord(s)) % 4]
            t.assign(course, "lecture", ("section", sec), [teacher])
            for g in ("G1", "G2"):
                t.assign(course, "practical", ("subgroup", t.subgroup(f"CS {s}", g)), [teacher])
    return t


def test_same_input_and_seed_give_the_same_timetable() -> None:
    first = solve_ok(medium().request(seed=7))
    second = solve_ok(medium().request(seed=7))
    assert without_time(first) == without_time(second)
