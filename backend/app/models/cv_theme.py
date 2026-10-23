"""
CVTheme model — registre serveur des presets de Thème CV (M1-T04).

Presets SYSTÈME immuables : la table est gérée par migrations (seed), jamais
écrite par le code applicatif. Les documents n'y font JAMAIS référence : le
thème d'un document est SNAPSHOTÉ dans son enveloppe (contrat `CVTheme`,
ADR-THEME-DECOUPLED) — seul `cv_templates.default_theme_id` pointe ici (le
thème appliqué par défaut quand l'utilisateur n'en choisit pas).
"""

from sqlalchemy import Boolean, CheckConstraint, Column, String, false
from sqlalchemy.dialects.postgresql import JSONB

from app.database import Base


class CVTheme(Base):
    """
    Preset de Thème CV (contrat `CVTheme` / `GET /cv/themes`).

    Attributes:
        id: Identifiant stable du preset (contrat : maxLength 64)
        name: Nom affiché (contrat : maxLength 60)
        tokens: Jetons de style `CVThemeTokens` (6 clés strictes — la
            validation de forme vit au contrat ; la base stocke le snapshot)
        is_free: Utilisable sans Pass actif (seul `anthracite` en V2)
    """

    __tablename__ = "cv_themes"
    __table_args__ = (
        # Même garde que la migration d9e0f1a2b3c4 : `tokens` doit être un
        # objet JSON (M1-T05 le copiera tel quel dans les snapshots).
        CheckConstraint(
            "jsonb_typeof(tokens) = 'object'", name="ck_cv_themes_tokens_object"
        ),
    )

    id = Column(String(64), primary_key=True)
    name = Column(String(60), nullable=False)
    tokens = Column(JSONB, nullable=False)
    is_free = Column(Boolean, nullable=False, server_default=false(), default=False)

    def __repr__(self):
        return f"<CVTheme(id={self.id}, is_free={self.is_free})>"
