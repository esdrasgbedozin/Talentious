"""
Tests de la coercition du contenu CV (sortie du rédacteur-cv) — faille latente V1.

M0-T01 : les 3 fixtures de référence valident le schéma canonique GeneratedCVData.
M0-T02/T03 : `coerce_cv_content` est la ceinture de sécurité APRÈS le LLM : quelle que
soit la sortie du rédacteur (clés inventées, types faux, <script>, URL `javascript:`,
chaînes démesurées, `optimization_notes` interne), seul ce qui correspond STRICTEMENT au
schéma canonique en ressort. C'est la condition d'un rendu HTML serveur sûr en V2.
"""

import json
from pathlib import Path

import pytest

from app.generated.models import GeneratedCVData
from app.services.cv_content_coercion import (
    CVContentCoercionError,
    coerce_cv_content,
)

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "cv-reference"
FIXTURE_NAMES = ["complete", "minimal", "dense"]
# Fixtures déjà en forme canonique (toutes les clés présentes) → round-trip exact.
CANONICAL_FIXTURES = ["complete", "dense"]


def _load(name: str) -> dict:
    return json.loads((FIXTURES_DIR / f"{name}.json").read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# M0-T01 — fixtures de référence conformes au contrat
# ---------------------------------------------------------------------------


class TestReferenceFixtures:
    @pytest.mark.parametrize("name", FIXTURE_NAMES)
    def test_fixture_validates_against_contract(self, name: str):
        """Chaque fixture valide le schéma GeneratedCVData du contrat (types générés)."""
        GeneratedCVData.model_validate(_load(name))

    @pytest.mark.parametrize("name", FIXTURE_NAMES)
    def test_fixture_has_no_internal_optimization_notes(self, name: str):
        """Les fixtures ne contiennent jamais le champ interne `optimization_notes`."""
        assert "optimization_notes" not in _load(name)


# ---------------------------------------------------------------------------
# M0-T03 — nominal : contenu légitime préservé, coercition idempotente
# ---------------------------------------------------------------------------


class TestCoerceNominal:
    @pytest.mark.parametrize("name", FIXTURE_NAMES)
    def test_coerced_fixture_still_valid(self, name: str):
        content, _ = coerce_cv_content(_load(name))
        GeneratedCVData.model_validate(content)

    @pytest.mark.parametrize("name", CANONICAL_FIXTURES)
    def test_canonical_fixture_unchanged(self, name: str):
        """Une fixture déjà canonique ressort inchangée (aucune perte de contenu)."""
        original = _load(name)
        content, warnings = coerce_cv_content(original)
        assert content == original
        assert warnings == []

    @pytest.mark.parametrize("name", FIXTURE_NAMES)
    def test_idempotent(self, name: str):
        once, _ = coerce_cv_content(_load(name))
        twice, _ = coerce_cv_content(once)
        assert twice == once

    def test_idempotent_on_hostile_input(self):
        """L'invariant qui compte : coerce(coerce(hostile)) == coerce(hostile)
        (sinon `is_cv_content_conformant` classerait mal un CV déjà coercé)."""
        once, _ = coerce_cv_content(_hostile())
        twice, warnings = coerce_cv_content(once)
        assert twice == once
        assert warnings == []  # déjà nettoyé : plus rien à signaler au 2e passage

    def test_content_preserved(self):
        content, _ = coerce_cv_content(_load("complete"))
        assert content["personal_info"]["first_name"] == "Camille"
        assert len(content["selected_experiences"]) == 2
        assert len(content["highlighted_skills"]) == 5
        assert content["selected_experiences"][0]["highlighted_skills"][0] == "Python"


# ---------------------------------------------------------------------------
# M0-T02 — défenses (entrées hostiles)
# ---------------------------------------------------------------------------


def _hostile() -> dict:
    """Sortie writer hostile plausible après une injection ayant altéré la génération."""
    return {
        "personal_info": {
            "first_name": "Jean",
            "last_name": "Martin",
            "email": "jean@example.com",
            "linkedin": "javascript:alert(document.cookie)",
            "onclick": "steal()",  # clé hors schéma
        },
        "summary": "<script>fetch('//evil')</script>" + "A" * 9000,
        "selected_experiences": [
            {
                "id": "exp-1",
                "title": "Dev",
                "company": "Acme",
                "start_date": "2020-01",
                "description": "x" * 99999,
                "highlighted_skills": ["Python", "Python", "Python"],
                "injected_html": "<img src=x onerror=alert(1)>",  # clé hors schéma
            },
            {
                "id": "exp-2",
                "title": "Stagiaire",
                "company": "Beta",
                "start_date": "pas-une-date",  # date invalide => expérience écartée
                "description": "d",
                "highlighted_skills": [],
            },
        ],
        "highlighted_skills": [
            {"name": "Python", "category": "superpower", "importance": "URGENT"},
        ],
        "selected_educations": [{"id": "edu-1", "degree": "BTS", "institution": "X"}],
        "selected_projects": [
            {
                "id": "p1",
                "name": "P",
                "description": "d",
                "url": "data:text/html,evil",
                "relevant_skills": [],
            }
        ],
        "selected_certifications": [],
        "optimization_notes": "STRATÉGIE INTERNE — ne jamais afficher",
        "__proto__": {"polluted": True},  # clé hors schéma
    }


class TestCoerceDefenses:
    def test_unknown_keys_dropped(self):
        content, _ = coerce_cv_content(_hostile())
        assert "onclick" not in content["personal_info"]
        assert "injected_html" not in content["selected_experiences"][0]
        assert "__proto__" not in content

    def test_optimization_notes_never_stored(self):
        """Champ interne (risque d'exfiltration BLK-5) : jamais conservé."""
        content, _ = coerce_cv_content(_hostile())
        assert "optimization_notes" not in content

    def test_javascript_and_data_urls_neutralized(self):
        content, _ = coerce_cv_content(_hostile())
        assert content["personal_info"]["linkedin"] is None
        assert content["selected_projects"][0]["url"] is None

    def test_oversized_strings_capped(self):
        content, _ = coerce_cv_content(_hostile())
        assert len(content["summary"]) <= 2000
        assert len(content["selected_experiences"][0]["description"]) <= 5000

    def test_experience_with_invalid_start_date_dropped(self):
        """start_date requis+patterné : une expérience sans date valide est écartée
        (pas de date inventée, pas d'échec du CV entier)."""
        content, warnings = coerce_cv_content(_hostile())
        assert len(content["selected_experiences"]) == 1
        assert content["selected_experiences"][0]["id"] == "exp-1"
        assert any("date de début" in w for w in warnings)

    def test_invalid_enums_coerced_to_safe_defaults(self):
        content, _ = coerce_cv_content(_hostile())
        skill = content["highlighted_skills"][0]
        # Replis documentés (ADR-CONTENT-SCHEMA), pas juste « une valeur valide ».
        assert skill["category"] == "hard_skill"
        assert skill["importance"] == "Important"

    def test_coerced_hostile_still_valid_schema(self):
        """Même une entrée hostile produit un objet conforme au contrat (ou rien)."""
        content, _ = coerce_cv_content(_hostile())
        GeneratedCVData.model_validate(content)

    def test_duplicate_skills_deduplicated(self):
        content, _ = coerce_cv_content(_hostile())
        assert content["selected_experiences"][0]["highlighted_skills"] == ["Python"]

    def test_script_text_kept_inert_as_literal_string(self):
        """Un <script> dans un champ texte est CONSERVÉ verbatim comme chaîne (il sera
        échappé au rendu, cf. ADR-RENDER-SECURITY : autoescape = 2e couche) — ni
        exécuté, ni retiré, ni transformé en structure active."""
        content, _ = coerce_cv_content(_hostile())
        assert isinstance(content["summary"], str)
        assert content["summary"].startswith("<script>fetch('//evil')</script>")

    def test_non_dict_raises(self):
        for bad in ["une chaîne", 42, ["liste"], None]:
            with pytest.raises(CVContentCoercionError):
                coerce_cv_content(bad)

    def test_plain_http_url_preserved_but_breakout_url_rejected(self):
        """http:// légitime conservé ; une URL http(s) contenant un caractère de
        breakout d'attribut (guillemet) est rejetée (defense-in-depth AC-2)."""
        raw = {
            "personal_info": {
                "first_name": "A",
                "last_name": "B",
                "email": "a@b.com",
                "linkedin": "http://example.com/in/a",
            },
            "summary": "s",
            "selected_experiences": [],
            "highlighted_skills": [],
            "selected_educations": [],
            "selected_projects": [
                {
                    "id": "p1",
                    "name": "Breakout",
                    "description": "d",
                    "url": 'https://x.com/" onmouseover=alert(1)',
                    "relevant_skills": [],
                },
                {
                    "id": "p2",
                    "name": "Sain",
                    "description": "d",
                    "url": "https://ok.example.com/p",
                    "relevant_skills": [],
                },
            ],
            "selected_certifications": [],
        }
        content, _ = coerce_cv_content(raw)
        assert content["personal_info"]["linkedin"] == "http://example.com/in/a"
        assert content["selected_projects"][0]["url"] is None
        assert content["selected_projects"][1]["url"] == "https://ok.example.com/p"

    def test_experience_id_restricted_to_safe_charset(self):
        """Un id hostile est réduit au charset [A-Za-z0-9._-] (inerte en attribut)."""
        raw = {
            "personal_info": {"first_name": "A", "last_name": "B", "email": "a@b.com"},
            "summary": "s",
            "selected_experiences": [
                {
                    "id": '"><script>',
                    "title": "Dev",
                    "company": "Acme",
                    "start_date": "2020-01",
                    "description": "d",
                    "highlighted_skills": [],
                }
            ],
            "highlighted_skills": [],
            "selected_educations": [],
        }
        content, _ = coerce_cv_content(raw)
        assert content["selected_experiences"][0]["id"] == "script"

    def test_oversized_lists_capped(self):
        """Listes bornées (anti-explosion / DoS) : au plus MAX_LIST_ITEMS éléments."""
        raw = {
            "personal_info": {"first_name": "A", "last_name": "B", "email": "a@b.com"},
            "summary": "s",
            "selected_experiences": [],
            "highlighted_skills": [{"name": f"skill{i}"} for i in range(200)],
            "selected_educations": [],
        }
        content, _ = coerce_cv_content(raw)
        assert len(content["highlighted_skills"]) <= 30

    def test_wrong_scalar_types_coerced_not_crash(self):
        """Types faux (titre entier, liste de skills = chaîne) → structure sûre."""
        raw = {
            "personal_info": {"first_name": 123, "last_name": [], "email": "a@b.com"},
            "summary": {"nested": "oops"},
            "selected_experiences": [
                {
                    "id": "exp-1",
                    "title": 999,
                    "company": "Acme",
                    "start_date": "2020-01",
                    "description": "d",
                    "highlighted_skills": "pas-une-liste",
                }
            ],
            "highlighted_skills": [],
            "selected_educations": [],
        }
        content, _ = coerce_cv_content(raw)
        assert content["personal_info"]["first_name"] == ""
        assert content["summary"] == ""
        assert content["selected_experiences"][0]["title"] == ""
        assert content["selected_experiences"][0]["highlighted_skills"] == []

    def test_never_raises_on_coercible_garbage(self):
        """Un dict même absurde ne lève pas : il est réduit à une structure sûre.

        La validité de schéma (ex. email non vide) n'est PAS garantie par la
        coercition — c'est le worker qui valide et fait échouer le job le cas
        échéant (M0-T04). Ici on vérifie seulement l'absence de levée et la forme.
        """
        content, warnings = coerce_cv_content({"garbage": True, "personal_info": 123})
        assert content["personal_info"]["first_name"] == ""
        assert "garbage" not in content
        assert content["selected_experiences"] == []
