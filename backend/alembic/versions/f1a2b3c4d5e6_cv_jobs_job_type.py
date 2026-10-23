"""cv_jobs.job_type + unicité d'un job actif par (user, job_type) (M1-T06)

Les jobs se généralisent (ADR-JOBS, contrat `JobType` : cv_generation,
letter_generation, export, review) : ajout de `job_type` et remplacement de
l'index partiel « un job actif par user » (c2a3b4d5e6f7) par « un job actif
par (user, job_type) » — sinon un export en cours interdirait de lancer une
lettre.

BACKFILL PAR SERVER_DEFAULT, AUCUN UPDATE (doctrine T05, Postgres ≥ 11 :
ADD COLUMN NOT NULL DEFAULT constant = metadata-only). Sémantiquement exact :
tout le stock V1 est de la génération de CV (`cv_generation` était le seul
traitement existant). Le server_default reste en place pour la rétro-compat
rollout (le code N-1 insère sans `job_type` pendant le déploiement) ; retrait
prévu au ticket de contraction post-M1-T13.

Remplacement d'index : DROP puis CREATE dans la même transaction — la fenêtre
sans garde d'unicité n'existe pas pour les autres sessions (DDL transactionnel
Postgres). `SET LOCAL lock_timeout = '5s'` en tête : fail-fast si un écrivain
tient la table, plutôt que mettre la prod en file d'attente.

Downgrade : restaure l'ancien index « un actif par user » AVANT de retirer la
colonne — ⚠️ il ÉCHOUE (unicité violée) si un utilisateur a alors plusieurs
jobs actifs de types différents ; il faut d'abord résoudre ces jobs
(terminés/échoués) — échec assumé et documenté, aucun risque de perte
silencieuse. La valeur `job_type` des jobs non-cv_generation créés après la
migration est perdue au downgrade (colonne supprimée) — assumé.

Revision ID: f1a2b3c4d5e6
Revises: e0f1a2b3c4d5
Create Date: 2026-10-23
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "e0f1a2b3c4d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_JOB_TYPES = ("cv_generation", "letter_generation", "export", "review")

_ACTIVE = sa.text("status IN ('queued', 'running')")


def upgrade() -> None:
    # Fail-fast plutôt que file d'attente (même doctrine que e0f1a2b3c4d5).
    op.execute(sa.text("SET LOCAL lock_timeout = '5s'"))
    # Contrairement à create_table, add_column ne crée PAS le type ENUM :
    # création explicite d'abord (leçon T05).
    postgresql.ENUM(*_JOB_TYPES, name="jobtype").create(op.get_bind(), checkfirst=True)
    op.add_column(
        "cv_jobs",
        sa.Column(
            "job_type",
            postgresql.ENUM(*_JOB_TYPES, name="jobtype", create_type=False),
            nullable=False,
            server_default="cv_generation",
        ),
    )
    op.drop_index("uq_cv_jobs_one_active_per_user", table_name="cv_jobs")
    op.create_index(
        "uq_cv_jobs_one_active_per_user_type",
        "cv_jobs",
        ["user_id", "job_type"],
        unique=True,
        postgresql_where=_ACTIVE,
    )


def downgrade() -> None:
    # Fail-fast aussi au downgrade : c'est le geste d'incident, pas le moment
    # de mettre la prod en file d'attente derrière un ALTER.
    op.execute(sa.text("SET LOCAL lock_timeout = '5s'"))
    op.drop_index("uq_cv_jobs_one_active_per_user_type", table_name="cv_jobs")
    # Échoue si un user a plusieurs jobs actifs de types différents (voir
    # docstring) : c'est voulu — on ne supprime pas silencieusement des jobs.
    op.create_index(
        "uq_cv_jobs_one_active_per_user",
        "cv_jobs",
        ["user_id"],
        unique=True,
        postgresql_where=_ACTIVE,
    )
    op.drop_column("cv_jobs", "job_type")
    # L'ENUM créé ne tombe pas avec la colonne (leçon M1-T01).
    postgresql.ENUM(name="jobtype").drop(op.get_bind(), checkfirst=True)
