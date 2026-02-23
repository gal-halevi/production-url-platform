from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def make_mock_conn(fetchone_return=None, fetchall_return=None):
    """Build a mock psycopg2 connection that supports context managers."""
    cursor = MagicMock()
    cursor.fetchone.return_value = fetchone_return
    cursor.fetchall.return_value = fetchall_return or []

    # Support `with conn.cursor() as cur:`
    cursor.__enter__ = lambda s: s
    cursor.__exit__ = MagicMock(return_value=False)

    conn = MagicMock()
    conn.cursor.return_value = cursor
    conn.close = MagicMock()

    # Support `with conn:` (transaction block)
    conn.__enter__ = lambda s: s
    conn.__exit__ = MagicMock(return_value=False)

    return conn, cursor


def test_health_ok():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


def test_event_increments_stats():
    code = "abc123"

    # Simulate: code not yet in DB (fetchone returns None)
    conn_get, _ = make_mock_conn(fetchone_return=None)
    with patch("app.main.get_db", return_value=conn_get):
        r0 = client.get(f"/stats/{code}")
    assert r0.status_code == 200
    assert r0.json()["count"] == 0

    # Simulate: event ingestion succeeds
    conn_post, _ = make_mock_conn()
    with patch("app.main.get_db", return_value=conn_post):
        r1 = client.post("/events", json={"code": code})
    assert r1.status_code == 202

    # Simulate: code now has count=1 in DB
    conn_get2, _ = make_mock_conn(fetchone_return={"count": 1})
    with patch("app.main.get_db", return_value=conn_get2):
        r2 = client.get(f"/stats/{code}")
    assert r2.status_code == 200
    assert r2.json()["count"] == 1


def test_event_requires_code():
    r = client.post("/events", json={})
    assert r.status_code in (400, 422)
