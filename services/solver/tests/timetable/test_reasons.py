"""Milestone 3: every unplaced reason code (UNPLACED_REASONS_V1), each on a tiny fixture.

The relaxation pass names the rule kind whose relaxation alone would free a place, so the
fixtures mix rules to show the right one wins, and check the message names who is in the way.
"""

import pytest
from timetable_builders import Tiny, solve_ok

from slotwise_solver.timetable import solve as solve_module
from slotwise_solver.timetable.model import ModelResult


def one_day(periods: int = 2) -> Tiny:
    return Tiny(days=(1,), periods=periods, lunch_after=None)


def only(response: dict) -> dict:
    [u] = response["unplaced"]
    return u


def test_no_free_slot_names_the_class_in_the_way() -> None:
    t = one_day(periods=1)
    a, b = t.section("CS A"), t.section("CS B")
    course = t.course("CS301", lectures=1)
    t.room("LT 1")
    t.room("LT 2")
    teacher = t.teacher("Dr. Kaur")
    t.assign(course, "lecture", ("section", a), [teacher])
    t.assign(course, "lecture", ("section", b), [teacher])
    r = solve_ok(t.request())
    u = only(r)
    assert u["reason"] == "no_free_slot"
    assert "(Mon P1: Dr. Kaur teaches CS301 CS301 for CS " in u["message"]
    assert len(u["involved"]["sectionIds"]) == 2


def test_faculty_unavailable_in_the_only_period_that_would_work() -> None:
    # P1: the section is busy elsewhere; P2: the teacher is unavailable. Freeing the
    # teacher alone would give a place, so the reason is the teacher's availability.
    t = one_day()
    sec = t.section("CS A")
    course = t.course("CS302", lectures=1)
    t.room("LT 1")
    teacher = t.teacher("Dr. Kaur", unavailable=((1, 2),))
    t.assign(course, "lecture", ("section", sec), [teacher])
    busy = [{"resource": "section", "id": sec, "weekday": 1, "periodIndex": 1}]
    r = solve_ok(t.request(busySlots=busy))
    u = only(r)
    assert u["reason"] == "faculty_unavailable"
    assert u["message"].startswith("Dr. Kaur is not available")
    assert "(Mon P2)" in u["message"]


def test_faculty_over_max_per_week() -> None:
    t = Tiny(days=(1, 2), periods=3)
    sec = t.section("CS A")
    course = t.course("CS303", lectures=2)
    t.room("LT 1")
    t.assign(course, "lecture", ("section", sec), [t.teacher("Dr. Kaur", max_week=1)])
    u = only(solve_ok(t.request()))
    assert u["reason"] == "faculty_over_max"
    assert "Dr. Kaur would go over their weekly limit" in u["message"]


def test_faculty_over_max_per_day() -> None:
    t = one_day(periods=3)
    sec = t.section("CS A")
    course = t.course("CS304", lectures=2)
    t.room("LT 1")
    t.assign(course, "lecture", ("section", sec), [t.teacher("Dr. Kaur", max_day=1)])
    u = only(solve_ok(t.request()))
    assert u["reason"] == "faculty_over_max"
    assert "Dr. Kaur would go over their daily limit" in u["message"]
    assert "already has 1 periods that day (most 1)" in u["message"]


def test_no_suitable_room() -> None:
    t = one_day()
    sec = t.section("CS A", subgroups=("G1",))
    course = t.course("ME305", practicals=2, practical_room="drawing_hall")
    t.room("LT 1")
    t.assign(course, "practical", ("subgroup", t.subgroup("CS A", "G1")), [t.teacher("Dr. Kaur")])
    del sec
    u = only(solve_ok(t.request()))
    assert u["reason"] == "no_suitable_room"
    assert "There is no drawing hall" in u["message"]


def test_room_too_small() -> None:
    t = one_day()
    sec = t.section("CS A", strength=120)
    course = t.course("CS306", lectures=1)
    t.room("LT 1", capacity=70)
    t.assign(course, "lecture", ("section", sec), [t.teacher("Dr. Kaur")])
    u = only(solve_ok(t.request()))
    assert u["reason"] == "room_too_small"
    assert "seats 120 students" in u["message"]


