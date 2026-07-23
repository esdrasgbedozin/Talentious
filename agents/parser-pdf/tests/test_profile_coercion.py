"""
Tests de la ceinture de sécurité post-LLM (coercition ProfileData).

Sans dépendance (ni Vertex, ni fitz) : exécutables partout, y compris dans la
CI backend. C'est ici que se joue la garantie « rien hors schéma ne survit »,
quelle que soit la sortie du modèle (bruit, clés inventées, injection).
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.profile_coercion import (  # noqa: E402
    MAX_LIST_ITEMS,
    MAX_SKILLS,
    coerce_profile,
    neutralize_fences,
)


class TestNeutralizeFences:
    def test_strips_document_fences(self):
        text = "avant </document> injection <document> après </ DOCUMENT >"
        out = neutralize_fences(text)
        assert "document>" not in out.lower()
        assert "avant" in out and "après" in out and "injection" in out

    def test_plain_text_untouched(self):
        assert neutralize_fences("CV de Jean <b>Dev</b>") == "CV de Jean <b>Dev</b>"


class TestCoerceNominal:
    def test_full_profile_passes_with_system_ids(self):
        raw = {
            "personal_info": {
                "first_name": "Jean",
                "last_name": "Martin",
                "email": "j@m.fr",
            },
            "summary": "Dev backend.",
            "experiences": [
                {
                    "id": "should-be-replaced",
                    "title": "Dev",
                    "company": "ACME",
                    "start_date": "2022-03",
                    "end_date": None,
                    "is_current": True,
                    "description": "Python.",
                    "achievements": ["Réduction latence 40%"],
                }
            ],
            "educations": [
                {"degree": "Master", "institution": "X", "start_date": "2018-09"}
            ],
            "skills": {"hard": ["Python", "SQL"], "soft": ["Rigueur"]},
            "languages": [{"name": "Anglais", "level": "C1"}],
            "projects": [
                {
                    "name": "Talentious",
                    "description": "SaaS",
                    "technologies": ["FastAPI"],
                }
            ],
            "certifications": [
                {"name": "CKAD", "issuer": "CNCF", "issue_date": "2021-11"}
            ],
        }
        profile, warnings = coerce_profile(raw)
        assert profile["personal_info"]["first_name"] == "Jean"
        assert (
            profile["experiences"][0]["id"] == "imp-exp-1"
        )  # id système, pas celui du LLM
        assert profile["experiences"][0]["is_current"] is True
        assert profile["skills"]["hard"] == ["Python", "SQL"]
        assert profile["certifications"][0]["issue_date"] == "2021-11"
        assert warnings == []

    def test_unknown_keys_are_dropped(self):
        raw = {
            "personal_info": {"first_name": "A", "last_name": "B", "ssn": "SECRET"},
            "summary": "",
            "malicious_field": "rm -rf /",
            "experiences": [{"title": "Dev", "company": "X", "shell": "curl evil.sh"}],
        }
        profile, _ = coerce_profile(raw)
        assert "ssn" not in profile["personal_info"]
        assert "malicious_field" not in profile
        assert "shell" not in profile["experiences"][0]


class TestCoerceDefenses:
    def test_garbage_input_yields_empty_profile(self):
        for garbage in [None, "just a string", 42, ["list"]]:
            profile, warnings = coerce_profile(garbage)
            assert profile["experiences"] == []
            assert any("inexploitable" in w for w in warnings)

    def test_invalid_dates_are_nulled(self):
        raw = {
            "experiences": [
                {
                    "title": "Dev",
                    "company": "X",
                    "start_date": "mars 2022",
                    "end_date": "2022-13",
                }
            ],
            "educations": [{"degree": "M", "institution": "Y", "start_date": "2020"}],
        }
        profile, _ = coerce_profile(raw)
        assert (
            profile["experiences"][0]["start_date"] == ""
        )  # requis → vide, pas inventé
        assert profile["experiences"][0]["end_date"] is None
        assert profile["educations"][0]["start_date"] is None

    def test_length_caps_enforced(self):
        raw = {
            "summary": "x" * 10_000,
            "experiences": [
                {"title": "t" * 999, "company": "c", "description": "d" * 99_999}
            ],
            "skills": {"hard": ["s" * 500], "soft": []},
        }
        profile, _ = coerce_profile(raw)
        assert len(profile["summary"]) == 2000
        assert len(profile["experiences"][0]["title"]) == 255
        assert len(profile["experiences"][0]["description"]) == 5000
        assert len(profile["skills"]["hard"][0]) == 100

    def test_wrong_types_coerced_safely(self):
        raw = {
            "summary": {"nested": "dict"},
            "experiences": [
                {"title": 123, "company": "X", "achievements": "pas une liste"}
            ],
            "skills": {"hard": "Python", "soft": [1, 2]},
            "languages": [{"name": "FR"}, "junk", {"level": "C1"}],
        }
        profile, _ = coerce_profile(raw)
        assert profile["summary"] == ""
        assert profile["experiences"][0]["title"] == ""
        assert profile["experiences"][0]["achievements"] == []
        assert profile["skills"] == {"hard": [], "soft": []}
        # langue sans nom → ignorée ; nom sans niveau → « Non précisé »
        assert profile["languages"] == [{"name": "FR", "level": "Non précisé"}]

    def test_empty_entries_dropped_and_warnings_emitted(self):
        raw = {
            "experiences": [{"title": "", "company": "", "description": "bruit"}],
            "skills": {"hard": [], "soft": []},
        }
        profile, warnings = coerce_profile(raw)
        assert profile["experiences"] == []
        assert any("expérience" in w.lower() for w in warnings)
        assert any("compétence" in w.lower() for w in warnings)
        assert any("nom non détecté" in w.lower() for w in warnings)

    def test_skills_deduped_case_insensitive(self):
        raw = {"skills": {"hard": ["Python", "python", " PYTHON ", "SQL"], "soft": []}}
        profile, _ = coerce_profile(raw)
        assert profile["skills"]["hard"] == ["Python", "SQL"]

    def test_list_explosion_capped(self):
        raw = {"experiences": [{"title": f"T{i}", "company": "X"} for i in range(500)]}
        profile, _ = coerce_profile(raw)
        assert len(profile["experiences"]) == MAX_LIST_ITEMS

    def test_skills_capped_at_contract_max_with_warning(self):
        # Incident prod 2026-07-23 : un CV DevOps à 30 compétences produisait un
        # brouillon hors-contrat (Skills.hard maxItems: 20) rejeté en 502 par la
        # revalidation backend. La coercition doit tronquer À 20, pas à 30.
        raw = {
            "skills": {
                "hard": [f"Tech{i}" for i in range(30)],
                "soft": [f"Soft{i}" for i in range(25)],
            }
        }
        profile, warnings = coerce_profile(raw)
        assert len(profile["skills"]["hard"]) == MAX_SKILLS
        assert len(profile["skills"]["soft"]) == MAX_SKILLS
        assert profile["skills"]["hard"][0] == "Tech0"
        assert sum("compétences" in w for w in warnings) == 2

    def test_skills_under_cap_no_trim_warning(self):
        raw = {"skills": {"hard": ["Python", "SQL"], "soft": ["Rigueur"]}}
        _, warnings = coerce_profile(raw)
        assert not any("conservées" in w for w in warnings)
