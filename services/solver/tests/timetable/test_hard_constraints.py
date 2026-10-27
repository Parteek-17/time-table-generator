"""Milestone 1: every hard constraint, each on a tiny fixture.

solve_ok() checks every response against the JSON Schema and the independent checker.
"""

from timetable_builders import Tiny, reasons, solve_ok


def placed_by_assignment(response: dict, assignment_id: str) -> list[dict]:
    return [p for p in response["placed"] if p["assignmentId"] == assignment_id]


def one_day(periods: int = 2, lunch_after: int | None = None, lunch_minutes: int = 60) -> Tiny:
    return Tiny(days=(1,), periods=periods, lunch_after=lunch_after, lunch_minutes=lunch_minutes)


def test_sub_groups_of_a_section_may_have_labs_in_parallel() -> None:
    t = one_day()
    sec = t.section("CS A", subgroups=("G1", "G2"))
    lab = t.course("CS201", practicals=2)
    t.room("Lab 1", "lab", 70, ("Software lab",))
    t.room("Lab 2", "lab", 40, ("Software lab",))
    g1 = t.assign(lab, "practical", ("subgroup", t.subgroup("CS A", "G1")), [t.teacher("Dr. One")])
    g2 = t.assign(lab, "practical", ("subgroup", t.subgroup("CS A", "G2")), [t.teacher("Dr. Two")])
    del sec
    r = solve_ok(t.request())
    assert r["status"] == "OPTIMAL"
    [a], [b] = placed_by_assignment(r, g1), placed_by_assignment(r, g2)
    assert (a["weekday"], a["startPeriodIndex"]) == (b["weekday"], b["startPeriodIndex"])
    assert a["roomId"] != b["roomId"]


def test_whole_section_class_blocks_its_sub_groups() -> None:
    t = one_day()
    sec = t.section("CS A", subgroups=("G1", "G2"))
    theory = t.course("CS202", lectures=2)
    lab = t.course("CS203", practicals=2)
    t.room("LT 1")
    t.room("Lab 1", "lab", 70, ("Software lab",))
    t.assign(theory, "lecture", ("section", sec), [t.teacher("Dr. One")])
    t.assign(lab, "practical", ("subgroup", t.subgroup("CS A", "G1")), [t.teacher("Dr. Two")])
    r = solve_ok(t.request())
    # Only two periods exist and the section needs four: two periods are placed.
    assert sum(p["length"] for p in r["placed"]) == 2
    assert r["status"] == "INFEASIBLE"


def test_teacher_is_never_double_booked() -> None:
    t = one_day(periods=1)
    a, b = t.section("CS A"), t.section("CS B")
    course = t.course("CS204", lectures=1)
    t.room("LT 1")
    t.room("LT 2")
    teacher = t.teacher("Dr. One")
    t.assign(course, "lecture", ("section", a), [teacher])
    t.assign(course, "lecture", ("section", b), [teacher])
    r = solve_ok(t.request())
    assert len(r["placed"]) == 1
    assert reasons(r) == ["no_free_slot"]


def test_room_is_never_double_booked() -> None:
    t = one_day(periods=1)
    a, b = t.section("CS A"), t.section("CS B")
    course = t.course("CS205", lectures=1)
    t.room("LT 1")
    t.assign(course, "lecture", ("section", a), [t.teacher("Dr. One")])
    t.assign(course, "lecture", ("section", b), [t.teacher("Dr. Two")])
    r = solve_ok(t.request())
    assert len(r["placed"]) == 1


def test_room_type_and_capacity_must_fit() -> None:
    t = one_day()
    big = t.section("CS A", strength=80, subgroups=("G1",))
    theory = t.course("CS206", lectures=1)
    lab = t.course("CS207", practicals=2, lab="Hardware lab")
    small = t.room("LT 1", capacity=60)
    t.room("Lab 1", "lab", 90, ("Software lab",))
    t.assign(theory, "lecture", ("section", big), [t.teacher("Dr. One")])
    t.assign(lab, "practical", ("subgroup", t.subgroup("CS A", "G1")), [t.teacher("Dr. Two")])
    r = solve_ok(t.request())
    assert sorted(reasons(r)) == ["no_suitable_room", "room_too_small"]
    room_too_small = next(u for u in r["unplaced"] if u["reason"] == "room_too_small")
    assert "80 students" in room_too_small["message"]
    del small


def test_tutorial_may_use_a_lecture_room() -> None:
    t = one_day(periods=1)
    sec = t.section("CS A")
    course = t.course("CS208", tutorials=1)
    room = t.room("LT 1")
    t.assign(course, "tutorial", ("section", sec), [t.teacher("Dr. One")])
    r = solve_ok(t.request())
    assert [p["roomId"] for p in r["placed"]] == [room]


