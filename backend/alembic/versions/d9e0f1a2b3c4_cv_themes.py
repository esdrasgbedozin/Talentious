"""cv_themes : presets système + seed anthracite + FK depuis cv_templates (M1-T04)

Ordre de l'upgrade :
1. créer `cv_themes` et seeder `anthracite` (le preset gratuit, D2 — tokens
   IDENTIQUES à `DEFAULT_CV_THEME_TOKENS` de packages/cv-render/src/theme.ts) ;
2. VÉRIFIER que tout `cv_templates.default_theme_id` non nul existe au
   registre (condition revue data M1-T03 : le seed T03 référence déjà
   `anthracite` sans FK). Une référence inconnue fait ÉCHOUER la migration —
   pas de backfill silencieux : `cv_templates` est géré par migrations, une
   valeur hors registre est un bug de seed à corriger, pas une donnée
   utilisateur à assainir (contraste assumé avec le backfill T03) ;
3. poser la FK `fk_cv_templates_default_theme_id` en ON DELETE RESTRICT.
   Pose DIRECTE (pas de NOT VALID→VALIDATE comme T03) : table de registre
   sans écrivain concurrent, quelques lignes — le scan de validation est
   instantané et aucune course n'existe.

Downgrade : retire FK puis table (aucun type ENUM ici). Sans perte : les
presets sont reseedés à l'identique par ce même upgrade.

Revision ID: d9e0f1a2b3c4
Revises: c8d9e0f1a2b3
Create Date: 2026-10-23
"""

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d9e0f1a2b3c4"
down_revision: Union[str, None] = "c8d9e0f1a2b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Mêmes valeurs que DEFAULT_CV_THEME_TOKENS (theme.ts) : dupliquées à dessein,
# une migration est un instantané figé. L'alignement est testé
# (test_cv_themes.py) — toute dérive d'une des deux sources casse la suite.
_ANTHRACITE_TOKENS = {
    "color_accent": "#2D3748",
    "color_text": "#1A202C",
    "color_muted": "#4A5568",
    "color_background": "#FFFFFF",
    "font_heading": "Inter",
    "font_body": "Inter",
}


def upgrade() -> None:
    op.create_table(
        "cv_themes",
        sa.Column("id", sa.String(length=64), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("tokens", postgresql.JSONB(), nullable=False),
        sa.Column("is_free", sa.Boolean(), nullable=False, server_default=sa.false()),
        # M1-T05 copiera `tokens` tel quel dans les snapshots des documents
        # (`generated_cvs.theme_json`) : un seed malformé se propagerait. On
        # garde le CHECK minimal (objet JSON) — la forme fine (6 clés) reste
        # tenue par le contrat, pour ne pas lier chaque évolution des tokens à
        # une migration de contrainte (revue data M1-T04).
        sa.CheckConstraint(
            "jsonb_typeof(tokens) = 'object'", name="ck_cv_themes_tokens_object"
        ),
    )
    op.get_bind().execute(
        sa.text(
            "INSERT INTO cv_themes (id, name, tokens, is_free) "
            "VALUES ('anthracite', 'Anthracite', :tokens, true)"
        ),
        {"tokens": json.dumps(_ANTHRACITE_TOKENS)},
    )
    # Garde-fou AVANT la FK : tout thème référencé doit exister. Échec
    # explicite (le message nomme les valeurs orphelines) plutôt que l'erreur
    # opaque du ADD CONSTRAINT.
    orphans = (
        op.get_bind()
        .execute(
            sa.text(
                "SELECT DISTINCT default_theme_id FROM cv_templates "
                "WHERE default_theme_id IS NOT NULL "
                "AND default_theme_id NOT IN (SELECT id FROM cv_themes) "
                "ORDER BY default_theme_id"
            )
        )
        .fetchall()
    )
    if orphans:
        names = ", ".join(repr(row[0]) for row in orphans)
        raise RuntimeError(
            f"[d9e0f1a2b3c4] cv_templates référence des thèmes hors registre : "
            f"{names} — corriger le seed des templates avant de poser la FK "
            "(pas de backfill : registre géré par migrations)."
        )
    op.create_foreign_key(
        "fk_cv_templates_default_theme_id",
        "cv_templates",
        "cv_themes",
        ["default_theme_id"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_cv_templates_default_theme_id", "cv_templates", type_="foreignkey"
    )
    op.drop_table("cv_themes")
