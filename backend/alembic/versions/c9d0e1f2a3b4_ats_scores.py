"""ats_scores : cache du Score ATS par (Variante, Offre) (M5-T08)

Table du Score ATS déterministe (ADR-ATS-DETERMINISTIC). Additive et réversible
(nouvelle table vide) : le cycle up/down/up de la CI l'atteste. L'unicité
`(cv_variant_id, offer_id)` est la clé du cache (un score par couple). Les deux
FK sont en CASCADE : un score ne survit ni à sa Variante ni à son Offre.

Revision ID: c9d0e1f2a3b4
Revises: a7b8c9d0e1f2
Create Date: 2026-11-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c9d0e1f2a3b4"
down_revision: Union[str, None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ats_scores",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "cv_variant_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("generated_cvs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "offer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("job_offers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("result_json", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "cv_variant_id", "offer_id", name="uq_ats_scores_variant_offer"
        ),
        sa.CheckConstraint("score >= 0 AND score <= 100", name="ck_ats_scores_range"),
    )
    # Pas d'index séparé sur cv_variant_id : l'index UNIQUE (cv_variant_id,
    # offer_id) a cv_variant_id en tête — il sert les recherches et le CASCADE.
    # offer_id reçoit son propre index pour le CASCADE côté Offre.
    op.create_index("ix_ats_scores_offer_id", "ats_scores", ["offer_id"])


def downgrade() -> None:
    op.drop_index("ix_ats_scores_offer_id", table_name="ats_scores")
    op.drop_table("ats_scores")
