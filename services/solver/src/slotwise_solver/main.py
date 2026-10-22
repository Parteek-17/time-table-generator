"""HTTP entry point.

Contract (CLAUDE.md): JSON in, JSON out, versioned paths. The solver is stateless and never
touches the database; the API calls it from a background job, never inside a user request.

Each stream owns its router: timetable/ (P2E) and seating/ (P6). This file belongs to INT.
"""

from fastapi import FastAPI

from slotwise_solver.seating.router import router as seating_router
from slotwise_solver.timetable.router import router as timetable_router

app = FastAPI(title="Slotwise solver", version="0.0.0")
app.include_router(timetable_router)
app.include_router(seating_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
