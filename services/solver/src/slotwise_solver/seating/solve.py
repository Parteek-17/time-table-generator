"""solver-seating.v1: request → seats, hall summaries and invigilators."""

import time

from .models import HallSummary, Seat, SeatingRequest, SeatingResponse, Unseated
from .seat import seat_students


def solve(request: SeatingRequest) -> SeatingResponse:
    started = time.perf_counter()
    result = seat_students(request)

    seats = [
        Seat(
            student_id=p.student.id,
            paper_id=p.student.paper_id,
            hall_id=p.grid.hall.id,
            row=p.row,
            column=p.column,
            label=p.grid.label(p.row, p.column),
        )
        for p in sorted(
            result.placements, key=lambda p: (p.grid.hall.order, p.grid.hall.code, p.row, p.column)
        )
    ]
    halls = []
    for grid in result.grids:
        paper_ids = sorted(set(grid.taken.values()))
        halls.append(
            HallSummary(
                hall_id=grid.hall.id,
                capacity=grid.hall.capacity,
                used=len(grid.taken),
                reserved=grid.reserve,
                paper_ids=paper_ids,
                invigilator_ids=[],
            )
        )
    unseated = [
        Unseated(student_id=s.id, reason=reason, message=message)  # type: ignore[arg-type]
        for s, reason, message in result.unseated
    ]
    return SeatingResponse(
        request_id=request.request_id,
        status="INFEASIBLE" if unseated else "FEASIBLE",
        solve_seconds=round(time.perf_counter() - started, 3),
        seats=seats,
        unseated=unseated,
        halls=halls,
        invigilation_problems=[],
    )
