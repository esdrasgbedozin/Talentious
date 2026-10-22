"""
JobOffer model — offre d'emploi collée par l'utilisateur, avec cache d'analyse.

L'analyse d'une offre (agent analyseur) coûte un appel LLM : le texte est
haché (`text_hash` = sha256 hex) et le résultat mis en cache dans
`analysis_json`. Re-coller la même annonce ne refacture jamais l'appel —
levier FinOps de l'archi V2 (§4). Le cache est PAR utilisateur (unicité
`(user_id, text_hash)`), pas global : les offres collées sont des données
personnelles (RGPD), la suppression du compte les emporte (CASCADE).
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import backref, relationship

from app.database import Base


def _utcnow() -> datetime:
    """Timezone-aware UTC now (stored in TIMESTAMP WITH TIME ZONE columns)."""
    return datetime.now(timezone.utc)


class JobOffer(Base):
    """Une offre d'emploi d'un utilisateur, et le cache de son analyse."""

    __tablename__ = "job_offers"
    # Pas d'index séparé sur user_id : l'index UNIQUE (user_id, text_hash) a
    # user_id en colonne de tête — il sert les recherches et le CASCADE.
    __table_args__ = (
        UniqueConstraint("user_id", "text_hash", name="uq_job_offers_user_text_hash"),
        CheckConstraint("length(text_hash) = 64", name="ck_job_offers_text_hash_len"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    raw_text = Column(Text, nullable=False)
    # sha256 hex du texte normalisé — la clé du cache.
    text_hash = Column(String(64), nullable=False)
    # Rempli APRÈS l'appel agent (NULL tant que l'analyse n'a pas eu lieu).
    analysis_json = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    # passive_deletes : c'est le CASCADE de la BASE qui emporte les offres à la
    # suppression du compte — l'ORM ne doit pas tenter un UPDATE … SET NULL.
    user = relationship("User", backref=backref("job_offers", passive_deletes=True))

    def __repr__(self) -> str:
        return f"<JobOffer(id={self.id}, user_id={self.user_id})>"
