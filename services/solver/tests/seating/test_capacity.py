"""Rule: respect hall exam capacity and keep the reserve seats empty."""

from seating_builders import hall, paper, request, solve, student


def _two_papers(n: int) -> list[dict]:
    return [student(f"A{i:02}", "CS301") for i in range(n)] + [
        student(f"B{i:02}", "EC301") for i in range(n)
    ]


def test_reserve_seats_stay_empty() -> None:
    # 3 × 4 hall = 12 seats, reserve 4 → at most 8 students.
    res = solve(
        request(
            papers=[paper("CS301"), paper("EC301")],
            students=_two_papers(4),
            halls=[hall("G1", rows=3, benches=4)],
            reserve=4,
        )
    )
    assert res.unseated == []
    assert {s.row for s in res.seats} == {1, 2}
    [summary] = res.halls
    assert (summary.capacity, summary.used, summary.reserved) == (12, 8, 4)


def test_overflow_moves_to_the_next_hall() -> None:
    res = solve(
        request(
            papers=[paper("CS301"), paper("EC301")],
            students=_two_papers(6),
            halls=[hall("G1", rows=2, benches=4, order=0), hall("G2", rows=2, benches=4, order=1)],
            reserve=2,
        )
    )
    assert res.unseated == []
    used = {h.hall_id: h.used for h in res.halls}
    assert used == {"hall-G1": 6, "hall-G2": 6}


def test_too_many_students_are_listed_with_a_reason() -> None:
    res = solve(
        request(
            papers=[paper("CS301"), paper("EC301")],
            students=_two_papers(5),
            halls=[hall("G1", rows=2, benches=4)],
            reserve=0,
        )
    )
    assert len(res.seats) == 8
    assert res.status == "INFEASIBLE"
    assert [u.reason for u in res.unseated] == ["not_enough_seats", "not_enough_seats"]
    assert "halls are full" in res.unseated[0].message


def test_reserve_larger_than_hall_leaves_it_empty() -> None:
    res = solve(
        request(
            papers=[paper("CS301")],
            students=[student("A1", "CS301")],
            halls=[hall("G1", rows=1, benches=2, order=0), hall("G2", rows=2, benches=2, order=1)],
            reserve=3,
        )
    )
    assert [s.hall_id for s in res.seats] == ["hall-G2"]
    assert res.halls[0].reserved == 2
