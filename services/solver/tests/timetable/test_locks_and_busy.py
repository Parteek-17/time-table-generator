"""Milestone 5: locked sessions and busy slots are honoured exactly.

A lock keeps its session at exactly its weekday, period, length and room, or leaves it
unplaced with locked_conflict; it never moves and never breaks a hard rule. Busy slots
(other timetables' published classes) are never used and count towards teachers' limits.
solve_ok() runs the independent checker on every response.
"""

from collections.abc import Callable
from typing import Any

import pytest
from timetable_builders import Tiny, solve_ok

Json = dict[str, Any]
PLACE = ("weekday", "startPeriodIndex", "length", "roomId")


def lock_of(p: Json) -> Json:
    return {"sessionId": p["sessionId"], **{k: p[k] for k in PLACE}}


def two_sections() -> Tiny:
    t = Tiny(days=(1, 2, 3), periods=6)
    teachers = [t.teacher(f"Dr. Lock {i}", max_day=5, max_week=14) for i in range(3)]
    for r in range(2):
        t.room(f"LT {r + 1}")
    t.room("Lab 1", "lab", 40, ("Software lab",))
    t.room("Lab 2", "lab", 40, ("Software lab",))
    for k, s in enumerate("AB"):
        sec = t.section(f"CS {s}", subgroups=("G1", "G2"))
        for c in range(2):
            course = t.course(f"CS5{c}{s}", lectures=3, tutorials=1, practicals=2)
            teacher = teachers[(c + k) % 3]
            t.assign(course, "lecture", ("section", sec), [teacher])
            t.assign(course, "tutorial", ("section", sec), [teacher])
            for g in ("G1", "G2"):
                group = ("subgroup", t.subgroup(f"CS {s}", g))
                t.assign(course, "practical", group, [teachers[(c + k + 1) % 3]])
    return t


def test_locks_from_an_earlier_timetable_are_kept_exactly() -> None:
    first = solve_ok(two_sections().request(timeLimitSeconds=3))
    assert first["unplaced"] == []
    # Lock every other class where it is, then solve again with another seed.
    locks = [lock_of(p) for p in first["placed"][::2]]
    again = solve_ok(two_sections().request(timeLimitSeconds=3, seed=5, lockedSessions=locks))
    assert again["unplaced"] == []
    by_id = {p["sessionId"]: p for p in again["placed"]}
    for lock in locks:
        p = by_id[lock["sessionId"]]
        assert p["locked"] is True
        assert lock_of(p) == lock
    assert sum(p["locked"] for p in again["placed"]) == len(locks)


def lock_case() -> tuple[Tiny, Json]:
    """Mon–Tue, 4 periods, lunch after P2; Dr. Kaur is away Mon P4; Tue P4 is a fixed period."""
    t = Tiny(days=(1, 2), periods=4, lunch_after=2)
    sec = t.section("CS A", strength=60, subgroups=("G1", "G2"))
    teacher = t.teacher("Dr. Kaur", unavailable=((1, 4),))
    course = t.course("CS601", lectures=2, practicals=2)
    g1 = t.subgroup("CS A", "G1")
    ids = {
        "section": sec,
        "subgroup": g1,
        "teacher": teacher,
        "lt": t.room("LT 1"),
        "small": t.room("LT S", capacity=20),
        "lab": t.room("Lab 1", "lab", 40, ("Software lab",)),
        "lecture": t.assign(course, "lecture", ("section", sec), [teacher]) + "#1",
        "lab_block": t.assign(course, "practical", ("subgroup", g1), [teacher]) + "#1",
    }
    t.fixed_slot(2, 4, 4)
    return t, ids


def at(ids: Json, session: str, day: int, period: int, room: str, length: int = 1) -> Json:
    return {
        "sessionId": ids[session],
        "weekday": day,
        "startPeriodIndex": period,
        "length": length,
        "roomId": ids[room],
    }


def busy(kind: str, rid: str, day: int, period: int) -> Json:
    return {"resource": kind, "id": rid, "weekday": day, "periodIndex": period}


