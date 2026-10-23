"""
M1-T16 (DET-M0-C8b) — Les garde-fous produit deviennent des contraintes de
CONTRAT : les caps de longueur appliqués par la coercition backend
(`cv_content_coercion.CAPS`) sont portés en `maxLength` sur les sous-schémas
`Selected*` (+ `HighlightedSkill`, `summary`) et en `maxItems` sur les listes
(`MAX_LIST_ITEMS`).

Critère du ticket : un payload dépassant un `maxLength` est rejeté 422 AU
CONTRAT (la coercition tronque en amont sur les chemins coercés — ici c'est
le SCHÉMA lui-même qui refuse, pour tout consommateur futur du modèle généré,
export-service compris).

Anti-dérive : chaque contrainte du modèle GÉNÉRÉ est comparée à la valeur
CAPS — si l'un bouge sans l'autre, ce test casse.
"""

import pytest
from pydantic import ValidationError

from app.generated.models import (
    GeneratedCVData,
    HighlightedSkill,
    SelectedCertification,
    SelectedEducation,
    SelectedExperience,
    SelectedProject,
)
from app.services.cv_content_coercion import CAPS, MAX_LIST_ITEMS

# (modèle généré, champ du contrat) → clé CAPS de la coercition.
_CAPPED_FIELDS = {
    (GeneratedCVData, "summary"): "summary",
    (SelectedExperience, "id"): "id",
    (SelectedExperience, "title"): "title",
    (SelectedExperience, "company"): "company",
    (SelectedExperience, "location"): "location",
    (SelectedExperience, "description"): "exp_description",
    (HighlightedSkill, "name"): "skill",
    (HighlightedSkill, "level"): "level",
    (SelectedEducation, "id"): "id",
    (SelectedEducation, "degree"): "degree",
    (SelectedEducation, "institution"): "institution",
    (SelectedEducation, "description"): "edu_description",
    (SelectedProject, "id"): "id",
    (SelectedProject, "name"): "proj_name",
    (SelectedProject, "description"): "proj_description",
    (SelectedProject, "url"): "url",
    (SelectedCertification, "id"): "id",
    (SelectedCertification, "name"): "cert_name",
    (SelectedCertification, "issuer"): "issuer",
    (SelectedCertification, "url"): "url",
}

_CAPPED_LISTS = [
    (GeneratedCVData, "selected_experiences"),
    (GeneratedCVData, "highlighted_skills"),
    (GeneratedCVData, "selected_educations"),
    (GeneratedCVData, "selected_projects"),
    (GeneratedCVData, "selected_certifications"),
    (SelectedExperience, "highlighted_skills"),
    (SelectedProject, "relevant_skills"),
]


def _constraint(model, field_name: str, attr: str):
    field = model.model_fields[field_name]
    for meta in field.metadata:
        value = getattr(meta, attr, None)
        if value is not None:
            return value
    return None


class TestAlignementCapsContrat:
    @pytest.mark.parametrize(
        ("model", "field_name", "cap_key"),
        [(m, f, k) for (m, f), k in _CAPPED_FIELDS.items()],
        ids=[f"{m.__name__}.{f}" for (m, f) in _CAPPED_FIELDS],
    )
    def test_max_length_aligne_sur_la_coercition(self, model, field_name, cap_key):
        assert _constraint(model, field_name, "max_length") == CAPS[cap_key], (
            f"{model.__name__}.{field_name} : maxLength du contrat désaligné "
            f"de CAPS[{cap_key!r}] — porter la valeur des DEUX côtés"
        )

    @pytest.mark.parametrize(
        ("model", "field_name"),
        _CAPPED_LISTS,
        ids=[f"{m.__name__}.{f}" for (m, f) in _CAPPED_LISTS],
    )
    def test_max_items_aligne_sur_la_coercition(self, model, field_name):
        assert _constraint(model, field_name, "max_length") == MAX_LIST_ITEMS, (
            f"{model.__name__}.{field_name} : maxItems du contrat désaligné "
            f"de MAX_LIST_ITEMS"
        )


class TestRejetAuContrat:
    def test_un_depassement_est_rejete_422_au_schema(self):
        """CRITÈRE : le SCHÉMA refuse (pas seulement la coercition qui
        tronque) — un summary au-delà du cap lève ValidationError."""
        base = {
            "personal_info": {
                "first_name": "Sam",
                "last_name": "Leroy",
                "email": "sam@example.com",
            },
            "summary": "x" * (CAPS["summary"] + 1),
            "selected_experiences": [],
            "highlighted_skills": [],
            "selected_educations": [],
        }
        with pytest.raises(ValidationError, match="summary"):
            GeneratedCVData.model_validate(base)
        base["summary"] = "x" * CAPS["summary"]
        GeneratedCVData.model_validate(base)  # à la borne : accepté

    def test_une_liste_hors_gabarit_est_rejetee(self):
        skills = [
            {"name": f"s{i}", "category": "hard_skill", "importance": "Critical"}
            for i in range(MAX_LIST_ITEMS + 1)
        ]
        base = {
            "personal_info": {
                "first_name": "Sam",
                "last_name": "Leroy",
                "email": "sam@example.com",
            },
            "summary": "ok",
            "selected_experiences": [],
            "highlighted_skills": skills,
            "selected_educations": [],
        }
        with pytest.raises(ValidationError, match="highlighted_skills"):
            GeneratedCVData.model_validate(base)
