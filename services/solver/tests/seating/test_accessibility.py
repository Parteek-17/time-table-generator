"""Rule: students with accessibility needs get ground-floor / front seats."""

from seating_builders import hall, paper, request, solve, student


def test_accessible_student_gets_the_front_of_a_ground_floor_hall() -> None:
    res = solve(
        request(
            papers=[paper("CS301"), paper("EC301")],
            students=[
                student("A1", "CS301"),
                student("A2", "CS301"),
                student("A9", "CS301", accessible=True),
                student("B1", "EC301"),
                student("B2", "EC301"),
            ],
            halls=[
                # Filled first, but upstairs.
                hall("F1", rows=2, benches=4, order=0, floor=1),
                hall("G1", rows=2, benches=4, order=1, floor=0, accessible=True),
            ],
        )
    )
    assert res.unseated == []
    seat = next(s for s in res.seats if s.student_id == "stu-A9")
    assert (seat.hall_id, seat.row, seat.column) == ("hall-G1", 1, 1)


def test_ground_floor_accessible_hall_is_preferred_over_one_with_a_lift() -> None:
    res = solve(
        request(
            papers=[paper("CS301")],
            students=[student("A1", "CS301", accessible=True)],
            halls=[
                hall("L1", rows=1, benches=2, order=0, floor=2, accessible=True),
                hall("G1", rows=1, benches=2, order=1, floor=0, accessible=True),
            ],
        )
    )
    assert res.seats[0].hall_id == "hall-G1"


def test_two_accessible_students_of_one_paper_are_not_neighbours() -> None:
    res = solve(
        request(
            papers=[paper("CS301")],
            students=[
                student("A1", "CS301", accessible=True),
                student("A2", "CS301", accessible=True),
            ],
            halls=[hall("G1", rows=2, benches=3, accessible=True)],
        )
    )
    cells = sorted((s.row, s.column) for s in res.seats)
    assert cells == [(1, 1), (1, 3)]


def test_no_accessible_hall_is_explained() -> None:
    res = solve(
        request(
            papers=[paper("CS301")],
            students=[student("A1", "CS301", accessible=True), student("A2", "CS301")],
            halls=[hall("F1", rows=2, benches=2, floor=1)],
        )
    )
    assert [s.student_id for s in res.seats] == ["stu-A2"]
    [u] = res.unseated
    assert u.reason == "no_accessible_seat"
    assert "none of the halls" in u.message
