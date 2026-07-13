"""
PasswordResetToken model — single-use, expiring password-reset tokens.

Unlike the email-verification token (a stateless JWT — replaying it is harmless),
a reset token MUST be single-use: a leaked link must not be replayable. We store
the SHA-256 hash of an opaque token (never the raw value) and flip ``used`` on
consumption. FK cascade removes tokens when the account is erased.
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


class PasswordResetToken(Base):
    """A single password-reset grant (stored as a SHA-256 hash)."""

    __tablename__ = "password_reset_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash = Column(String(64), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    user = relationship("User", backref="password_reset_tokens")

    def __repr__(self) -> str:
        return f"<PasswordResetToken(id={self.id}, user_id={self.user_id}, used={self.used})>"
