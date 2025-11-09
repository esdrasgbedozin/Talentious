"""
GeneratedCV model for storing AI-generated CVs.
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.database import Base


class GeneratedCV(Base):
    """
    GeneratedCV model for tracking user-generated CVs.
    
    Attributes:
        id: Unique identifier (UUID)
        user_id: Foreign key to users table
        cv_name: User-defined name for the CV
        template_id: ID of the template used
        job_offer_context: Job offer description/context used for generation
        cv_data_json: JSONB containing the structured CV data
        gcs_pdf_url: Google Cloud Storage URL of the generated PDF
        created_at: Creation timestamp
        updated_at: Last update timestamp
    """
    __tablename__ = "generated_cvs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    cv_name = Column(String(255), nullable=False)
    template_id = Column(String(100), nullable=False)
    job_offer_context = Column(Text, nullable=True)
    cv_data_json = Column(JSONB, nullable=False)
    gcs_pdf_url = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationship
    user = relationship("User", backref="generated_cvs")
    
    def __repr__(self):
        return f"<GeneratedCV(id={self.id}, cv_name={self.cv_name}, user_id={self.user_id})>"
