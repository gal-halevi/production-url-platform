from __future__ import annotations

import logging
import os
import sys
import time
from collections import Counter
from typing import Any, Dict, Optional

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, HttpUrl

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

logging.basicConfig(
    level=logging.INFO,
    stream=sys.stdout,
    format="%(levelname)s %(message)s",
)
logger = logging.getLogger("analytics-service")


class RedirectEvent(BaseModel):
    code: str = Field(min_length=1, max_length=64)
    ts: Optional[int] = Field(default=None, description="Unix timestamp (seconds). Optional.")
    user_agent: Optional[str] = Field(default=None, max_length=256)
    referrer: Optional[HttpUrl] = None


app = FastAPI(title="analytics-service", version="0.1.0")
app.add_middleware(RequestIdMiddleware)

_started_at = time.time()

# Simple in-memory aggregation for now (we'll move to DB later)
_counts: Counter[str] = Counter()


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
        logger.info(
            "request_id=%s method=%s path=%s status=%s ms=%s",
            _rid(request),
            request.method,
            request.url.path,
            status,
            ms,
        )


@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    # Prevent huge bodies (basic hardening)
    cl = request.headers.get("content-length")
    if cl is not None:
        try:
            if int(cl) > BODY_LIMIT_BYTES:
                logger.info(
                    "request_id=%s payload_too_large content_length=%s",
                    _rid(request),
                    cl,
                )
                return JSONResponse(status_code=413, content={"error": "payload_too_large"})
        except ValueError:
            logger.info(
                "request_id=%s invalid_content_length content_length=%s",
                _rid(request),
                cl,
            )
            return JSONResponse(status_code=400, content={"error": "invalid_content_length"})
    return await call_next(request)


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok", "service": "analytics-service"}


@app.get("/ready")
async def ready() -> Dict[str, str]:
    # No external deps yet
    return {"status": "ready"}


@app.post("/events", status_code=202)
async def ingest_event(evt: RedirectEvent, request: Request) -> Dict[str, Any]:
    _counts[evt.code] += 1
    logger.info(
        "request_id=%s event_accepted code=%s count=%s",
        _rid(request),
        evt.code,
        int(_counts[evt.code]),
    )
    return {"accepted": True, "code": evt.code}


@app.get("/stats")
async def stats(request: Request) -> Dict[str, Any]:
    top = _counts.most_common(20)
    logger.info(
        "request_id=%s stats_top tracked_codes=%s",
        _rid(request),
        len(_counts),
    )
    return {
        "uptime_seconds": int(time.time() - _started_at),
        "tracked_codes": len(_counts),
        "top": [{"code": code, "count": count} for code, count in top],
    }


@app.get("/stats/{code}")
async def stats_code(code: str, request: Request) -> Dict[str, Any]:
    if not (1 <= len(code) <= 64):
        logger.info("request_id=%s invalid_code code=%s", _rid(request), code)
        return JSONResponse(status_code=400, content={"error": "invalid_code"})

    count = int(_counts.get(code, 0))
    logger.info("request_id=%s stats_code code=%s count=%s", _rid(request), code, count)
    return {"code": code, "count": count}


@app.exception_handler(Exception)
async def handle_unexpected(request: Request, exc: Exception):
    # Avoid leaking internals; keep logs in server output
    logger.exception("request_id=%s unhandled_error", _rid(request))

    if LOG_LEVEL in ("debug", "trace"):
        return JSONResponse(status_code=500, content={"error": "internal_error", "detail": str(exc)})

    return JSONResponse(status_code=500, content={"error": "internal_error"})


@app.get("/")
async def root() -> Response:
    return JSONResponse(status_code=404, content={"error": "not_found"})
