"""POST /v1/seating/solve.

Contract: solver-seating.v1 (packages/shared/src/contracts/solver-seating.v1.ts, JSON Schema
in services/solver/contracts/seating_v1.schema.json). Stateless: JSON in, JSON out. The API
calls it from a background job, never inside a user's request.
"""

from fastapi import APIRouter

from .models import SeatingRequest, SeatingResponse
from .solve import solve

router = APIRouter(prefix="/v1/seating", tags=["seating"])


@router.post("/solve", response_model=SeatingResponse, response_model_by_alias=True)
def solve_seating(request: SeatingRequest) -> SeatingResponse:
    return solve(request)
