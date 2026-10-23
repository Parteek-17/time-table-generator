"""POST /v1/seating/solve.

Contract: solver-seating.v1 (packages/shared/src/contracts/solver-seating.v1.ts, JSON Schema
in services/solver/contracts/seating_v1.schema.json).
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/v1/seating", tags=["seating"])


@router.post("/solve", status_code=501)
def solve_seating() -> JSONResponse:
    # TODO(phase-6): accept SolverSeatingRequestV1 and build the seating plan.
    return JSONResponse(
        status_code=501,
        content={"error": "not_implemented", "message": "Exam seating arrives in Phase 6."},
    )
