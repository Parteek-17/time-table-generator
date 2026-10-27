"""Rule: two students writing the same paper never sit left/right or front/back of each other."""

from seating_builders import grid, hall, paper, request, same_paper_neighbours, solve, student


def test_two_papers_fill_a_hall_without_same_paper_neighbours() -> None:
    # 4 × 4 hall, single-seat benches; 8 + 8 students fill it exactly in a checkerboard.
    students = [student(f"A{i:02}", "CS301") for i in range(8)] + [
        student(f"B{i:02}", "EC301") for i in range(8)
    ]
    res = solve(
        request(
            papers=[paper("CS301"), paper("EC301")],
            students=students,
            halls=[hall("G1", rows=4, benches=4)],
        )
    )
    assert res.unseated == []
    cells = grid(res, "hall-G1")
    assert len(cells) == 16
    assert same_paper_neighbours(cells) == []


def test_neighbours_across_benches_count_as_left_right() -> None:
    # Two-seat benches: column 2 (right of bench 1) and column 3 (left of bench 2) touch.
    students = [student(f"A{i:02}", "CS301") for i in range(6)] + [
        student(f"B{i:02}", "EC301") for i in range(6)
    ]
    res = solve(
        request(
            papers=[paper("CS301"), paper("EC301")],
            students=students,
            halls=[hall("G1", rows=3, benches=2, seats_per_bench=2)],
        )
    )
    assert res.unseated == []
    assert same_paper_neighbours(grid(res, "hall-G1")) == []


def test_one_paper_alone_seats_half_and_explains_the_rest() -> None:
    # One paper in a 2 × 4 hall: only the checkerboard (4 seats) is allowed.
    res = solve(
        request(
            papers=[paper("CS301")],
            students=[student(f"A{i:02}", "CS301") for i in range(6)],
            halls=[hall("G1", rows=2, benches=4)],
        )
    )
    assert len(res.seats) == 4
    assert same_paper_neighbours(grid(res, "hall-G1")) == []
    assert res.status == "INFEASIBLE"
    assert [u.reason for u in res.unseated] == ["adjacency", "adjacency"]
    assert "next to another CS301 student" in res.unseated[0].message


def test_three_papers_use_every_seat() -> None:
    students = (
        [student(f"A{i:02}", "CS301") for i in range(4)]
        + [student(f"B{i:02}", "EC301") for i in range(4)]
        + [student(f"C{i:02}", "ME301") for i in range(4)]
    )
    res = solve(
        request(
            papers=[paper("CS301"), paper("EC301"), paper("ME301")],
            students=students,
            halls=[hall("G1", rows=3, benches=4)],
        )
    )
    assert res.unseated == []
    assert same_paper_neighbours(grid(res, "hall-G1")) == []
