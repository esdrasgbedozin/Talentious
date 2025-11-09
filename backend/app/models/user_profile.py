"""
UserProfile model for storing user career profile data.
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.database import Base


class UserProfile(Base):
    """
    UserProfile model for storing career-related profile information.
    
    The profile_data field stores structured JSON with:
    - personal_info: Personal details (name, phone, linkedin, address)
    - summary: Professional summary
    - experiences: List of work experiences
    - educations: List of education entries
    - skills: List of skills
    - projects: List of projects
    - certifications: List of certifications
    
    Attributes:
        user_id: Foreign key to users table (Primary Key)
        profile_data: JSONB field containing all profile information
        updated_at: Last update timestamp
    """
    __tablename__ = "user_profiles"
    
    user_id = Column(
        UUID(as_uuid=True), 
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True
    )
    profile_data = Column(JSONB, nullable=False, default=dict)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationship
    user = relationship("User", backref="profile", uselist=False)
    
    def __repr__(self):
        return f"<UserProfile(user_id={self.user_id}, updated_at={self.updated_at})>"
