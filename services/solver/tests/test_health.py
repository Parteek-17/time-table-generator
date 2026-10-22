import json
from pathlib import Path

from fastapi.testclient import TestClient

from slotwise_solver.main import app

client = TestClient(app)
CONTRACTS = Path(__file__).resolve().parents[1] / "contracts"


def test_health_is_ok() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_contract_schemas_are_present() -> None:
    timetable = json.loads((CONTRACTS / "timetable_v1.schema.json").read_text(encoding="utf-8"))
    seating = json.loads((CONTRACTS / "seating_v1.schema.json").read_text(encoding="utf-8"))
    assert set(timetable["$defs"]) == {"SolverTimetableRequestV1", "SolverTimetableResponseV1"}
    assert set(seating["$defs"]) == {"SolverSeatingRequestV1", "SolverSeatingResponseV1"}
