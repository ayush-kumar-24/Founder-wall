"""HTTP middleware: request correlation, access logging, client IP resolution."""

from __future__ import annotations

import time
import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.shared.logging import get_logger

logger = get_logger("http.access")
_REQUEST_ID_HEADER = "x-request-id"


def resolve_client_ip(request: Request, *, trust_proxy: bool) -> str:
    """Return the caller's IP, honouring X-Forwarded-For only behind a proxy.

    Behind Nginx/an LB the socket peer is the proxy, so per-client rate limiting
    must use the left-most forwarded address. We only trust that header when
    explicitly configured, to prevent client-supplied spoofing when exposed.
    """
    if trust_proxy:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip.strip()
    return request.client.host if request.client else "anonymous"


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assigns a request id, binds logging context, and logs each request."""

    def __init__(self, app: object, *, trust_proxy: bool) -> None:
        super().__init__(app)  # type: ignore[arg-type]
        self._trust_proxy = trust_proxy

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get(_REQUEST_ID_HEADER) or uuid.uuid4().hex
        client_ip = resolve_client_ip(request, trust_proxy=self._trust_proxy)
        request.state.request_id = request_id
        request.state.client_ip = client_ip

        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id,
            method=request.method,
            path=request.url.path,
            client_ip=client_ip,
        )
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            logger.error("request_failed", duration_ms=duration_ms)
            raise
        finally:
            structlog.contextvars.unbind_contextvars("method", "path")

        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        response.headers[_REQUEST_ID_HEADER] = request_id
        logger.info(
            "request_completed",
            status_code=response.status_code,
            duration_ms=duration_ms,
        )
        return response
