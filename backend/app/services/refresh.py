"""
Refresh-token service — issue, rotate and revoke DB-backed refresh tokens.

Only SHA-256 hashes of the opaque tokens are ever persisted (see RefreshToken).
Rotation is single-use: exchanging a token revokes it and mints a new one. A
presented token that is already revoked is treated as theft and revokes the
user's entire token set (family invalidation).
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import RefreshToken, User


class InvalidRefreshToken(Exception):
    """Raised when a refresh token is unknown, expired, revoked or reused."""


def hash_token(raw_token: str) -> str:
    """SHA-256 hex digest — what we store and look up (never the raw token)."""
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def _generate_raw_token() -> str:
    """A high-entropy, URL-safe opaque token (not a JWT — it carries no claims)."""
    return secrets.token_urlsafe(48)


def _expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(
        days=settings.refresh_token_expire_days
    )


async def issue_refresh_token(db: AsyncSession, user_id) -> str:
    """Create and persist a new refresh token for a user; return the RAW token."""
    raw = _generate_raw_token()
    db.add(
        RefreshToken(
            user_id=user_id,
            token_hash=hash_token(raw),
            expires_at=_expiry(),
        )
    )
    await db.commit()
    return raw


async def rotate_refresh_token(db: AsyncSession, raw_token: str) -> tuple[User, str]:
    """Validate + rotate a refresh token.

    Returns (user, new_raw_token) on success. Revokes the presented token and
    issues a fresh one (single-use rotation). Raises InvalidRefreshToken for any
    unknown/expired/revoked/reused token; a reused (already-revoked) token also
    revokes the user's whole token set.
    """
    row = (
        await db.execute(
            select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw_token))
        )
    ).scalar_one_or_none()

    if row is None:
        raise InvalidRefreshToken()

    if row.revoked:
        # Reuse of an already-rotated token → likely theft: burn the whole family.
        await db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == row.user_id)
            .values(revoked=True)
        )
        await db.commit()
        raise InvalidRefreshToken()

    if row.expires_at <= datetime.now(timezone.utc):
        raise InvalidRefreshToken()

    user = (
        await db.execute(select(User).where(User.id == row.user_id))
    ).scalar_one_or_none()
    if user is None:  # defensive — cascade should have removed the token already
        raise InvalidRefreshToken()

    # Rotate: revoke the presented token, mint a replacement.
    row.revoked = True
    new_raw = _generate_raw_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(new_raw),
            expires_at=_expiry(),
        )
    )
    await db.commit()
    return user, new_raw


async def revoke_refresh_token(db: AsyncSession, raw_token: str) -> None:
    """Revoke a single refresh token (logout). Idempotent — unknown tokens no-op."""
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.token_hash == hash_token(raw_token))
        .values(revoked=True)
    )
    await db.commit()
