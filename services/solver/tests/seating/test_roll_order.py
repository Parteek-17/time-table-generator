"""Rule: halls fill in roll-number order with papers interleaved."""

from seating_builders import hall, paper, request, solve, student


def test_rolls_go_up_within_each_paper_through_the_halls() -> None:
    # Given in shuffled order, with roll numbers whose text order differs from number order.
    rolls_a = ["CS9", "CS10", "CS2", "CS11", "CS1", "CS3"]
    rolls_b = ["EC5", "EC1", "EC12", "EC3", "EC2", "EC4"]
    students = [student(r, "CS301") for r in rolls_a] + [student(r, "EC301") for r in rolls_b]
    res = solve(
        request(
            papers=[paper("CS301"), paper("EC301")],
            students=list(reversed(students)),
            # Hall order decides, not the order of the list.
            halls=[hall("H2", rows=2, benches=3, order=1), hall("H1", rows=2, benches=3, order=0)],
        )
    )
    assert res.unseated == []
    order = {"hall-H1": 0, "hall-H2": 1}
    seated = sorted(res.seats, key=lambda s: (order[s.hall_id], s.row, s.column))
    by_paper: dict[str, list[str]] = {}
    for seat in seated:
        by_paper.setdefault(seat.paper_id, []).append(seat.student_id.removeprefix("stu-"))
    assert by_paper["paper-CS301"] == ["CS1", "CS2", "CS3", "CS9", "CS10", "CS11"]
    assert by_paper["paper-EC301"] == ["EC1", "EC2", "EC3", "EC4", "EC5", "EC12"]


def test_papers_alternate_seat_by_seat() -> None:
    students = [student(f"A{i}", "CS301") for i in range(1, 4)] + [
        student(f"B{i}", "EC301") for i in range(1, 4)
    ]
    res = solve(
        request(
            papers=[paper("CS301"), paper("EC301")],
            students=students,
            halls=[hall("H1", rows=1, benches=6)],
        )
    )
    row = [s.paper_id for s in sorted(res.seats, key=lambda s: s.column)]
    assert row == ["paper-CS301", "paper-EC301"] * 3


def test_labels_name_hall_row_and_column() -> None:
    res = solve(
        request(
            papers=[paper("CS301")],
            students=[student("A1", "CS301")],
            halls=[hall("G16", rows=1, benches=1)],
        )
    )
    assert res.seats[0].label == "G16-R1-C1"
