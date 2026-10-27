"""Rules: invigilators per hall, balanced duties, availability, never their own paper."""

from collections import Counter

from seating_builders import faculty, hall, paper, request, solve, student

from slotwise_solver.seating.invigilation import HallNeed, assign_invigilators
from slotwise_solver.seating.models import SeatingRequest


def _students(n: int) -> list[dict]:
    return [student(f"A{i:02}", "CS301") for i in range(n)] + [
        student(f"B{i:02}", "EC301") for i in range(n)
    ]


def _duties(res) -> dict[str, list[str]]:
    return {h.hall_id: h.invigilator_ids for h in res.halls}


def test_one_more_invigilator_per_block_of_students() -> None:
    # 40 students in one 8 × 5 hall, 1 per 30 → 2 invigilators; the empty hall gets none.
    res = solve(
        request(
            papers=[paper("CS301"), paper("EC301")],
            students=_students(20),
            halls=[hall("G1", rows=8, benches=5, order=0), hall("G2", rows=2, benches=2, order=1)],
            faculty=[faculty(n) for n in ("Asha", "Bina", "Chetan")],
        )
    )
    assert [len(ids) for ids in _duties(res).values()] == [2, 0]
    assert res.invigilation_problems == []


def test_minimum_per_hall() -> None:
    res = solve(
        request(
            papers=[paper("CS301"), paper("EC301")],
            students=_students(2),
            halls=[hall("G1", rows=2, benches=2)],
            faculty=[faculty(n) for n in ("Asha", "Bina", "Chetan")],
            minimum=2,
        )
    )
    assert len(res.halls[0].invigilator_ids) == 2


def test_least_loaded_faculty_go_first() -> None:
    res = solve(
        request(
            papers=[paper("CS301"), paper("EC301")],
            students=_students(4),
            halls=[hall("G1", rows=2, benches=4)],
            faculty=[
                faculty("Asha", duties=3),
                faculty("Bina", duties=0),
                faculty("Chetan", duties=1),
            ],
        )
    )
    assert res.halls[0].invigilator_ids == ["fac-Bina"]


def test_nobody_gets_two_halls_and_duties_spread() -> None:
    res = solve(
        request(
            papers=[paper("CS301"), paper("EC301")],
            students=_students(12),
            halls=[hall(f"G{i}", rows=2, benches=4, order=i) for i in range(3)],
            faculty=[faculty(n) for n in ("Asha", "Bina", "Chetan", "Dev")],
        )
    )
    given = [fid for ids in _duties(res).values() for fid in ids]
    assert len(given) == 3
    assert max(Counter(given).values()) == 1


def test_unavailable_faculty_are_never_assigned() -> None:
    res = solve(
        request(
            papers=[paper("CS301"), paper("EC301")],
            students=_students(4),
            halls=[hall("G1", rows=2, benches=4)],
            faculty=[faculty("Asha", available=False), faculty("Bina", duties=5)],
        )
    )
    assert res.halls[0].invigilator_ids == ["fac-Bina"]


def test_never_in_a_hall_writing_their_own_paper() -> None:
    # G1 writes CS301, G2 writes ME301. Asha (least loaded) teaches CS301 and Bina ME301:
    # the matching puts each in the other hall rather than leaving one short.
    body = request(
        papers=[paper("CS301"), paper("ME301")],
        students=[],
        halls=[],
        faculty=[
            faculty("Asha", teaches=("CS301",)),
            faculty("Bina", teaches=("ME301",), duties=2),
        ],
    )
    halls = [
        HallNeed("hall-G1", "G1", 20, frozenset({"paper-CS301"})),
        HallNeed("hall-G2", "G2", 20, frozenset({"paper-ME301"})),
    ]
    assigned, problems = assign_invigilators(SeatingRequest.model_validate(body), halls)
    assert assigned == {"hall-G1": ["fac-Bina"], "hall-G2": ["fac-Asha"]}
    assert problems == []


def test_short_hall_is_explained() -> None:
    res = solve(
        request(
            papers=[paper("CS301"), paper("EC301")],
            students=_students(4),
            halls=[hall("G16", rows=2, benches=4)],
            faculty=[faculty("Asha", teaches=("CS301",)), faculty("Bina", available=False)],
            minimum=2,
        )
    )
    [problem] = res.invigilation_problems
    assert problem.missing == 2
    assert problem.message == (
        "Only 0 of 2 invigilators for G16: everyone else teaches CS301 or EC301 "
        "or is not available."
    )


def test_no_faculty_skips_invigilation() -> None:
    res = solve(
        request(
            papers=[paper("CS301")],
            students=[student("A1", "CS301")],
            halls=[hall("G1", rows=1, benches=1)],
        )
    )
    assert res.invigilation_problems == []
    assert res.halls[0].invigilator_ids == []
