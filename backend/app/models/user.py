"""
User model for authentication and authorization.
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Enum
from sqlalchemy.dialects.postgresql import UUID
import enum

from app.database import Base


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
    role = Column(Enum(UserRole), default=UserRole.USER, nullable=False)
    stripe_customer_id = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    def __repr__(self):
        return f"<User(id={self.id}, email={self.email}, role={self.role})>"
