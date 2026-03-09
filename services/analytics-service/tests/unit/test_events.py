import os
from unittest.mock import MagicMock, patch

from fastapi import Request
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


def mock_get_db(conn):
    """Return a context manager that yields the given mock connection.

    get_db() is now a context manager — tests must patch it with something
    that supports `with get_db() as conn:` rather than a plain return value.
    """
    from contextlib import contextmanager

    @contextmanager
    def _ctx():
        yield conn

    return _ctx


def test_health_ok():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json().get("status") == "ok"


def test_event_increments_stats():
    code = "abc123"

    # Simulate: code not yet in DB (fetchone returns None)
    conn_get, _ = make_mock_conn(fetchone_return=None)
    with patch("app.main.get_db", mock_get_db(conn_get)):
        r0 = client.get(f"/stats/{code}")
    assert r0.status_code == 200
    assert r0.json()["count"] == 0

    # Simulate: event ingestion succeeds
    conn_post, _ = make_mock_conn()
    with patch("app.main.get_db", mock_get_db(conn_post)):
        r1 = client.post("/events", json={"code": code})
    assert r1.status_code == 202

    # Simulate: code now has count=1 in DB
    conn_get2, _ = make_mock_conn(fetchone_return={"count": 1})
    with patch("app.main.get_db", mock_get_db(conn_get2)):
        r2 = client.get(f"/stats/{code}")
    assert r2.status_code == 200
    assert r2.json()["count"] == 1


def test_event_requires_code():
    r = client.post("/events", json={})
    assert r.status_code in (400, 422)


def test_rate_limit_returns_429():
    """Second request from same IP exceeds a 1-per-minute limit and gets 429."""
    from fastapi import FastAPI
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    from slowapi.middleware import SlowAPIMiddleware
    from slowapi.util import get_remote_address

    _limiter = Limiter(key_func=get_remote_address, default_limits=["1 per minute"])
    _app = FastAPI()
    _app.state.limiter = _limiter
    _app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    _app.add_middleware(SlowAPIMiddleware)

    @_app.get("/stats/{code}")
    async def _stats_code(code: str, request: Request):
        return {"code": code, "count": 0}

    test_client = TestClient(_app, raise_server_exceptions=False)

    r1 = test_client.get("/stats/abc", headers={"X-Forwarded-For": "1.2.3.4"})
    assert r1.status_code == 200

    r2 = test_client.get("/stats/abc", headers={"X-Forwarded-For": "1.2.3.4"})
    assert r2.status_code == 429
