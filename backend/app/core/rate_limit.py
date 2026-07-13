"""
Rate limiting (slowapi).

In-memory limiter keyed by client IP — adequate for a single instance. For a
multi-instance deployment (Cloud Run), point slowapi at a shared store (Redis)
so limits are enforced globally. Disabled in tests via `rate_limit_enabled`.
"""

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import settings
from app.core.problem import problem_response

limiter = Limiter(
    key_func=get_remote_address,
    enabled=settings.rate_limit_enabled,
    default_limits=[],
)

# Applied to sensitive endpoints (e.g. login) via @limiter.limit(LOGIN_RATE_LIMIT).
LOGIN_RATE_LIMIT = settings.login_rate_limit
# Endpoints that trigger outbound emails (forgot-password, resend-verification):
# abuse would spam arbitrary inboxes and burn the Brevo quota.
EMAIL_RATE_LIMIT = settings.email_rate_limit


async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Render slowapi's 429 as RFC 7807 problem+json."""
    return problem_response(
        429,
        detail="Too many requests. Please slow down and try again shortly.",
        instance=str(request.url.path),
    )
