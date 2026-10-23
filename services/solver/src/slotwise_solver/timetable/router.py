"""POST /v1/timetable/solve.

Contract: solver-timetable.v1 (packages/shared/src/contracts/solver-timetable.v1.ts, JSON
Schema in services/solver/contracts/timetable_v1.schema.json).
"""

from typing import Any

from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse

from .contract import request_issues
from .solve import solve

router = APIRouter(prefix="/v1/timetable", tags=["timetable"])


# A plain `def`: FastAPI runs it in a worker thread, so a long solve doesn't block /health.
@router.post("/solve")
def solve_timetable(body: Any = Body(...)) -> JSONResponse:  # noqa: B008 (FastAPI idiom)
    issues = request_issues(body)
    if issues:
        return JSONResponse(
            status_code=422,
            content={
                "error": "invalid_request",
                "message": "The request does not match solver-timetable.v1.",
                "issues": issues[:50],
            },
        )
    return JSONResponse(content=solve(body))
