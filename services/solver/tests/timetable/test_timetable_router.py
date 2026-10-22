from fastapi.testclient import TestClient

from slotwise_solver.main import app

client = TestClient(app)


def test_timetable_solve_is_not_implemented_yet() -> None:
    response = client.post("/v1/timetable/solve", json={})
    assert response.status_code == 501
    assert response.json()["error"] == "not_implemented"
