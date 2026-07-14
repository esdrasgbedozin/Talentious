"""
Service-to-service IAM auth for private Cloud Run agents (M5-T01).

The AI agents accept only requests authenticated as the backend's service
account (roles/run.invoker). This helper mints a Google ID token for the target
service's audience and returns the Authorization header to attach. Disabled in
local dev/tests (settings.enable_iam_auth=False → empty headers, direct calls).

``google.oauth2.id_token.fetch_id_token`` works both on Cloud Run (metadata
server) and with service-account credentials, so the same code path serves any
deployment. The fetch is synchronous → run in a threadpool from async callers.
"""

import logging

from starlette.concurrency import run_in_threadpool

from app.config import settings

logger = logging.getLogger(__name__)


def _fetch_id_token(audience: str) -> str:
    """Fetch a Google ID token for the given audience (sync; monkeypatched in tests)."""
    import google.auth.transport.requests
    import google.oauth2.id_token

    request = google.auth.transport.requests.Request()
    return google.oauth2.id_token.fetch_id_token(request, audience)


async def auth_headers(audience: str) -> dict:
    """Authorization header for a private Cloud Run service ({} when disabled).

    Raises on token-fetch failure when IAM auth is enabled: a silent fallback to
    unauthenticated calls would just turn into an opaque 403 downstream.
    """
    if not settings.enable_iam_auth:
        return {}
    token = await run_in_threadpool(_fetch_id_token, audience)
    return {"Authorization": f"Bearer {token}"}
