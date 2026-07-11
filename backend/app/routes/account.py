"""
Account router — RGPD Art. 17 (right to erasure).

`DELETE /users/me` permanently and irreversibly erases the authenticated user and
all their personal data. Erasure is a hard delete: removing the `users` row
triggers the Postgres ``ON DELETE CASCADE`` on ``user_profiles``, ``generated_cvs``,
``cv_jobs`` and ``career_passes``, so no orphan rows remain. We issue a Core DELETE
statement (not ``session.delete``) so the async session never lazy-loads the
relationships (which would raise on the async engine).

Contract: ``DELETE /users/me`` -> 204 | 401 (contracts/openapi.yaml, operationId
``deleteAccount``). Bearer JWT only, no request body — the bearer token already
grants full account control, so it is sufficient authorization for erasure. The
strong "type your email to confirm" guard is a client-side safeguard.

JWT invalidation: tokens are stateless (no revocation list), but ``get_current_user``
reloads the user on every request, so a deleted account's token is de-facto
rejected (401) on the very next call.

Extension point: PDF storage in GCS is not implemented (``gcs_pdf_url`` is never
written and there is no GCS client). When it is, erasure MUST also purge the
user's GCS blobs here, before the DB rows are deleted.
"""

import logging

from fastapi import APIRouter, Depends, status
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.database import get_db
from app.models import User
from app.routes.auth import get_current_active_user
from app.services import billing

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["Account"])


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently erase the authenticated user's account and all their data (RGPD Art. 17)."""
    user_id = current_user.id
    stripe_customer_id = current_user.stripe_customer_id

    # Best-effort: detach the payment identity at Stripe. A Stripe failure must
    # NEVER block the erasure the user is legally entitled to — log and continue.
    if stripe_customer_id:
        try:
            await run_in_threadpool(billing.delete_customer, stripe_customer_id)
        except Exception:  # noqa: BLE001 - erasure takes precedence over Stripe
            logger.exception(
                "Stripe customer deletion failed for user %s (continuing erasure)",
                user_id,
            )

    # Hard delete. Postgres ON DELETE CASCADE purges profile, CVs, jobs and passes.
    await db.execute(delete(User).where(User.id == user_id))
    await db.commit()

    # Compliance evidence WITHOUT PII: pseudonymous user id (UUID) + log timestamp.
    logger.info("Account erased (RGPD Art. 17): user_id=%s", user_id)
