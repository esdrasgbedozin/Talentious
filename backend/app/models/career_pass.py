"""
CareerPass model for managing user subscriptions and payments.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Enum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum

from app.database import Base


def _utcnow() -> datetime:
    """Timezone-aware UTC now."""
    return datetime.now(timezone.utc)


class PassType(str, enum.Enum):
    """CareerPass types available for purchase."""

    PASS_30_DAYS = "pass_30_days"
    PASS_90_DAYS = "pass_90_days"


class CareerPass(Base):
    """
    CareerPass model for tracking user one-time pass purchases.

    Attributes:
        id: Unique identifier (UUID)
        user_id: Foreign key to users table
        stripe_payment_id: Stripe payment intent ID
        pass_type: Type of pass (30 days or 90 days)
        valid_until: Expiration date (always required for temporary passes)
        purchased_at: Purchase timestamp
    """

    __tablename__ = "career_passes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Nullable so admin-granted passes (seed / support) can exist without a Stripe payment.
    stripe_payment_id = Column(String(255), nullable=True, unique=True)
    # values_callable: store enum VALUES ("pass_30_days"/...) to match the
    # Alembic-created Postgres enum (see UserRole note in user.py).
    pass_type = Column(
        Enum(PassType, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    valid_until = Column(
        DateTime(timezone=True), nullable=False
    )  # Always required for our temporary passes
    purchased_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    # Relationship
    user = relationship("User", backref="career_passes")

    def __repr__(self):
        return f"<CareerPass(id={self.id}, user_id={self.user_id}, type={self.pass_type}, valid_until={self.valid_until})>"

    @property
    def is_active(self) -> bool:
        """Check if this pass is currently valid."""
        return self.valid_until > _utcnow()
