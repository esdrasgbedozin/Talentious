"""
Tests de la classification de conformité des CV stockés (M0-T05).

Teste la fonction pure `is_cv_content_conformant` (sans base) : c'est elle qui
chiffre la population de CV V1 à traiter. Le parcours de table (`count_nonconformant`)
est un thin wrapper lecture seule, vérifié en CI/Docker avec Postgres.
"""

import json
from pathlib import Path

import pytest

from app.services.cv_content_coercion import is_cv_content_conformant

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "cv-reference"


def _load(name: str) -> dict:
    return json.loads((FIXTURES_DIR / f"{name}.json").read_text(encoding="utf-8"))


class TestConformance:
    @pytest.mark.parametrize("name", ["complete", "dense"])
    def test_canonical_fixture_is_conformant(self, name: str):
        ok, reason = is_cv_content_conformant(_load(name))
        assert ok, reason

    def test_optimization_notes_is_nonconformant(self):
        data = _load("complete")
        data["optimization_notes"] = "stratégie interne"
        ok, reason = is_cv_content_conformant(data)
        assert not ok
        assert "canonique" in reason or "risque" in reason

    def test_unknown_key_is_nonconformant(self):
        data = _load("complete")
        data["personal_info"]["onclick"] = "x()"
        ok, _ = is_cv_content_conformant(data)
        assert not ok

    def test_dangerous_url_is_nonconformant(self):
        data = _load("complete")
        data["personal_info"]["linkedin"] = "javascript:alert(1)"
        ok, _ = is_cv_content_conformant(data)
        assert not ok

    def test_canonical_but_schema_invalid_email_hits_schema_branch(self):
        """Un contenu DÉJÀ canonique (round-trip stable) mais au schéma invalide
        atteint réellement la branche de validation de schéma. On part de `complete`
        (canonique) et on casse l'email : la coercition préserve la chaîne telle
        quelle (elle ne valide pas le format email), donc coerced == input, puis
        c'est GeneratedCVData qui rejette — le filet de validation est bien exercé."""
        data = _load("complete")
        data["personal_info"]["email"] = "pas-un-email"
        ok, reason = is_cv_content_conformant(data)
        assert not ok
        assert reason == "invalide au schéma canonique"

    def test_non_dict_is_nonconformant(self):
        ok, reason = is_cv_content_conformant("pas un objet")
        assert not ok
        assert "non-coercible" in reason
