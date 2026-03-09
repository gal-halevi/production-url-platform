from __future__ import annotations

import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import psycopg2
import psycopg2.extras
import psycopg2.pool
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic import BaseModel, Field, HttpUrl
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.request_id import RequestIdMiddleware


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        v = int(raw)
        if v <= 0:
            raise ValueError()
        return v
    except ValueError as e:
        raise RuntimeError(f"Invalid {name}: must be a positive integer") from e


LOG_LEVEL = os.getenv("LOG_LEVEL", "info").lower()
BODY_LIMIT_BYTES = _env_int("BODY_LIMIT_BYTES", 16 * 1024)  # 16KB
DATABASE_URL = os.getenv("DATABASE_URL")
APP_VERSION = os.getenv("APP_VERSION", "unknown")
GIT_SHA = os.getenv("GIT_SHA", "unknown")
APP_ENV = os.getenv("APP_ENV", "unknown")
# Comma-separated list of allowed CORS origins, e.g. "https://app.galhalevi.dev"
# Empty string means no browser clients are expected (safe default).
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
DB_POOL_MIN = _env_int("DB_POOL_MIN", 2)
DB_POOL_MAX = _env_int("DB_POOL_MAX", 10)
RATE_LIMIT_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true"
RATE_LIMIT_MAX = _env_int("RATE_LIMIT_MAX", 60)
RATE_LIMIT_WINDOW_MS = _env_int("RATE_LIMIT_WINDOW_MS", 60000)

class _JsonFormatter(logging.Formatter):
    """Emit one JSON object per log line with a consistent field schema.

    All services in the platform use the same schema so Loki can query
    across services with a single LogQL expression.
    """

    def format(self, record: logging.LogRecord) -> str:
        payload: Dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).strftime(
                "%Y-%m-%dT%H:%M:%S.%f"
            )[:-3] + "Z",
            "level": record.levelname.lower(),
            "service": "analytics-service",
            "msg": record.getMessage(),
        }
        # Merge only explicit extra fields passed via logger.info(..., extra={...}).
        # Exclude all standard LogRecord attributes to keep output clean.
        _SKIP = {
            "name", "msg", "args", "levelname", "levelno", "pathname", "filename",
            "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
            "created", "msecs", "relativeCreated", "thread", "threadName",
            "processName", "process", "taskName", "message",
            # Uvicorn attaches an ANSI-colored variant of the message — drop it.
            "color_message",
        }
        for key, val in record.__dict__.items():
            if key not in _SKIP and not key.startswith("_"):
                payload[key] = val
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


_handler = logging.StreamHandler(sys.stdout)
_handler.setFormatter(_JsonFormatter())
logging.root.setLevel(LOG_LEVEL.upper())
logging.root.handlers = [_handler]
logger = logging.getLogger("analytics-service")


from contextlib import contextmanager

# Module-level pool — initialized lazily on first request, shared across all
# subsequent requests. Lazy init avoids RuntimeError at import time in tests
# that mock DATABASE_URL.
_pool: psycopg2.pool.ThreadedConnectionPool | None = None


def _get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    global _pool
    if _pool is None:
        if not DATABASE_URL:
            raise RuntimeError("DATABASE_URL environment variable is not set")
        logger.info("db_pool_init", extra={"pool_min": DB_POOL_MIN, "pool_max": DB_POOL_MAX})
        _pool = psycopg2.pool.ThreadedConnectionPool(DB_POOL_MIN, DB_POOL_MAX, DATABASE_URL)
    return _pool


@contextmanager
def get_db():
    """Acquire a connection from the pool, yield it, and return it on exit.

    Using a context manager ensures the connection is always returned to the
    pool even if an exception is raised mid-request.
    """
    conn = _get_pool().getconn()
    try:
        yield conn
    except Exception:
        conn.rollback()
        raise
    finally:
        _get_pool().putconn(conn)


