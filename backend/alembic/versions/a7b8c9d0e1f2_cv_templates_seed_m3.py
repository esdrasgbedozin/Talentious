"""cv_templates : seed d'activation des 3 templates M3 — corporate_sobre, tech, creatif (M3-T07)

Active au catalogue data-driven les templates livrés en M3 (structure + finitions
déjà fusionnées). Après cet upgrade, `GET /cv/templates` renvoie 4 entrées, et
seul `modern_sobre` reste gratuit — les 3 nouveaux sont PREMIUM (`is_free=false`).

Point de départ de thème : `anthracite` (seul preset système, AA-conforme,
seedé en M1-T04) — la FK `fk_cv_templates_default_theme_id` l'exige. Les ids de
template sont les MÊMES alias que le registre de rendu front (ADR-TEMPLATE-REGISTRY)
et les `template_id` d'enveloppe du contrat.

Insertion de DONNÉES pure — aucun changement de schéma, aucune incidence sur les
documents existants (le rendu d'un CV ne dépend que de son propre `template_id`).

Upgrade : INSERT des 3 templates premium.
Downgrade : DELETE de ces 3 ids (`modern_sobre` et tout le reste intacts) —
symétrique. Un template référencé par un `generated_cvs.template_id` ne peut être
supprimé (FK RESTRICT) : le downgrade n'est donc sûr que si aucune Variante ne
pointe encore ces templates premium (cohérent avec un rollback d'activation).

Revision ID: a7b8c9d0e1f2
Revises: f1a2b3c4d5e6
Create Date: 2026-11-03
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ids alignés sur le registre de rendu front (ADR-TEMPLATE-REGISTRY) ; tous
# premium ; thème de départ = anthracite (défaut AA-conforme).
_SEED_IDS = ("corporate_sobre", "tech", "creatif")


def upgrade() -> None:
    # Valeurs littérales (une migration est un instantané figé, elle n'importe
    # pas le code applicatif) — même style que le seed `modern_sobre` (M1-T03).
    op.execute(
        sa.text(
            "INSERT INTO cv_templates "
            "(id, name, sector, is_free, description, preview_url, default_theme_id) "
            "VALUES "
            "('corporate_sobre', 'Corporate sobre', 'corporate', false, "
            "'Registre exécutif et rassurant : en-tête centré, titres en petites capitales.', "
            "'https://talentious.app/templates/corporate_sobre.png', 'anthracite'), "
            "('tech', 'Tech', 'tech', false, "
            "'Orienté stack : compétences mises en avant, tags à bordure.', "
            "'https://talentious.app/templates/tech.png', 'anthracite'), "
            "('creatif', 'Créatif', 'creative', false, "
            "'Éditorial et expressif : en-tête bichrome, pilules de compétences.', "
            "'https://talentious.app/templates/creatif.png', 'anthracite')"
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "DELETE FROM cv_templates "
            "WHERE id IN ('corporate_sobre', 'tech', 'creatif')"
        )
    )
