"""
RFC 7807 (application/problem+json) error responses.

Convention (CLAUDE.md): API errors follow RFC 7807. This module renders
FastAPI/Starlette HTTPExceptions as `application/problem+json` while preserving
the `detail` field for backward compatibility, and never leaks internal
exception strings or stack traces to clients.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)

PROBLEM_MEDIA_TYPE = "application/problem+json"

# Human-readable titles per status code (RFC 7807 `title`).
_TITLES = {
    400: "Bad Request",
    401: "Unauthorized",
    402: "Payment Required",
    403: "Forbidden",
    404: "Not Found",
    409: "Conflict",
    422: "Unprocessable Entity",
    429: "Too Many Requests",
    500: "Internal Server Error",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
}


def problem_response(
    status_code: int,
    detail: Optional[str] = None,
    *,
    title: Optional[str] = None,
    type_: str = "about:blank",
    instance: Optional[str] = None,
    headers: Optional[dict[str, str]] = None,
    extra: Optional[dict[str, Any]] = None,
) -> JSONResponse:
    """Build an RFC 7807 problem+json response."""
    body: dict[str, Any] = {
        "type": type_,
        "title": title or _TITLES.get(status_code, "Error"),
        "status": status_code,
    }
    if detail is not None:
        body["detail"] = detail
    if instance is not None:
        body["instance"] = instance
    if extra:
        body.update(extra)
    return JSONResponse(
        status_code=status_code,
        content=body,
        media_type=PROBLEM_MEDIA_TYPE,
        headers=headers,
    )


async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    """Render any HTTPException as problem+json (preserving `detail` and headers)."""
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return problem_response(
        exc.status_code,
        detail=detail,
        instance=str(request.url.path),
        headers=getattr(exc, "headers", None),
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """Render request-validation errors (422) as problem+json (RFC 7807 §3.1 extension).

    Only loc + msg + type are exposed — never the submitted input values, which
    could contain PII.
    """
    invalid_params = [
        {"loc": list(e.get("loc", [])), "msg": e.get("msg"), "type": e.get("type")}
        for e in exc.errors()
    ]
    return problem_response(
        422,
        detail="Request validation failed",
        instance=str(request.url.path),
        extra={"invalid_params": invalid_params},
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Last-resort handler: never leak internals/stack traces to the client.

    The full exception is logged server-side; the client gets a generic 500.
    """
    logger.error("Unhandled exception on %s: %s", request.url.path, exc, exc_info=True)
    return problem_response(
        500,
        detail="An unexpected error occurred. Please try again later.",
        instance=str(request.url.path),
    )
