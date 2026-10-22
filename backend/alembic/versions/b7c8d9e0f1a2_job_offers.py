"""job_offers : offres collées + cache d'analyse par hash de texte (M1-T02)

Première migration du modèle V2 (archi §4, ordre FK : job_offers d'abord).
Additive et réversible — le cycle up/down/up de la CI (M1-T01) l'atteste.
L'unicité (user_id, text_hash) est LA clé du cache FinOps : une même annonce
re-collée par le même utilisateur ne refacture jamais l'appel d'analyse.

Revision ID: b7c8d9e0f1a2
Revises: a6e7f8a9b0c1
Create Date: 2026-10-23
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b7c8d9e0f1a2"
down_revision: Union[str, None] = "a6e7f8a9b0c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "job_offers",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("raw_text", sa.Text(), nullable=False),
        sa.Column("text_hash", sa.String(length=64), nullable=False),
        sa.Column("analysis_json", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "user_id", "text_hash", name="uq_job_offers_user_text_hash"
        ),
        sa.CheckConstraint(
            "length(text_hash) = 64", name="ck_job_offers_text_hash_len"
        ),
    )
    # Pas d'index séparé sur user_id : l'index UNIQUE (user_id, text_hash) a
    # user_id en colonne de tête — il sert les recherches et le CASCADE.


def downgrade() -> None:
    op.drop_table("job_offers")
