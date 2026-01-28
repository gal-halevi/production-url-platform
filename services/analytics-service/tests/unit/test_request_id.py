from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_echoes_request_id_when_provided():
    r = client.get("/health", headers={"X-Request-Id": "demo-123"})
    assert r.status_code == 200
    assert r.headers.get("x-request-id") == "demo-123"


def test_generates_request_id_when_missing():
    r = client.get("/health")
    assert r.status_code == 200
    rid = r.headers.get("x-request-id")
    assert rid
    assert len(rid) > 0


def test_generates_when_blank_or_whitespace():
    r = client.get("/health", headers={"X-Request-Id": "   "})
    assert r.status_code == 200
    rid = r.headers.get("x-request-id")
    assert rid
    assert rid != "   "


def test_generates_when_too_long():
    r = client.get("/health", headers={"X-Request-Id": "a" * 200})
    assert r.status_code == 200
    rid = r.headers.get("x-request-id")
    assert rid
    assert rid != "a" * 200
    