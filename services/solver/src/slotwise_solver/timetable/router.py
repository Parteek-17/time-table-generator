"""POST /v1/timetable/solve.

Contract: solver-timetable.v1 (packages/shared/src/contracts/solver-timetable.v1.ts, JSON
Schema in services/solver/contracts/timetable_v1.schema.json).
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/v1/timetable", tags=["timetable"])


@router.post("/solve", status_code=501)
def solve_timetable() -> JSONResponse:
    # TODO(phase-2): accept SolverTimetableRequestV1 and solve with OR-Tools CP-SAT.
    return JSONResponse(
        status_code=501,
        content={"error": "not_implemented", "message": "Timetable solving arrives in Phase 2."},
    )
