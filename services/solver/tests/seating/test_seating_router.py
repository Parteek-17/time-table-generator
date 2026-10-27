"""POST /v1/seating/solve with the shared contract fixture (packages/shared/fixtures)."""

import json
from pathlib import Path

from fastapi.testclient import TestClient

from slotwise_solver.main import app

client = TestClient(app)
FIXTURES = Path(__file__).parents[4] / "packages" / "shared" / "fixtures"


def test_demo_exam_request_seats_everyone_the_rules_allow() -> None:
    body = json.loads((FIXTURES / "demo-exam.seating-request.json").read_text("utf-8"))
    response = client.post("/v1/seating/solve", json=body)
    assert response.status_code == 200
    data = response.json()
    assert data["version"] == "solver-seating.v1"
    assert data["requestId"] == body["requestId"]
    # 180 of the 210 students write one paper: at most half of each hall can hold them.
    assert data["status"] == "INFEASIBLE"
    assert len(data["seats"]) == 138
    assert {u["reason"] for u in data["unseated"]} == {"adjacency"}
    assert {"studentId", "paperId", "hallId", "row", "column", "label"} == set(data["seats"][0])
    assert {"hallId", "capacity", "used", "reserved", "paperIds", "invigilatorIds"} == set(
        data["halls"][0]
    )


def test_a_bad_request_is_refused() -> None:
    response = client.post("/v1/seating/solve", json={"version": "solver-seating.v1"})
    assert response.status_code == 422
