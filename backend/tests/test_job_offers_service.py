"""
M4-T03 — Service `job_offers` (cœur réutilisé par M5 et M6).

Normalisation déterministe + empreinte sha256 + get-or-create par (user, empreinte).
« Même texte => même offre » (idempotent, cache de l'analyse LLM non refacturé),
et le cache est PAR utilisateur. Le câblage à la génération (offer_id sur la
Variante) relève de M4 et n'est pas requis par l'endpoint ATS : hors de ce lot.
"""

import re

import pytest

from app.models.job_offer import JobOffer
from app.services.job_offers import (
    get_or_create_offer,
    normalize_offer_text,
    offer_text_hash,
)


class TestNormalizeAndHash:
    def test_normalise_compresse_les_blancs(self):
        assert normalize_offer_text("  Ingénieur   backend\n\tsenior  ") == (
            "Ingénieur backend senior"
        )

    def test_normalise_non_string(self):
        assert normalize_offer_text(None) == ""  # type: ignore[arg-type]

    def test_hash_deterministe_et_format_sha256(self):
        h = offer_text_hash(normalize_offer_text("Python FastAPI"))
        assert h == offer_text_hash(normalize_offer_text("Python   FastAPI"))
        # Satisfait la CheckConstraint ck_job_offers_text_hash_sha256.
        assert re.fullmatch(r"[0-9a-f]{64}", h)

    def test_hash_distingue_les_textes(self):
        assert offer_text_hash("Python") != offer_text_hash("Rust")


class TestGetOrCreateOffer:
    async def test_meme_texte_meme_offre(self, test_db, test_user):
        a = await get_or_create_offer(test_db, test_user.id, "Dev backend Python")
        b = await get_or_create_offer(
            test_db, test_user.id, "  Dev   backend   Python "
        )
        assert isinstance(a, JobOffer)
        assert a.id == b.id  # idempotent malgré l'espacement

    async def test_textes_differents_offres_differentes(self, test_db, test_user):
        a = await get_or_create_offer(test_db, test_user.id, "Dev backend Python")
        b = await get_or_create_offer(test_db, test_user.id, "Dev frontend React")
        assert a.id != b.id

    async def test_cache_par_utilisateur(self, test_db, test_user, admin_user):
        a = await get_or_create_offer(test_db, test_user.id, "Même annonce")
        b = await get_or_create_offer(test_db, admin_user.id, "Même annonce")
        assert a.id != b.id  # deux utilisateurs => deux offres

    async def test_offre_neuve_sans_analyse(self, test_db, test_user):
        offer = await get_or_create_offer(test_db, test_user.id, "Annonce fraîche")
        assert offer.analysis_json is None  # cache vide tant qu'aucune analyse
