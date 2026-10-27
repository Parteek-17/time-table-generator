"""Milestone 2: each soft constraint is minimised and reported in the score breakdown."""

from timetable_builders import Tiny, solve_ok


def counts(response: dict) -> dict[str, int]:
    return {b["constraint"]: b["count"] for b in response["score"]["breakdown"]}


def placed_of(response: dict, assignment_id: str) -> list[dict]:
    return [p for p in response["placed"] if p["assignmentId"] == assignment_id]


def test_theory_periods_spread_over_days() -> None:
    t = Tiny(periods=3)
    sec = t.section("CS A")
    course = t.course("CS301", lectures=3)
    t.room("LT 1")
    aid = t.assign(course, "lecture", ("section", sec), [t.teacher("Dr. One")])
    r = solve_ok(t.request())
    assert r["status"] == "OPTIMAL"
    assert len({p["weekday"] for p in placed_of(r, aid)}) == 3
    assert counts(r)["theory_spread"] == 0


def test_more_theory_than_days_allows_two_a_day() -> None:
    t = Tiny(days=(1, 2), periods=4, lunch_after=None)
    sec = t.section("CS A")
    course = t.course("CS302", lectures=3, tutorials=1)
    t.room("LT 1")
    teacher = t.teacher("Dr. One")
    t.assign(course, "lecture", ("section", sec), [teacher])
    t.assign(course, "tutorial", ("section", sec), [teacher])
    r = solve_ok(t.request())
    # L + T = 4 over 2 days: two a day is allowed, so nothing is counted.
    per_day = [sum(1 for p in r["placed"] if p["weekday"] == d) for d in (1, 2)]
    assert per_day == [2, 2]
    assert counts(r)["theory_spread"] == 0


def test_teacher_gets_a_break_after_three_periods() -> None:
    t = Tiny(days=(1,), periods=6, lunch_after=None)
    teacher = t.teacher("Dr. One")
    course = t.course("CS303", lectures=1)
    t.room("LT 1")
    for name in ("CS A", "CS B", "CS C", "CS D"):
        t.assign(course, "lecture", ("section", t.section(name)), [teacher])
    r = solve_ok(t.request())
    starts = sorted(p["startPeriodIndex"] for p in r["placed"])
    assert len(starts) == 4
    assert starts != list(range(starts[0], starts[0] + 4))
    assert counts(r)["faculty_consecutive"] == 0


def test_last_period_is_avoided() -> None:
    t = Tiny(days=(1,), periods=3, lunch_after=None)
    sec = t.section("CS A")
    t.room("LT 1")
    a = t.assign(t.course("CS304", lectures=1), "lecture", ("section", sec), [t.teacher("Dr. One")])
    b = t.assign(t.course("CS305", lectures=1), "lecture", ("section", sec), [t.teacher("Dr. Two")])
    r = solve_ok(t.request())
    assert {p["startPeriodIndex"] for p in placed_of(r, a) + placed_of(r, b)} == {1, 2}
    assert counts(r)["late_slots"] == 0


def test_section_day_has_no_idle_gap() -> None:
    t = Tiny(days=(1,), periods=4, lunch_after=None)
    sec = t.section("CS A")
    t.room("LT 1")
    # Dr. Two can only teach in P3, and the greedy start puts Dr. One's class in P1.
    a = t.assign(t.course("CS306", lectures=1), "lecture", ("section", sec), [t.teacher("Dr. One")])
    busy = ((1, 1), (1, 2), (1, 4))
    t.assign(
        t.course("CS307", lectures=1),
        "lecture",
        ("section", sec),
        [t.teacher("Dr. Two", unavailable=busy)],
    )
    r = solve_ok(t.request())
    assert [p["startPeriodIndex"] for p in placed_of(r, a)] == [2]
    assert counts(r)["section_idle_gaps"] == 0


def test_section_stays_in_its_home_room() -> None:
    t = Tiny(periods=3)
    t.room("LT 1", capacity=65)
    home = t.room("LT 2", capacity=90)
    sec = t.section("CS A", home=home)
    aid = t.assign(
        t.course("CS308", lectures=3), "lecture", ("section", sec), [t.teacher("Dr. One")]
    )
    r = solve_ok(t.request())
    assert {p["roomId"] for p in placed_of(r, aid)} == {home}
    assert counts(r)["home_room"] == 0


def test_lab_group_keeps_one_lab() -> None:
    t = Tiny(days=(1, 2), periods=4, lunch_after=2)
    t.section("CS A", subgroups=("G1",))
    lab1 = t.room("Lab 1", "lab", 70, ("Software lab",))
    t.room("Lab 2", "lab", 70, ("Software lab",))
    aid = t.assign(
        t.course("CS309", practicals=4, block=2),
        "practical",
        ("subgroup", t.subgroup("CS A", "G1")),
        [t.teacher("Dr. One")],
    )
    # Lab 1 is taken on Monday morning, which tempts a second lab.
    busy = [{"resource": "room", "id": lab1, "weekday": 1, "periodIndex": p} for p in (1, 2)]
    r = solve_ok(t.request(busySlots=busy))
    assert len({p["roomId"] for p in placed_of(r, aid)}) == 1
    assert counts(r)["home_room"] == 0


def test_preferred_room_is_used() -> None:
    t = Tiny(days=(1,), periods=2, lunch_after=None)
    sec = t.section("CS A")
    t.room("LT 1", capacity=65)
    wanted = t.room("Seminar LT", capacity=120)
    aid = t.assign(
        t.course("CS310", lectures=1),
        "lecture",
        ("section", sec),
        [t.teacher("Dr. One")],
        preferred_room=wanted,
    )
    r = solve_ok(t.request())
    assert [p["roomId"] for p in placed_of(r, aid)] == [wanted]
    assert counts(r)["preferred_room"] == 0


def test_weights_from_the_request_are_used_and_reported() -> None:
    t = Tiny(days=(1,), periods=2, lunch_after=None)
    sec = t.section("CS A")
    t.room("LT 1")
    course = t.course("CS311", lectures=2)
    t.assign(course, "lecture", ("section", sec), [t.teacher("Dr. One")])
    # Two lectures in a one-day, two-period week: one late slot and two on one day.
    r = solve_ok(t.request(weights={"late_slots": 0.5, "theory_spread": 4}))
    breakdown = {b["constraint"]: b for b in r["score"]["breakdown"]}
    assert breakdown["late_slots"]["weight"] == 0.5
    assert breakdown["late_slots"]["count"] == 1
    assert breakdown["late_slots"]["penalty"] == 0.5
    assert breakdown["theory_spread"]["penalty"] == 4 * breakdown["theory_spread"]["count"]
    assert breakdown["home_room"]["weight"] == 1
    assert r["score"]["total"] == sum(b["penalty"] for b in breakdown.values())


def test_zero_weight_turns_a_constraint_off() -> None:
    t = Tiny(days=(1,), periods=3, lunch_after=None)
    sec = t.section("CS A")
    t.room("LT 1")
    t.assign(t.course("CS312", lectures=1), "lecture", ("section", sec), [t.teacher("Dr. One")])
    r = solve_ok(t.request(weights={"late_slots": 0}))
    late = next(b for b in r["score"]["breakdown"] if b["constraint"] == "late_slots")
    assert late["weight"] == 0
    assert late["penalty"] == 0