def test_lab_block_never_crosses_lunch() -> None:
    t = one_day(periods=4, lunch_after=2)
    t.section("CS A", subgroups=("G1",))
    lab = t.course("CS209", practicals=4, block=2)
    t.room("Lab 1", "lab", 70, ("Software lab",))
    aid = t.assign(lab, "practical", ("subgroup", t.subgroup("CS A", "G1")), [t.teacher("Dr. One")])
    r = solve_ok(t.request())
    starts = sorted(p["startPeriodIndex"] for p in placed_by_assignment(r, aid))
    assert starts == [1, 3]


def test_lab_block_that_fits_nowhere_is_explained() -> None:
    t = one_day(periods=4, lunch_after=2)
    t.section("CS A", subgroups=("G1",))
    lab = t.course("CS210", practicals=3, block=3)
    t.room("Lab 1", "lab", 70, ("Software lab",))
    t.assign(lab, "practical", ("subgroup", t.subgroup("CS A", "G1")), [t.teacher("Dr. One")])
    r = solve_ok(t.request())
    assert reasons(r) == ["lab_block_does_not_fit"]


def test_short_break_does_not_split_a_lab_block() -> None:
    t = one_day(periods=4, lunch_after=2, lunch_minutes=10)
    t.section("CS A", subgroups=("G1",))
    lab = t.course("CS211", practicals=3, block=3)
    t.room("Lab 1", "lab", 70, ("Software lab",))
    t.assign(lab, "practical", ("subgroup", t.subgroup("CS A", "G1")), [t.teacher("Dr. One")])
    r = solve_ok(t.request())
    assert [p["length"] for p in r["placed"]] == [3]


def test_teacher_unavailability_is_respected() -> None:
    t = one_day(periods=3)
    sec = t.section("CS A")
    course = t.course("CS212", lectures=1)
    t.room("LT 1")
    t.assign(
        course, "lecture", ("section", sec), [t.teacher("Dr. One", unavailable=((1, 1), (1, 2)))]
    )
    r = solve_ok(t.request())
    assert [p["startPeriodIndex"] for p in r["placed"]] == [3]


def test_teacher_unavailable_everywhere_is_explained() -> None:
    t = one_day(periods=2)
    sec = t.section("CS A")
    course = t.course("CS213", lectures=1)
    t.room("LT 1")
    t.assign(
        course, "lecture", ("section", sec), [t.teacher("Dr. Kaur", unavailable=((1, 1), (1, 2)))]
    )
    r = solve_ok(t.request())
    assert reasons(r) == ["faculty_unavailable"]
    assert "Dr. Kaur" in r["unplaced"][0]["message"]


def test_max_periods_per_day_spreads_classes() -> None:
    t = Tiny(days=(1, 2), periods=3)
    sec = t.section("CS A")
    course = t.course("CS214", lectures=2)
    t.room("LT 1")
    aid = t.assign(course, "lecture", ("section", sec), [t.teacher("Dr. One", max_day=1)])
    r = solve_ok(t.request())
    assert sorted(p["weekday"] for p in placed_by_assignment(r, aid)) == [1, 2]


def test_max_periods_per_week_is_explained() -> None:
    t = Tiny(days=(1, 2), periods=3)
    sec = t.section("CS A")
    course = t.course("CS215", lectures=2)
    t.room("LT 1")
    t.assign(course, "lecture", ("section", sec), [t.teacher("Dr. One", max_week=1)])
    r = solve_ok(t.request())
    assert len(r["placed"]) == 1
    assert reasons(r) == ["faculty_over_max"]


def test_co_teachers_are_all_busy() -> None:
    t = one_day()
    t.section("CS A", subgroups=("G1",))
    other = t.section("CS B")
    lab = t.course("CS216", practicals=2)
    theory = t.course("CS217", lectures=1)
    t.room("Lab 1", "lab", 70, ("Software lab",))
    t.room("LT 1")
    main, ta = t.teacher("Dr. One"), t.teacher("Mx. Assistant")
    t.assign(lab, "practical", ("subgroup", t.subgroup("CS A", "G1")), [main, ta])
    lecture = t.assign(theory, "lecture", ("section", other), [ta])
    r = solve_ok(t.request())
    assert [u["assignmentId"] for u in r["unplaced"]] == [lecture]


def test_fixed_slots_are_kept_free() -> None:
    t = one_day()
    sec = t.section("CS A")
    course = t.course("CS218", lectures=1)
    t.room("LT 1")
    t.assign(course, "lecture", ("section", sec), [t.teacher("Dr. One")])
    t.fixed_slot(1, 1, 1)
    r = solve_ok(t.request())
    assert [p["startPeriodIndex"] for p in r["placed"]] == [2]


