"""
RefreshToken model — DB-backed, rotating refresh tokens.

The access token is short-lived and stateless (not revocable). Long-lived sessions
are carried by a refresh token stored here so it CAN be revoked: on logout we
delete the row, and on account erasure the ``ON DELETE CASCADE`` on ``user_id``
revokes every session automatically (RGPD Art. 17).

Only a SHA-256 hash of the opaque token is stored, never the raw value — a DB leak
must not hand out usable sessions. Rotation: each successful refresh revokes the
presented token and issues a new one; presenting an already-revoked token is
treated as theft and revokes the user's whole token set.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


def _utcnow() -> datetime:
    """Timezone-aware UTC now."""
    return datetime.now(timezone.utc)


class RefreshToken(Base):
    """A single refresh-token grant for a user (stored as a SHA-256 hash)."""

    __tablename__ = "refresh_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # SHA-256 hex digest of the opaque refresh token (never the raw token).
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    user = relationship("User", backref="refresh_tokens")

    def __repr__(self) -> str:
        return f"<RefreshToken(id={self.id}, user_id={self.user_id}, revoked={self.revoked})>"

    @property
    def is_usable(self) -> bool:
        """True when the token can still be exchanged (not revoked, not expired)."""
        return not self.revoked and self.expires_at > _utcnow()
