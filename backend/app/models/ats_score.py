"""AtsScore model (M5-T08) — Score ATS d'une Variante face à une Offre.

Cache déterministe du Score ATS : pour un couple `(cv_variant_id, offer_id)`, le
moteur (ADR-ATS-DETERMINISTIC) produit toujours la même valeur, donc on la
stocke (unicité `(cv_variant_id, offer_id)`) et on la recalcule par upsert quand
la Variante ou l'analyse d'offre change. `result_json` garde le DÉTAIL complet
(mots-clés présents/manquants) ; la troncature pour le palier gratuit (sans Pass)
se fait à la LECTURE (M5-T10), jamais en base. Les deux FK sont en CASCADE : un
score n'a pas de sens sans sa Variante ni son Offre.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import backref, relationship

from app.database import Base


def _utcnow() -> datetime:
    """Timezone-aware UTC now (stored in TIMESTAMP WITH TIME ZONE columns)."""
    return datetime.now(timezone.utc)


class AtsScore(Base):
    """Score ATS (0-100) d'une Variante de CV face à une Offre, avec son détail."""

    __tablename__ = "ats_scores"
    __table_args__ = (
        UniqueConstraint(
            "cv_variant_id", "offer_id", name="uq_ats_scores_variant_offer"
        ),
        CheckConstraint("score >= 0 AND score <= 100", name="ck_ats_scores_range"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cv_variant_id = Column(
        UUID(as_uuid=True),
        ForeignKey("generated_cvs.id", ondelete="CASCADE"),
        nullable=False,
    )
    offer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("job_offers.id", ondelete="CASCADE"),
        nullable=False,
    )
    score = Column(Integer, nullable=False)
    # Détail complet du calcul (matched/missing/missing_count). Tronqué à la
    # LECTURE selon le Pass (M5-T10), jamais ici.
    result_json = Column(JSONB, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    # passive_deletes : c'est le CASCADE de la BASE qui emporte les scores.
    variant = relationship(
        "GeneratedCV", backref=backref("ats_scores", passive_deletes=True)
    )
    offer = relationship(
        "JobOffer", backref=backref("ats_scores", passive_deletes=True)
    )

    def __repr__(self) -> str:
        return (
            f"<AtsScore(cv_variant_id={self.cv_variant_id}, "
            f"offer_id={self.offer_id}, score={self.score})>"
        )
