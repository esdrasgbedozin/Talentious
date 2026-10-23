"""
CVTemplate model — registre serveur des templates de CV (M1-T03, archi V2 §4).

Miroir base du registre de rendu (`packages/cv-render`, ADR-TEMPLATE-REGISTRY) :
`id` est la valeur stable de `template_id` sur les documents, et la FK posée
sur `generated_cvs.template_id` garantit PAR LA BASE qu'aucun document ne porte
un template hors registre. Lignes seedées par migration, immuables en pratique
(ajouter un template = une migration de seed + une entrée au registre front).
`is_free` : un seul template gratuit est prévu (« Moderne sobre », Bible V2).
"""

import enum

from sqlalchemy import Boolean, Column, Enum, String, Text, false

from app.database import Base


class TemplateSector(str, enum.Enum):
    """Secteur / persona d'un template (enum du contrat `TemplateSector`)."""

    MODERN = "modern"
    CORPORATE = "corporate"
    TECH = "tech"
    ACADEMIC = "academic"
    CREATIVE = "creative"


class CVTemplate(Base):
    """Un template du catalogue (`GET /cv/templates`, M1-T10 — data-driven)."""

    __tablename__ = "cv_templates"

    id = Column(String(100), primary_key=True)
    name = Column(String(255), nullable=False)
    sector = Column(
        Enum(
            TemplateSector,
            name="templatesector",  # explicite : doit matcher la migration
            values_callable=lambda e: [m.value for m in e],
        ),
        nullable=False,
    )
    is_free = Column(Boolean, nullable=False, server_default=false(), default=False)
    description = Column(Text, nullable=False)
    preview_url = Column(String(500), nullable=False)
    # Preset de thème appliqué par défaut (`CVTheme.id`). Simple chaîne ici :
    # la table `cv_themes` arrive en M1-T04 (ordre FK de l'archi §4), qui
    # pourra poser la FK.
    default_theme_id = Column(String(100), nullable=True)

    def __repr__(self) -> str:
        return f"<CVTemplate(id={self.id}, is_free={self.is_free})>"
