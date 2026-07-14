"""
User model for authentication and authorization.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, String, DateTime, Enum
from sqlalchemy.dialects.postgresql import UUID
import enum

from app.database import Base


def _utcnow() -> datetime:
    """Timezone-aware UTC now."""
    return datetime.now(timezone.utc)


class UserRole(str, enum.Enum):
    """
    User roles enumeration.

    USER: Standard user. Access to paid features depends on active CareerPass.
    ADMIN: Unlimited access to all features.
    """

    USER = "user"
    ADMIN = "admin"


class User(Base):
    """
    User model for authentication.

    Attributes:
        id: Unique identifier (UUID)
        email: User email (unique)
        hashed_password: Bcrypt hashed password
        role: User role (user, admin)
        stripe_customer_id: Stripe customer ID for payments
        created_at: Account creation timestamp
    """

    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    # values_callable: store the enum VALUES ("user"/"admin") to match the
    # Alembic-created Postgres enum (lowercase). Without it SQLAlchemy sends the
    # member NAMES ("USER"/"ADMIN"), which are invalid on a migrated database.
    role = Column(
        Enum(UserRole, values_callable=lambda e: [m.value for m in e]),
        default=UserRole.USER,
        nullable=False,
    )
    stripe_customer_id = Column(String(255), nullable=True)
    # True once the user has confirmed ownership of their email address.
    email_verified = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)

    def __repr__(self):
        return f"<User(id={self.id}, email={self.email}, role={self.role})>"
