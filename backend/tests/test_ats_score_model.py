"""
M5-T08 — Table `ats_scores` (cache du Score ATS par Variante × Offre).

Vérifie les garde-fous de schema : unicité `(cv_variant_id, offer_id)` et borne
0-100 du score (CheckConstraint). La réversibilité up/down de la migration est
couverte par le cycle alembic (et par la CI).
"""

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import AtsScore, GeneratedCV
from app.services.job_offers import get_or_create_offer


async def _variant_and_offer(db, user):
    """Une Variante (generated_cv) + une Offre, pour ancrer les deux FK."""
    cv = GeneratedCV(
        user_id=user.id,
        cv_name="CV de test",
        template_id="modern_sobre",
        cv_data_json={},
    )
    db.add(cv)
    await db.flush()
    offer = await get_or_create_offer(db, user.id, "Une annonce de reference")
    return cv, offer


class TestAtsScoreSchema:
    async def test_unicite_variant_offer(self, test_db, test_user):
        cv, offer = await _variant_and_offer(test_db, test_user)
        test_db.add(
            AtsScore(cv_variant_id=cv.id, offer_id=offer.id, score=50, result_json={})
        )
        await test_db.flush()
        # Un second score pour le MÊME couple viole l'unique.
        test_db.add(
            AtsScore(cv_variant_id=cv.id, offer_id=offer.id, score=70, result_json={})
        )
        with pytest.raises(IntegrityError):
            await test_db.flush()

    async def test_score_hors_plage_rejete(self, test_db, test_user):
        cv, offer = await _variant_and_offer(test_db, test_user)
        test_db.add(
            AtsScore(cv_variant_id=cv.id, offer_id=offer.id, score=150, result_json={})
        )
        with pytest.raises(IntegrityError):  # CheckConstraint score <= 100
            await test_db.flush()
