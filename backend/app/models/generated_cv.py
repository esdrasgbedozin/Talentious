"""
GeneratedCV model for storing AI-generated CVs.
"""

import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    String,
    Text,
    false,
    text,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.database import Base


def _utcnow() -> datetime:
    """Timezone-aware UTC now."""
    return datetime.now(timezone.utc)


class DocumentLanguage(str, enum.Enum):
    """Langue d'un document — CV ou lettre (enum du contrat
    `DocumentLanguage`) ; distincte de la langue de l'interface."""

    FR = "fr"
    EN = "en"


# Snapshot anthracite posé en server_default (M1-T05) : même valeur que le
# seed de cv_themes (migration d9e0f1a2b3c4) — l'alignement avec theme.ts est
# prouvé par test (tests/test_cv_themes.py + test_generated_cvs_envelope.py).
_ANTHRACITE_SNAPSHOT_SQL = text(
    "'{"
    '"color_accent": "#2D3748", "color_text": "#1A202C", '
    '"color_muted": "#4A5568", "color_background": "#FFFFFF", '
    '"font_heading": "Inter", "font_body": "Inter"'
    "}'::jsonb"
)


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
    __table_args__ = (
        # Mêmes gardes que la migration e0f1a2b3c4d5 (parité metadata) :
        # pas d'auto-parenté (cycle de lignée), theme_json = objet JSON.
        CheckConstraint(
            "parent_variant_id IS NULL OR parent_variant_id <> id",
            name="ck_generated_cvs_no_self_parent",
        ),
        CheckConstraint(
            "jsonb_typeof(theme_json) = 'object'",
            name="ck_generated_cvs_theme_json_object",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    cv_name = Column(String(255), nullable=False)
    # FK depuis M1-T03 : la validité du stamp est garantie par la BASE (les
    # valeurs V1 ont été backfillées vers modern_sobre dans la migration).
    template_id = Column(
        String(100),
        ForeignKey("cv_templates.id", ondelete="RESTRICT"),
        nullable=False,
    )
    job_offer_context = Column(Text, nullable=True)
    cv_data_json = Column(JSONB, nullable=False)
    gcs_pdf_url = Column(String(500), nullable=True)
    # --- Enveloppe de la Variante (M1-T05, archi V2 §4). Le CONTENU
    # (`cv_data_json`) reste pur ; la forme vit dans ces colonnes sœurs. Les
    # server_default assurent la rétro-compat rollout : le code N-1 insère
    # sans ces champs, la base pose fr / anthracite / false.
    # `theme_json` fait FOI au rendu (snapshot, jamais résolu par référence —
    # ADR-THEME-DECOUPLED) ; `theme_preset_id` n'est que la PROVENANCE
    # (FK d'intégrité RESTRICT, NULL = thème personnalisé premium).
    theme_json = Column(JSONB, nullable=False, server_default=_ANTHRACITE_SNAPSHOT_SQL)
    theme_preset_id = Column(
        String(64),
        ForeignKey("cv_themes.id", ondelete="RESTRICT"),
        nullable=True,
        server_default="anthracite",
    )
    language = Column(
        Enum(
            DocumentLanguage,
            name="documentlanguage",  # explicite : doit matcher la migration
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
        server_default=DocumentLanguage.FR.value,
    )
    # SET NULL : un document ne meurt jamais par ricochet (offre supprimée,
    # parent de lignée supprimé). Indexés : le SET NULL scanne sinon.
    offer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("job_offers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_under_pass = Column(
        Boolean, nullable=False, server_default=false(), default=False
    )
    gcs_docx_url = Column(String(500), nullable=True)
    parent_variant_id = Column(
        UUID(as_uuid=True),
        ForeignKey("generated_cvs.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at = Column(
        DateTime(timezone=True), default=_utcnow, nullable=False, index=True
    )
    updated_at = Column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )

    # Relationship
    user = relationship("User", backref="generated_cvs")

    def __repr__(self):
        return f"<GeneratedCV(id={self.id}, cv_name={self.cv_name}, user_id={self.user_id})>"
