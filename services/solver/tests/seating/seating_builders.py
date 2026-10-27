"""Small fictional fixtures for the seating tests: one builder call per scenario."""

from typing import Any

from slotwise_solver.seating.models import SeatingRequest, SeatingResponse


def paper(code: str) -> dict[str, Any]:
    return {"id": f"paper-{code}", "code": code, "title": f"Paper {code}"}


def student(roll: str, code: str, *, accessible: bool = False) -> dict[str, Any]:
    return {
        "id": f"stu-{roll}",
        "rollNo": roll,
        "paperId": f"paper-{code}",
        "sectionId": None,
        "needsAccessibleSeat": accessible,
    }


def hall(
    code: str,
    *,
    rows: int,
    benches: int,
    seats_per_bench: int = 1,
    order: int = 0,
    floor: int = 0,
    accessible: bool = False,
) -> dict[str, Any]:
    return {
        "id": f"hall-{code}",
        "code": code,
        "floor": floor,
        "isAccessible": accessible,
        "rows": rows,
        "benchesPerRow": benches,
        "seatsPerBench": seats_per_bench,
        "order": order,
    }


def faculty(
    name: str, *, teaches: tuple[str, ...] = (), available: bool = True, duties: int = 0
) -> dict[str, Any]:
    return {
        "id": f"fac-{name}",
        "name": name,
        "available": available,
        "teachesPaperIds": [f"paper-{c}" for c in teaches],
        "dutiesSoFar": duties,
    }


def request(
    *,
    papers: list[dict[str, Any]],
    students: list[dict[str, Any]],
    halls: list[dict[str, Any]],
    faculty: list[dict[str, Any]] | None = None,
    reserve: int = 0,
    minimum: int = 1,
    per_invigilator: int = 30,
) -> dict[str, Any]:
    return {
        "version": "solver-seating.v1",
        "requestId": "test",
        "examSessionId": "session-1",
        "date": "2026-12-01",
        "sessionLabel": "Morning",
        "papers": papers,
        "students": students,
        "halls": halls,
        "faculty": faculty or [],
        "options": {
            "reserveSeatsPerHall": reserve,
            "invigilators": {
                "minimumPerHall": minimum,
                "studentsPerInvigilator": per_invigilator,
            },
        },
    }


def solve(body: dict[str, Any]) -> SeatingResponse:
    from slotwise_solver.seating.solve import solve as run

    return run(SeatingRequest.model_validate(body))


def grid(response: SeatingResponse, hall_id: str) -> dict[tuple[int, int], str]:
    """(row, column) → paper id for one hall."""
    return {(s.row, s.column): s.paper_id for s in response.seats if s.hall_id == hall_id}


def same_paper_neighbours(cells: dict[tuple[int, int], str]) -> list[tuple[int, int]]:
    bad = []
    for (r, c), pid in cells.items():
        for other in ((r, c + 1), (r + 1, c)):
            if cells.get(other) == pid:
                bad.append((r, c))
    return bad
