from __future__ import annotations

import uuid
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

REQUEST_ID_HEADER = "x-request-id"
MAX_REQUEST_ID_LEN = 128


def get_or_create_request_id(request: Request) -> str:
    raw = request.headers.get(REQUEST_ID_HEADER, "")
    rid = raw.strip()
    if rid and len(rid) <= MAX_REQUEST_ID_LEN:
        return rid
    return str(uuid.uuid4())


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        rid = get_or_create_request_id(request)
        request.state.request_id = rid
        response: Response = await call_next(request)
        response.headers["X-Request-Id"] = rid
        return response
