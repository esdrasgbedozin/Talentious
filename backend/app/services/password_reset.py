"""
Password-reset service — issue and consume single-use reset tokens.

Only the SHA-256 hash of the opaque token is persisted. A token is single-use:
consuming it flips ``used`` so a leaked link cannot be replayed. Tokens expire
after ``email_token_expire_hours``.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import PasswordResetToken, User


class InvalidResetToken(Exception):
    """Raised when a reset token is unknown, expired or already used."""


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(
        hours=settings.email_token_expire_hours
    )


async def issue_reset_token(db: AsyncSession, user_id) -> str:
    """Create and persist a reset token; return the RAW token (for the email link)."""
    raw = secrets.token_urlsafe(48)
    db.add(
        PasswordResetToken(
            user_id=user_id,
            token_hash=hash_token(raw),
            expires_at=_expiry(),
        )
    )
    await db.commit()
    return raw


async def consume_reset_token(db: AsyncSession, raw_token: str) -> User:
    """Validate + single-use-consume a reset token, returning its user.

    Raises InvalidResetToken for any unknown / expired / already-used token.
    """
    row = (
        await db.execute(
            select(PasswordResetToken).where(
                PasswordResetToken.token_hash == hash_token(raw_token)
            )
        )
    ).scalar_one_or_none()

    if row is None or row.used or row.expires_at <= datetime.now(timezone.utc):
        raise InvalidResetToken()

    user = (
        await db.execute(select(User).where(User.id == row.user_id))
    ).scalar_one_or_none()
    if user is None:
        raise InvalidResetToken()

    row.used = True
    await db.flush()
    return user
