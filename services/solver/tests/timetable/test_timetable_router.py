from fastapi.testclient import TestClient
from timetable_builders import Tiny

from slotwise_solver.main import app
from slotwise_solver.timetable.contract import response_issues

client = TestClient(app)


def test_solve_returns_a_valid_response() -> None:
    t = Tiny(days=(1,), periods=2)
    sec = t.section("CS A")
    course = t.course("CS101", lectures=2)
    t.room("LT 1")
    t.assign(course, "lecture", ("section", sec), [t.teacher("Dr. One")])
    response = client.post("/v1/timetable/solve", json=t.request())
    assert response.status_code == 200
    body = response.json()
    assert response_issues(body) == []
    assert body["requestId"] == "test"
    assert len(body["placed"]) == 2


def test_invalid_request_is_rejected_with_reasons() -> None:
    response = client.post("/v1/timetable/solve", json={"version": "solver-timetable.v1"})
    assert response.status_code == 422
    body = response.json()
    assert body["error"] == "invalid_request"
    assert any("requestId" in issue for issue in body["issues"])