def test_fixed_slots_blocking_everything_are_explained() -> None:
    t = one_day()
    sec = t.section("CS A")
    course = t.course("CS219", lectures=1)
    t.room("LT 1")
    t.assign(course, "lecture", ("section", sec), [t.teacher("Dr. One")])
    t.fixed_slot(1, 1, 2)
    r = solve_ok(t.request())
    assert reasons(r) == ["blocked_by_fixed_slot"]


def test_fixed_slot_teachers_are_busy() -> None:
    t = one_day()
    t.section("CS A")
    other = t.section("CS B")
    course = t.course("CS220", lectures=1)
    t.room("LT 1")
    mentor = t.teacher("Dr. Mentor")
    t.assign(course, "lecture", ("section", other), [mentor])
    # Fixed slot for CS A only (section scope) naming the mentor.
    t.fixed_slot(1, 1, 1, faculty=(mentor,))
    t.fixed[-1].update(scopeType="section", sectionId=t.sections[0]["id"])
    r = solve_ok(t.request())
    assert [p["startPeriodIndex"] for p in r["placed"]] == [2]


def test_busy_slots_block_rooms_teachers_and_sections() -> None:
    t = one_day(periods=4)
    sec = t.section("CS A")
    course = t.course("CS221", lectures=1)
    room = t.room("LT 1")
    teacher = t.teacher("Dr. One")
    t.assign(course, "lecture", ("section", sec), [teacher])
    busy = [
        {"resource": "room", "id": room, "weekday": 1, "periodIndex": 1},
        {"resource": "faculty", "id": teacher, "weekday": 1, "periodIndex": 2},
        {"resource": "section", "id": sec, "weekday": 1, "periodIndex": 3},
    ]
    r = solve_ok(t.request(busySlots=busy))
    assert [p["startPeriodIndex"] for p in r["placed"]] == [4]


def test_locked_sessions_stay_put() -> None:
    t = one_day(periods=3)
    sec = t.section("CS A")
    course = t.course("CS222", lectures=2)
    room = t.room("LT 1")
    t.room("LT 2")
    aid = t.assign(course, "lecture", ("section", sec), [t.teacher("Dr. One")])
    lock = {
        "sessionId": f"{aid}#2",
        "weekday": 1,
        "startPeriodIndex": 3,
        "length": 1,
        "roomId": room,
    }
    r = solve_ok(t.request(lockedSessions=[lock]))
    locked = next(p for p in r["placed"] if p["sessionId"] == lock["sessionId"])
    assert locked["locked"] is True
    assert (locked["startPeriodIndex"], locked["roomId"]) == (3, room)
    assert len(r["placed"]) == 2


def test_electives_of_one_group_meet_in_parallel() -> None:
    t = one_day(periods=1)
    sec = t.section("CS A")
    ml = t.course("CS351", lectures=1, group="Elective-I")
    cc = t.course("CS352", lectures=1, group="Elective-I")
    t.room("LT 1")
    t.room("LT 2")
    e1 = t.elective(ml, "ML-1", [sec])
    e2 = t.elective(cc, "CC-1", [sec])
    t.assign(ml, "lecture", ("elective_section", e1), [t.teacher("Dr. One")])
    t.assign(cc, "lecture", ("elective_section", e2), [t.teacher("Dr. Two")])
    r = solve_ok(t.request())
    assert len(r["placed"]) == 2


def test_electives_of_different_groups_do_not_overlap() -> None:
    t = one_day(periods=1)
    sec = t.section("CS A")
    ml = t.course("CS351", lectures=1, group="Elective-I")
    oe = t.course("MG401", lectures=1, group="Open Elective")
    t.room("LT 1")
    t.room("LT 2")
    e1 = t.elective(ml, "ML-1", [sec])
    e2 = t.elective(oe, "ED-1", [sec])
    t.assign(ml, "lecture", ("elective_section", e1), [t.teacher("Dr. One")])
    t.assign(oe, "lecture", ("elective_section", e2), [t.teacher("Dr. Two")])
    r = solve_ok(t.request())
    assert len(r["placed"]) == 1


def test_every_l_t_p_period_is_a_session() -> None:
    t = Tiny()
    sec = t.section("CS A", subgroups=("G1", "G2"))
    course = t.course("CS301", lectures=3, tutorials=1, practicals=3, block=2)
    t.room("LT 1")
    t.room("Lab 1", "lab", 70, ("Software lab",))
    teacher = t.teacher("Dr. One")
    t.assign(course, "lecture", ("section", sec), [teacher])
    t.assign(course, "tutorial", ("section", sec), [teacher])
    lab = t.assign(course, "practical", ("subgroup", t.subgroup("CS A", "G1")), [teacher])
    r = solve_ok(t.request())
    assert r["status"] == "OPTIMAL"
    assert sum(p["length"] for p in r["placed"]) == 3 + 1 + 3
    # P = 3 with 2-period blocks: one block of 2 and one of 1.
    assert sorted(p["length"] for p in placed_by_assignment(r, lab)) == [1, 2]
