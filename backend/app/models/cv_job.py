"""
CVJob model — tracks asynchronous CV generation jobs.

The CV generation pipeline (Analyzer -> Writer -> Vertex AI) takes minutes, which
is incompatible with a synchronous HTTP request under Cloud Run's timeout. The
request now creates a CVJob (status=queued) and returns 202; a background worker
runs the pipeline and updates the job status. Clients poll GET /cv/jobs/{id}.
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


def _utcnow() -> datetime:
    """Timezone-aware UTC now (stored in TIMESTAMP WITH TIME ZONE columns)."""
    return datetime.now(timezone.utc)


class JobStatus(str, enum.Enum):
    """Lifecycle of a CV generation job: queued -> running -> succeeded | failed."""

    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class JobType(str, enum.Enum):
    """Nature du traitement asynchrone — enum du contrat `JobType` (M1-T06,
    ADR-JOBS). L'unicité d'un job actif s'applique PAR couple (user, type)."""

    CV_GENERATION = "cv_generation"
    LETTER_GENERATION = "letter_generation"
    EXPORT = "export"
    REVIEW = "review"


class CVJob(Base):
    """A single asynchronous job (generation, letter, export, review) for a user."""

    __tablename__ = "cv_jobs"

    # At most one active (queued/running) job per (user, job_type) — the real
    # guard against a race between two concurrent launches of the same type
    # (the route pre-check is only a fast path). Partial unique index; an
    # export in progress must not block a letter (contract `JobType`).
    __table_args__ = (
        Index(
            "uq_cv_jobs_one_active_per_user_type",
            "user_id",
            "job_type",
            unique=True,
            postgresql_where=text("status IN ('queued', 'running')"),
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status = Column(
        Enum(JobStatus, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=JobStatus.QUEUED,
        index=True,
    )
    # server_default : rétro-compat rollout (le code N-1 insère sans job_type
    # pendant le déploiement) + backfill du stock V1, qui n'est QUE de la
    # génération de CV. Même doctrine que l'enveloppe T05.
    job_type = Column(
        Enum(
            JobType,
            name="jobtype",  # explicite : doit matcher la migration
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        server_default=JobType.CV_GENERATION.value,
        default=JobType.CV_GENERATION,
    )
    progress_pct = Column(Integer, nullable=True)
    cv_id = Column(
        UUID(as_uuid=True),
        ForeignKey("generated_cvs.id", ondelete="SET NULL"),
        nullable=True,
    )
    error_message = Column(Text, nullable=True)
    cv_name = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    user = relationship("User", backref="cv_jobs")

    def __repr__(self) -> str:
        return f"<CVJob(id={self.id}, status={self.status}, user_id={self.user_id})>"

    @property
    def is_active(self) -> bool:
        """A job still occupying its user's active slot for its job_type."""
        return self.status in (JobStatus.QUEUED, JobStatus.RUNNING)
