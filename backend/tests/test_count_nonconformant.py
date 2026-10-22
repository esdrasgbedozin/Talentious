"""
Test du parcours de table LECTURE SEULE du script de décompte (M0-T05, C7 revue).

Complète les tests DB-free de `is_cv_content_conformant` : ici on vérifie que
`count_nonconformant` itère réellement `generated_cvs`, agrège le verdict et n'écrit
rien. Nécessite Postgres (fixture `test_db`).
"""

import json
from pathlib import Path

from app.models import GeneratedCV
from scripts.count_nonconformant_cvs import count_nonconformant

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "cv-reference"


def _complete() -> dict:
    return json.loads((FIXTURES_DIR / "complete.json").read_text(encoding="utf-8"))


async def _add_cv(test_db, user_id, cv_data_json):
    cv = GeneratedCV(
        user_id=user_id,
        cv_name="x",
        template_id="modern_v1",
        job_offer_context="ctx",
        cv_data_json=cv_data_json,
    )
    test_db.add(cv)
    await test_db.flush()
    return cv


class TestCountNonconformant:
    async def test_counts_and_classifies(self, test_db, test_user):
        # 1 conforme (fixture canonique), 2 non conformes (champ interne + brut V1).
        await _add_cv(test_db, test_user.id, _complete())
        internal = _complete()
        internal["optimization_notes"] = "stratégie interne"
        await _add_cv(test_db, test_user.id, internal)
        await _add_cv(test_db, test_user.id, {"summary": "CV V1 brut partiel"})
        await test_db.commit()

        report = await count_nonconformant(test_db)

        assert report["total"] == 3
        assert report["conformant"] == 1
        assert report["nonconformant"] == 2
        assert sum(report["reasons"].values()) == 2
        assert len(report["sample_ids"]) == 2

    async def test_empty_table_is_all_zero(self, test_db):
        report = await count_nonconformant(test_db)
        assert report == {
            "total": 0,
            "conformant": 0,
            "nonconformant": 0,
            "reasons": {},
            "sample_ids": [],
        }