def test_lab_block_does_not_fit() -> None:
    t = one_day(periods=2)
    t.section("CS A", subgroups=("G1",))
    course = t.course("CS307", practicals=3, block=3)
    t.room("Lab 1", "lab", 70, ("Software lab",))
    t.assign(course, "practical", ("subgroup", t.subgroup("CS A", "G1")), [t.teacher("Dr. Kaur")])
    u = only(solve_ok(t.request()))
    assert u["reason"] == "lab_block_does_not_fit"
    assert "3-period block" in u["message"]


def test_blocked_by_fixed_slot() -> None:
    # P1: the teacher is busy elsewhere; P2: a fixed mentoring period for every section.
    t = one_day()
    sec = t.section("CS A")
    course = t.course("CS308", lectures=1)
    t.room("LT 1")
    teacher = t.teacher("Dr. Kaur")
    t.assign(course, "lecture", ("section", sec), [teacher])
    t.fixed_slot(1, 2, 2)
    busy = [{"resource": "faculty", "id": teacher, "weekday": 1, "periodIndex": 1}]
    u = only(solve_ok(t.request(busySlots=busy)))
    assert u["reason"] == "blocked_by_fixed_slot"
    assert "(Mon P2)" in u["message"]


def test_locked_conflict_with_another_locked_class() -> None:
    t = one_day(periods=1)
    a, b = t.section("CS A"), t.section("CS B")
    course = t.course("CS309", lectures=1)
    lt1 = t.room("LT 1")
    t.room("LT 2")
    teacher = t.teacher("Dr. Kaur")
    t.assign(course, "lecture", ("section", a), [teacher])
    locked = t.assign(course, "lecture", ("section", b), [teacher])
    lock = {"sessionId": f"{locked}#1", "weekday": 1, "startPeriodIndex": 1, "length": 1}
    r = solve_ok(t.request(lockedSessions=[{**lock, "roomId": lt1}]))
    u = only(r)
    assert u["reason"] == "locked_conflict"
    assert "the locked CS309 CS309 for CS B" in u["message"]


def test_locked_conflict_for_an_invalid_lock() -> None:
    t = one_day()
    sec = t.section("CS A")
    course = t.course("CS310", lectures=1)
    room = t.room("LT 1")
    aid = t.assign(course, "lecture", ("section", sec), [t.teacher("Dr. Kaur")])
    # Length 2 for a 1-period lecture.
    lock = {"sessionId": f"{aid}#1", "weekday": 1, "startPeriodIndex": 1, "length": 2}
    u = only(solve_ok(t.request(lockedSessions=[{**lock, "roomId": room}])))
    assert u["reason"] == "locked_conflict"
    assert "wrong length" in u["message"]


def test_time_limit_when_the_search_stops_early(monkeypatch: pytest.MonkeyPatch) -> None:
    # Simulate a search that ran out of time before placing anything.
    monkeypatch.setattr(
        solve_module, "solve_model", lambda *_: ModelResult("FEASIBLE", False, False, {})
    )
    t = one_day()
    sec = t.section("CS A")
    course = t.course("CS311", lectures=1)
    t.room("LT 1")
    t.assign(course, "lecture", ("section", sec), [t.teacher("Dr. Kaur")])
    r = solve_ok(t.request())
    assert r["status"] == "TIMEOUT"
    u = only(r)
    assert u["reason"] == "time_limit"
    assert "free Mon P1, Mon P2" in u["message"]


def test_other_when_the_class_has_no_students() -> None:
    t = one_day()
    t.section("CS A")
    course = t.course("CS312", lectures=1, group="OE-1")
    elective = t.elective(course, "Open elective (no sections)", sources=[])
    t.room("LT 1")
    t.assign(course, "lecture", ("elective_section", elective), [t.teacher("Dr. Kaur")])
    u = only(solve_ok(t.request()))
    assert u["reason"] == "other"
    assert "no students" in u["message"]


def test_every_reason_code_has_a_fixture() -> None:
    from pathlib import Path

    contract = Path(__file__).resolve().parents[4] / "packages/shared/src/contracts"
    text = (contract / "solver-timetable.v1.ts").read_text(encoding="utf-8")
    block = text.split("UNPLACED_REASONS_V1 = [")[1].split("]")[0]
    codes = [line.strip().strip("',") for line in block.splitlines() if line.strip()[:1] == "'"]
    here = Path(__file__).read_text(encoding="utf-8")
    assert len(codes) == 10
    assert [c for c in codes if f'== "{c}"' not in here] == []
