"""cv_templates : registre serveur + seed modern_sobre + backfill AVANT la FK (M1-T03)

Ordre critique de l'upgrade (archi V2 §4) :
1. créer `cv_templates` et seeder `modern_sobre` (le template gratuit) ;
2. BACKFILLER `generated_cvs.template_id` : toute valeur hors registre
   (`modern_v1`, défaut historique du cv_worker V1, ou valeur farfelue) devient
   `modern_sobre` — c'est le MÊME alias que le registre de rendu front
   (ADR-TEMPLATE-REGISTRY), le rendu des documents ne change pas ;
3. poser la FK — valide par construction, aucune ligne orpheline possible.

Downgrade : retire FK, table et type ENUM. Les stamps backfillés restent
`modern_sobre` (non-restauration ASSUMÉE : c'est une valeur V1 valide, résolue
à l'identique par le registre front — redescendre ne casse rien).

Revision ID: c8d9e0f1a2b3
Revises: b7c8d9e0f1a2
Create Date: 2026-10-23
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c8d9e0f1a2b3"
down_revision: Union[str, None] = "b7c8d9e0f1a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_SECTORS = ("modern", "corporate", "tech", "academic", "creative")


def upgrade() -> None:
    op.create_table(
        "cv_templates",
        sa.Column("id", sa.String(length=100), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("sector", sa.Enum(*_SECTORS, name="templatesector"), nullable=False),
        sa.Column("is_free", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("preview_url", sa.String(length=500), nullable=False),
        sa.Column("default_theme_id", sa.String(length=100), nullable=True),
    )
    op.execute(
        sa.text(
            "INSERT INTO cv_templates "
            "(id, name, sector, is_free, description, preview_url, default_theme_id) "
            "VALUES ('modern_sobre', 'Moderne sobre', 'modern', true, "
            "'Mise en page sobre et neutre, adaptée à tous les secteurs.', "
            "'https://talentious.app/templates/modern_sobre.png', 'anthracite')"
        )
    )
    # Pattern NOT VALID → backfill → VALIDATE (revue data M1-T03) :
    # 1. la contrainte posée NOT VALID s'applique IMMÉDIATEMENT aux nouvelles
    #    écritures (ferme la fenêtre de course backfill/INSERT concurrent)
    #    sans scanner l'existant ;
    # 2. le backfill assainit le stock sous verrous de ligne seulement ;
    # 3. VALIDATE ne prend qu'un SHARE UPDATE EXCLUSIVE (les écritures
    #    passent) — le pattern reste bon quand la table aura du volume.
    # RESTRICT explicite : un template référencé ne doit JAMAIS être supprimé.
    op.execute(
        sa.text(
            "ALTER TABLE generated_cvs ADD CONSTRAINT fk_generated_cvs_template_id "
            "FOREIGN KEY (template_id) REFERENCES cv_templates (id) "
            "ON DELETE RESTRICT NOT VALID"
        )
    )
    # Trace opérationnelle AVANT réécriture : quelles valeurs, combien de
    # lignes (le stamp d'origine n'est pas archivé — réversible en schéma,
    # pas en valeurs, cf. ADR-TEMPLATE-REGISTRY).
    rewritten = (
        op.get_bind()
        .execute(
            sa.text(
                "SELECT template_id, COUNT(*) FROM generated_cvs "
                "WHERE template_id NOT IN (SELECT id FROM cv_templates) "
                "GROUP BY template_id ORDER BY template_id"
            )
        )
        .fetchall()
    )
    for stamp, count in rewritten:
        print(
            f"[c8d9e0f1a2b3] backfill template_id « {stamp} » → modern_sobre : {count} ligne(s)"
        )
    op.execute(
        sa.text(
            "UPDATE generated_cvs SET template_id = 'modern_sobre' "
            "WHERE template_id NOT IN (SELECT id FROM cv_templates)"
        )
    )
    op.execute(
        sa.text(
            "ALTER TABLE generated_cvs VALIDATE CONSTRAINT fk_generated_cvs_template_id"
        )
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_generated_cvs_template_id", "generated_cvs", type_="foreignkey"
    )
    op.drop_table("cv_templates")
    # L'ENUM créé par sa.Enum ne tombe pas avec la table (leçon M1-T01).
    postgresql.ENUM(name="templatesector").drop(op.get_bind(), checkfirst=True)