# (locks, busy slots, words the message must contain), from the ids of lock_case().
Case = Callable[[Json], tuple[list[Json], list[Json], str]]
BLOCKED_LOCKS: dict[str, Case] = {
    "teacher unavailable": lambda i: (
        [at(i, "lecture", 1, 4, "lt")],
        [],
        "(Mon P4: Dr. Kaur is not available)",
    ),
    "teacher busy elsewhere": lambda i: (
        [at(i, "lecture", 1, 1, "lt")],
        [busy("faculty", i["teacher"], 1, 1)],
        "Mon P1: Dr. Kaur is busy elsewhere",
    ),
    "room busy": lambda i: (
        [at(i, "lecture", 1, 1, "lt")],
        [busy("room", i["lt"], 1, 1)],
        "every lecture room that fits is in use",
    ),
    "section busy": lambda i: (
        [at(i, "lecture", 1, 1, "lt")],
        [busy("section", i["section"], 1, 1)],
        "Mon P1: CS A is busy elsewhere",
    ),
    "sub-group busy in the lab block": lambda i: (
        [at(i, "lab_block", 1, 1, "lab", length=2)],
        [busy("subgroup", i["subgroup"], 1, 2)],
        "Mon P1: CS A G1 is busy elsewhere",
    ),
    "fixed period": lambda i: (
        [at(i, "lecture", 2, 4, "lt")],
        [],
        "(Tue P4: a fixed period",
    ),
    "wrong room type": lambda i: (
        [at(i, "lecture", 1, 1, "lab")],
        [],
        "is not a lecture room that seats 60",
    ),
    "room too small": lambda i: (
        [at(i, "lecture", 1, 1, "small")],
        [],
        "is not a lecture room that seats 60",
    ),
    "not a working day": lambda i: (
        [at(i, "lecture", 3, 1, "lt")],
        [],
        "is not valid (not a working day",
    ),
    "no such period": lambda i: (
        [at(i, "lecture", 1, 9, "lt")],
        [],
        "is not valid (not a working day",
    ),
    "lab block across lunch": lambda i: (
        [at(i, "lab_block", 1, 2, "lab", length=2)],
        [],
        "the block would cross a break",
    ),
    "wrong length": lambda i: (
        [at(i, "lecture", 1, 1, "lt", length=2)],
        [],
        "has the wrong length",
    ),
}


@pytest.mark.parametrize("case", BLOCKED_LOCKS, ids=list(BLOCKED_LOCKS))
def test_a_lock_that_breaks_a_rule_stays_unplaced(case: str) -> None:
    t, ids = lock_case()
    locks, busy_slots, words = BLOCKED_LOCKS[case](ids)
    r = solve_ok(t.request(timeLimitSeconds=2, lockedSessions=locks, busySlots=busy_slots))
    [u] = r["unplaced"]
    assert u["sessionId"] == locks[0]["sessionId"]
    assert u["reason"] == "locked_conflict"
    assert words in u["message"]
    # Never moved somewhere else instead.
    assert locks[0]["sessionId"] not in {p["sessionId"] for p in r["placed"]}


def test_two_locks_in_one_place_keep_one() -> None:
    t, ids = lock_case()
    other = t.course("CS602", lectures=1)
    second = t.assign(other, "lecture", ("section", ids["section"]), [ids["teacher"]])
    locks = [at(ids, "lecture", 1, 1, "lt"), {**at(ids, "lecture", 1, 1, "lt")}]
    locks[1]["sessionId"] = second + "#1"
    r = solve_ok(t.request(timeLimitSeconds=2, lockedSessions=locks))
    # Either lock may win the tie; the other names it.
    [u] = r["unplaced"]
    [kept] = [p for p in r["placed"] if p["locked"]]
    assert lock_of(kept) in locks
    assert {u["sessionId"], kept["sessionId"]} == {lk["sessionId"] for lk in locks}
    assert u["reason"] == "locked_conflict"
    assert "Mon P1: Dr. Kaur teaches the locked CS60" in u["message"]


