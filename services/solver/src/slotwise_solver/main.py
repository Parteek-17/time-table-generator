"""HTTP entry point.

Contract (CLAUDE.md): JSON in, JSON out, versioned paths. The solver is stateless and never
touches the database; the API calls it from a background job, never inside a user request.
"""

from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI(title="Slotwise solver", version="0.0.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/timetable/solve", status_code=501)
def solve_timetable() -> JSONResponse:
    # TODO(phase-2): accept the timetable problem schema and solve with OR-Tools CP-SAT.
    return JSONResponse(
        status_code=501,
        content={"error": "not_implemented", "message": "Timetable solving arrives in Phase 2."},
    )
