"""The independent checker must catch each kind of broken timetable."""

import copy
import json

from timetable_builders import REPO, Tiny, demo_request, solve_ok

from slotwise_solver.timetable.checker import check


def valid() -> tuple[dict, dict]:
    t = Tiny(days=(1,), periods=4, lunch_after=2)
    a, b = t.section("CS A", subgroups=("G1",)), t.section("CS B")
    theory = t.course("CS301", lectures=1)
    lab = t.course("CS302", practicals=2)
    t.room("LT 1")
    t.room("LT 2")
    t.room("Lab 1", "lab", 70, ("Software lab",))
    teacher = t.teacher("Dr. One", unavailable=((1, 4),))
    t.assign(theory, "lecture", ("section", a), [teacher])
    t.assign(theory, "lecture", ("section", b), [teacher])
    t.assign(lab, "practical", ("subgroup", t.subgroup("CS A", "G1")), [t.teacher("Dr. Two")])
    request = t.request()
    return request, solve_ok(request)


def broken(response: dict, change) -> dict:  # noqa: ANN001
    out = copy.deepcopy(response)
    change(out)
    return out


def lectures(r: dict) -> list[dict]:
    return [p for p in r["placed"] if p["component"] == "lecture"]


def test_valid_timetable_has_no_errors() -> None:
    request, response = valid()
    assert check(request, response) == []


def test_catches_double_booked_teacher_room_and_students() -> None:
    request, response = valid()

    def clash(r: dict) -> None:
        a, b = lectures(r)
        b.update(weekday=a["weekday"], startPeriodIndex=a["startPeriodIndex"], roomId=a["roomId"])

    errors = check(request, broken(response, clash))
    assert any("teacher double-booked" in e for e in errors)
    assert any("room double-booked" in e for e in errors)


def test_catches_students_in_two_places() -> None:
    request, response = valid()

    def clash(r: dict) -> None:
        lab = next(p for p in r["placed"] if p["component"] == "practical")
        lec = next(
            p for p in lectures(r) if p["target"]["id"] == request["snapshot"]["sections"][0]["id"]
        )
        lec.update(weekday=lab["weekday"], startPeriodIndex=lab["startPeriodIndex"])

    assert any("students double-booked" in e for e in check(request, broken(response, clash)))


def test_catches_lab_across_lunch_and_wrong_room() -> None:
    request, response = valid()
    lt = request["snapshot"]["rooms"][0]["id"]

    def move(r: dict) -> None:
        lab = next(p for p in r["placed"] if p["component"] == "practical")
        lab.update(startPeriodIndex=2, roomId=lt)

    errors = check(request, broken(response, move))
    assert any("long break" in e for e in errors)
    assert any("wrong type" in e for e in errors)


def test_catches_unavailable_teacher_and_missing_session() -> None:
    request, response = valid()

    def change(r: dict) -> None:
        lectures(r)[0]["startPeriodIndex"] = 4
        r["placed"].pop()

    errors = check(request, broken(response, change))
    assert any("unavailable" in e for e in errors)
    assert any("neither placed nor unplaced" in e for e in errors)


def test_catches_moved_locked_session() -> None:
    request, response = valid()
    p = lectures(response)[0]
    lock = {k: p[k] for k in ("sessionId", "weekday", "startPeriodIndex", "length", "roomId")}
    request["options"]["lockedSessions"] = [lock]

    def move(r: dict) -> None:
        lectures(r)[0]["startPeriodIndex"] = 3

    assert any("locked" in e for e in check(request, broken(response, move)))


def test_fixture_solution_passes() -> None:
    path = REPO / "packages" / "shared" / "fixtures" / "demo-term.solution.json"
    solution = json.loads(path.read_text(encoding="utf-8"))
    assert check(demo_request(), solution) == []
