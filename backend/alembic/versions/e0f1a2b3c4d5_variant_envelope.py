"""generated_cvs devient la Variante : enveloppe + backfill par défauts (M1-T05)

Ajoute l'enveloppe du document (archi V2 §4) : `theme_json` (SNAPSHOT du thème,
fait foi au rendu), `theme_preset_id` (provenance, FK cv_themes RESTRICT),
`language` (ENUM fr/en), `offer_id` (FK job_offers SET NULL),
`created_under_pass`, `gcs_docx_url`, `parent_variant_id` (self-FK SET NULL,
lignée des duplications).

BACKFILL PAR SERVER_DEFAULT, AUCUN UPDATE : en Postgres ≥ 11, ADD COLUMN
NOT NULL DEFAULT est metadata-only — le stock reçoit fr / anthracite / false
sans réécrire une ligne. `cv_data_json` est donc intact PAR CONSTRUCTION
(critère du ticket : checksum identique avant/après — testé ligne à ligne).
Les server_default restent en place après la migration : rétro-compat rollout
(le code N-1 insère sans ces champs pendant le déploiement).

FKs posées en NOT VALID → VALIDATE. HONNÊTETÉ (revue data M1-T05) : env.py ne
passe pas `transaction_per_migration`, tout l'upgrade tourne dans UNE
transaction — le premier ADD COLUMN prend un ACCESS EXCLUSIVE conservé
jusqu'au commit, le pattern n'évite donc AUCUN verrou ici. Il est gardé par
cohérence doctrinale (T03) et deviendrait effectif si l'env passait un jour
en transaction-par-migration. La vraie protection est le lock_timeout en tête
d'upgrade : si un écrivain tient la table, la migration échoue vite au lieu
de mettre toute la prod en file d'attente derrière son ALTER.

Downgrade : retire FKs, index, colonnes et le type ENUM documentlanguage.
SANS PERTE pour le stock V1 (les colonnes n'existaient pas) ; les valeurs
d'enveloppe posées APRÈS la migration (offer_id, parents, thèmes custom)
seraient perdues — perte assumée et documentée, le contenu canonique
(`cv_data_json`) n'est jamais touché.

Revision ID: e0f1a2b3c4d5
Revises: d9e0f1a2b3c4
Create Date: 2026-10-23
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e0f1a2b3c4d5"
down_revision: Union[str, None] = "d9e0f1a2b3c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Même snapshot que le seed cv_themes (d9e0f1a2b3c4) ; alignement avec
# theme.ts prouvé par test (toute dérive casse la suite).
_ANTHRACITE_SNAPSHOT = (
    '{"color_accent": "#2D3748", "color_text": "#1A202C", '
    '"color_muted": "#4A5568", "color_background": "#FFFFFF", '
    '"font_heading": "Inter", "font_body": "Inter"}'
)

_LANGUAGES = ("fr", "en")


def upgrade() -> None:
    # Fail-fast plutôt que file d'attente : si une transaction tient
    # generated_cvs, l'ALTER échoue en 5 s (le job migrate bloque le deploy,
    # on relance) au lieu de bloquer tous les écrivains derrière son verrou.
    # SET LOCAL : porté par la transaction de la migration uniquement.
    op.execute(sa.text("SET LOCAL lock_timeout = '5s'"))
    op.add_column(
        "generated_cvs",
        sa.Column(
            "theme_json",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text(f"'{_ANTHRACITE_SNAPSHOT}'::jsonb"),
        ),
    )
    op.add_column(
        "generated_cvs",
        sa.Column(
            "theme_preset_id",
            sa.String(length=64),
            nullable=True,
            server_default="anthracite",
        ),
    )
    # Contrairement à create_table, add_column ne crée PAS le type ENUM :
    # création explicite d'abord.
    postgresql.ENUM(*_LANGUAGES, name="documentlanguage").create(
        op.get_bind(), checkfirst=True
    )
    op.add_column(
        "generated_cvs",
        sa.Column(
            "language",
            postgresql.ENUM(*_LANGUAGES, name="documentlanguage", create_type=False),
            nullable=False,
            server_default="fr",
        ),
    )
    op.add_column(
        "generated_cvs",
        sa.Column("offer_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "generated_cvs",
        sa.Column(
            "created_under_pass",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "generated_cvs",
        sa.Column("gcs_docx_url", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "generated_cvs",
        sa.Column("parent_variant_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    # Gardes CHECK (revue data M1-T05) : l'auto-parenté (cycle de longueur 1)
    # ferait boucler tout parcours de lignée — les cycles ≥ 2 relèvent du
    # service (M1-T13 : le parent existe avant l'enfant, lignée écrite à la
    # création seulement) ; theme_json doit être un objet (il sera copié dans
    # les duplications/exports).
    op.create_check_constraint(
        "ck_generated_cvs_no_self_parent",
        "generated_cvs",
        "parent_variant_id IS NULL OR parent_variant_id <> id",
    )
    op.create_check_constraint(
        "ck_generated_cvs_theme_json_object",
        "generated_cvs",
        "jsonb_typeof(theme_json) = 'object'",
    )
    # Index AVANT les FK SET NULL : sans eux, chaque DELETE d'offre ou de CV
    # parent scannerait generated_cvs.
    op.create_index("ix_generated_cvs_offer_id", "generated_cvs", ["offer_id"])
    op.create_index(
        "ix_generated_cvs_parent_variant_id", "generated_cvs", ["parent_variant_id"]
    )
    # FKs en NOT VALID → VALIDATE (écrivains concurrents possibles ; la
    # contrainte s'applique aux nouvelles écritures dès sa pose).
    for name, column, target, on_delete in (
        (
            "fk_generated_cvs_theme_preset_id",
            "theme_preset_id",
            "cv_themes",
            "RESTRICT",
        ),
        ("fk_generated_cvs_offer_id", "offer_id", "job_offers", "SET NULL"),
        (
            "fk_generated_cvs_parent_variant_id",
            "parent_variant_id",
            "generated_cvs",
            "SET NULL",
        ),
    ):
        op.execute(
            sa.text(
                f"ALTER TABLE generated_cvs ADD CONSTRAINT {name} "
                f"FOREIGN KEY ({column}) REFERENCES {target} (id) "
                f"ON DELETE {on_delete} NOT VALID"
            )
        )
        op.execute(sa.text(f"ALTER TABLE generated_cvs VALIDATE CONSTRAINT {name}"))


def downgrade() -> None:
    for name in (
        "fk_generated_cvs_parent_variant_id",
        "fk_generated_cvs_offer_id",
        "fk_generated_cvs_theme_preset_id",
    ):
        op.drop_constraint(name, "generated_cvs", type_="foreignkey")
    op.drop_constraint(
        "ck_generated_cvs_theme_json_object", "generated_cvs", type_="check"
    )
    op.drop_constraint(
        "ck_generated_cvs_no_self_parent", "generated_cvs", type_="check"
    )
    op.drop_index("ix_generated_cvs_parent_variant_id", table_name="generated_cvs")
    op.drop_index("ix_generated_cvs_offer_id", table_name="generated_cvs")
    for column in (
        "parent_variant_id",
        "gcs_docx_url",
        "created_under_pass",
        "offer_id",
        "language",
        "theme_preset_id",
        "theme_json",
    ):
        op.drop_column("generated_cvs", column)
    # L'ENUM créé par sa.Enum ne tombe pas avec la colonne (leçon M1-T01).
    postgresql.ENUM(name="documentlanguage").drop(op.get_bind(), checkfirst=True)
