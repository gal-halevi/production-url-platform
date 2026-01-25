from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_ok():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body.get("status") == "ok"


def test_event_increments_stats():
    code = "abc123"

    # initial stats should exist (0) or return 404 depending on your design
    r0 = client.get(f"/stats/{code}")
    if r0.status_code == 200:
        assert r0.json().get("count", 0) == 0
    else:
        assert r0.status_code in (404, 200)

    # emit one event
    ev = {"code": code}
    r1 = client.post("/events", json=ev)
    assert r1.status_code in (200, 201, 202)

    # now stats should be >= 1
    r2 = client.get(f"/stats/{code}")
    assert r2.status_code == 200
    assert r2.json().get("count", 0) >= 1


def test_event_requires_code():
    r = client.post("/events", json={})
    assert r.status_code in (400, 422)