def shared_staff(sections: tuple[str, ...]) -> Tiny:
    """One department's sections; teachers and rooms are shared with the other department
    (same names, so the same ids in both snapshots)."""
    t = Tiny(days=(1, 2), periods=6)
    teachers = [t.teacher(f"Dr. Shared {i}", max_day=4, max_week=8) for i in range(3)]
    t.room("LT 1")
    t.room("LT 2")
    t.room("Lab 1", "lab", 40, ("Software lab",))
    t.room("Lab 2", "lab", 40, ("Software lab",))
    for s in sections:
        sec = t.section(s, subgroups=("G1", "G2"))
        x = t.course(f"X{s[-1]}", lectures=3)
        y = t.course(f"Y{s[-1]}", lectures=3)
        z = t.course(f"Z{s[-1]}", practicals=2)
        t.assign(x, "lecture", ("section", sec), [teachers[0]])
        t.assign(y, "lecture", ("section", sec), [teachers[1]])
        for g in ("G1", "G2"):
            t.assign(z, "practical", ("subgroup", t.subgroup(s, g)), [teachers[2]])
    return t


def test_busy_slots_from_another_departments_timetable() -> None:
    theirs = shared_staff(("ME A",))
    other = solve_ok(theirs.request(timeLimitSeconds=3))
    assert other["unplaced"] == []
    # What P2T sends: the other scope's published classes as busy teachers and rooms.
    cells: set[tuple[str, str, int, int]] = set()
    for p in other["placed"]:
        for k in range(p["startPeriodIndex"], p["startPeriodIndex"] + p["length"]):
            cells.add(("room", p["roomId"], p["weekday"], k))
            for f in p["facultyIds"]:
                cells.add(("faculty", f, p["weekday"], k))
    busy_slots = [busy(*c) for c in sorted(cells)]

    mine = solve_ok(shared_staff(("CS A",)).request(timeLimitSeconds=3, busySlots=busy_slots))
    assert mine["unplaced"] == []
    for p in mine["placed"]:
        for k in range(p["startPeriodIndex"], p["startPeriodIndex"] + p["length"]):
            assert ("room", p["roomId"], p["weekday"], k) not in cells
            for f in p["facultyIds"]:
                assert ("faculty", f, p["weekday"], k) not in cells
    # The labs teacher has 4 + 4 lab periods: exactly the weekly limit of 8, 4 a day.
    lab_teacher = theirs.faculty[2]["id"]
    load: dict[int, int] = {}
    for p in other["placed"] + mine["placed"]:
        if lab_teacher in p["facultyIds"]:
            load[p["weekday"]] = load.get(p["weekday"], 0) + p["length"]
    assert sum(load.values()) == 8 and max(load.values()) <= 4


def test_busy_slots_over_a_teachers_week_leave_classes_unplaced() -> None:
    t = shared_staff(("CS A",))
    lab_teacher = t.faculty[2]["id"]
    # 6 busy periods elsewhere (Mon P1-P4, Tue P1-P2): Monday is full (4 a day), and only
    # one of the two 2-period lab blocks fits under 8 a week.
    cells = [(1, 1), (1, 2), (1, 3), (1, 4), (2, 1), (2, 2)]
    busy_slots = [busy("faculty", lab_teacher, d, p) for d, p in cells]
    r = solve_ok(t.request(timeLimitSeconds=3, busySlots=busy_slots))
    assert [u["reason"] for u in r["unplaced"]] == ["faculty_over_max"]


def test_busy_elective_section_is_kept_free() -> None:
    t = Tiny(days=(1,), periods=2, lunch_after=None)
    a = t.section("CS A")
    course = t.course("OE1", lectures=1, group="OE")
    elective = t.elective(course, "Open elective 1", sources=[a])
    t.room("LT 1")
    t.assign(course, "lecture", ("elective_section", elective), [t.teacher("Dr. Elective")])
    r = solve_ok(t.request(busySlots=[busy("elective_section", elective, 1, 1)]))
    assert [p["startPeriodIndex"] for p in r["placed"]] == [2]