class RedirectEvent(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    ts: Optional[int] = Field(default=None, description="Unix timestamp (seconds). Optional.")
    user_agent: Optional[str] = Field(default=None, max_length=256)
    referrer: Optional[HttpUrl] = None


app = FastAPI(title="analytics-service", version="0.1.0")
app.add_middleware(RequestIdMiddleware)

# Rate limiter — keyed by real client IP from X-Forwarded-For (set by ingress-nginx).
# Disabled when RATE_LIMIT_ENABLED=false (e.g. local dev or smoke tests).
# slowapi uses the `limits` library which only supports second/minute/hour/day granularity.
# RATE_LIMIT_WINDOW_MS is converted to seconds (rounded up) to stay consistent with
# the url-service env var naming convention while satisfying the limits library.
_window_seconds = max(1, (RATE_LIMIT_WINDOW_MS + 999) // 1000)
_rate_limit = f"{RATE_LIMIT_MAX} per {_window_seconds} second" if RATE_LIMIT_ENABLED else "999999 per second"
limiter = Limiter(key_func=get_remote_address, default_limits=[_rate_limit])
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
from slowapi.middleware import SlowAPIMiddleware  # noqa: E402
app.add_middleware(SlowAPIMiddleware)
if CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_methods=["GET", "OPTIONS"],
        allow_headers=["Content-Type", "X-Request-Id"],
        max_age=86400,  # preflight cache: 24h
    )

Instrumentator(
    should_group_status_codes=False,
    excluded_handlers=["/metrics"],
).instrument(app).expose(app, endpoint="/metrics")

_started_at = time.time()


def _rid(request: Request) -> str:
    return getattr(request.state, "request_id", "")


@app.middleware("http")
async def request_log(request: Request, call_next):
    start = time.perf_counter()
    status: int | str = "n/a"

    try:
        response = await call_next(request)
        status = getattr(response, "status_code", "n/a")
        return response
    finally:
        ms = int((time.perf_counter() - start) * 1000)
        logger.info("request", extra={
            "request_id": _rid(request),
            "method": request.method,
            "path": request.url.path,
            "status": status,
            "ms": ms,
        })


@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    cl = request.headers.get("content-length")
    if cl is not None:
        try:
            if int(cl) > BODY_LIMIT_BYTES:
                logger.info("payload_too_large", extra={
                    "request_id": _rid(request),
                    "content_length": cl,
                })
                return JSONResponse(status_code=413, content={"error": "payload_too_large"})
        except ValueError:
            logger.info("invalid_content_length", extra={
                "request_id": _rid(request),
                "content_length": cl,
            })
            return JSONResponse(status_code=400, content={"error": "invalid_content_length"})
    return await call_next(request)


@app.get("/health")
@limiter.exempt
async def health() -> Dict[str, str]:
    return {
        "status": "ok",
        "service": "analytics-service",
        "version": APP_VERSION,
        "commit": GIT_SHA,
        "env": APP_ENV,
        "started_at": datetime.fromtimestamp(_started_at, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{int((_started_at % 1) * 1000):03d}Z",
    }


@app.get("/ready")
@limiter.exempt
async def ready() -> Dict[str, str]:
    # Verify DB connectivity - pod should not receive traffic if DB is unreachable
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
    except Exception as e:
        logger.warning("readiness_check_failed", extra={"error": str(e)})
        return JSONResponse(status_code=503, content={"status": "unavailable", "reason": "db_unreachable"})
    return {"status": "ready"}


@app.post("/events", status_code=202)
async def ingest_event(evt: RedirectEvent, request: Request) -> Dict[str, Any]:
    # UPSERT: increment count if code exists, insert with count=1 if not.
    # ON CONFLICT is atomic - no race condition between check and insert.
    with get_db() as conn:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO analytics (code, count)
                    VALUES (%s, 1)
                    ON CONFLICT (code) DO UPDATE
                        SET count = analytics.count + 1
                    """,
                    (evt.code,),
                )

    logger.info("event_accepted", extra={"request_id": _rid(request), "code": evt.code})
    return {"accepted": True, "code": evt.code}


@app.get("/stats")
async def stats(request: Request) -> Dict[str, Any]:
    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT code, count FROM analytics ORDER BY count DESC LIMIT 20"
            )
            rows = cur.fetchall()
            cur.execute("SELECT COUNT(*) AS total FROM analytics")
            total = cur.fetchone()["total"]

    logger.info("stats_top", extra={"request_id": _rid(request), "tracked_codes": total})
    return {
        "uptime_seconds": int(time.time() - _started_at),
        "tracked_codes": total,
        "top": [{"code": r["code"], "count": r["count"]} for r in rows],
    }


@app.get("/stats/{code}")
async def stats_code(code: str, request: Request) -> Dict[str, Any]:
    if not (1 <= len(code) <= 64):
        logger.info("invalid_code", extra={"request_id": _rid(request), "code": code})
        return JSONResponse(status_code=400, content={"error": "invalid_code"})

    with get_db() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT count FROM analytics WHERE code = %s", (code,))
            row = cur.fetchone()

    count = int(row["count"]) if row else 0
    logger.info("stats_code", extra={"request_id": _rid(request), "code": code, "count": count})
    return {"code": code, "count": count}


@app.exception_handler(Exception)
async def handle_unexpected(request: Request, exc: Exception):
    logger.exception("unhandled_error", extra={"request_id": _rid(request)})

    if LOG_LEVEL in ("debug", "trace"):
        return JSONResponse(status_code=500, content={"error": "internal_error", "detail": str(exc)})

    return JSONResponse(status_code=500, content={"error": "internal_error"})


@app.get("/")
async def root() -> Response:
    return JSONResponse(status_code=404, content={"error": "not_found"})
