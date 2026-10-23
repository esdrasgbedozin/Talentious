"""
M1-T02 — Table `job_offers` (archi V2 §4) : cache des analyses d'offres par
hash du texte (une même annonce re-collée = gratuite après le 1er appel,
levier FinOps).

Garanties vérifiées ici :
- unicité `(user_id, text_hash)` : deux insertions du même texte pour le même
  utilisateur entrent en conflit (c'est LA clé du cache) — mais le même texte
  chez un AUTRE utilisateur passe (le cache est par utilisateur, pas global) ;
- la suppression du compte emporte ses offres (`ON DELETE CASCADE`, RGPD) ;
- la MIGRATION réelle (pas le metadata.create_all des fixtures) crée bien la
  table, sa contrainte d'unicité et sa FK CASCADE — vérifié sur base jetable
  après un cycle up/down/up complet (le garde M1-T01 s'applique d'office).
"""

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from app.models import JobOffer, User
from scripts.check_migrations import run_cycle
from tests.conftest import sync_db_url


def _user(email: str) -> User:
    return User(email=email, hashed_password="x", email_verified=True)


HASH_A = "a" * 64  # sha256 hex d'un texte d'offre (64 caractères)


class TestJobOfferModel:
    async def test_unicite_user_et_hash(self, test_db):
        user = _user("offre@test.fr")
        test_db.add(user)
        await test_db.flush()
        test_db.add(JobOffer(user_id=user.id, raw_text="Dev Python", text_hash=HASH_A))
        await test_db.flush()
        test_db.add(JobOffer(user_id=user.id, raw_text="Dev Python", text_hash=HASH_A))
        with pytest.raises(IntegrityError):
            await test_db.flush()
        await test_db.rollback()

    async def test_meme_hash_pour_un_autre_utilisateur_passe(self, test_db):
        u1, u2 = _user("u1@test.fr"), _user("u2@test.fr")
        test_db.add_all([u1, u2])
        await test_db.flush()
        test_db.add_all(
            [
                JobOffer(user_id=u1.id, raw_text="Dev", text_hash=HASH_A),
                JobOffer(user_id=u2.id, raw_text="Dev", text_hash=HASH_A),
            ]
        )
        await test_db.flush()  # aucun conflit : le cache est PAR utilisateur

    async def test_analysis_json_optionnel_au_depart(self, test_db):
        # L'offre est insérée AVANT l'appel agent (c'est le cache qui se
        # remplit) : analysis_json commence à NULL.
        user = _user("sans-analyse@test.fr")
        test_db.add(user)
        await test_db.flush()
        offer = JobOffer(user_id=user.id, raw_text="Texte", text_hash=HASH_A)
        test_db.add(offer)
        await test_db.flush()
        assert offer.analysis_json is None
        assert offer.created_at is not None

    async def test_suppression_du_compte_emporte_ses_offres_et_seulement_les_siennes(
        self, test_db
    ):
        efface, survivant = _user("efface-moi@test.fr"), _user("reste@test.fr")
        test_db.add_all([efface, survivant])
        await test_db.flush()
        test_db.add_all(
            [
                JobOffer(user_id=efface.id, raw_text="X", text_hash=HASH_A),
                JobOffer(user_id=survivant.id, raw_text="X", text_hash=HASH_A),
            ]
        )
        await test_db.flush()
        await test_db.delete(efface)
        await test_db.flush()
        restantes = await test_db.execute(text("SELECT user_id FROM job_offers"))
        # CASCADE (RGPD) : les offres du compte effacé disparaissent, celles
        # des autres comptes survivent.
        assert [row[0] for row in restantes] == [survivant.id]

    async def test_hash_mal_forme_refuse_par_la_base(self, test_db):
        # Le CHECK `^[0-9a-f]{64}$` attrape un hash tronqué OU non hexadécimal
        # AVANT qu'il ne fragmente le cache (le hash doit venir d'un helper
        # unique, minuscule — sha256 hexdigest).
        user = _user("hash-casse@test.fr")
        test_db.add(user)
        await test_db.flush()
        for mauvais in ("abc", "Z" * 64, "A" * 64):
            test_db.add(JobOffer(user_id=user.id, raw_text="X", text_hash=mauvais))
            with pytest.raises(IntegrityError):
                await test_db.flush()
            await test_db.rollback()


class TestMigrationJobOffers:
    def test_la_migration_reelle_cree_table_contrainte_et_fk(self, disposable_db_url):
        # Cycle up/down/up complet (garde M1-T01) : la nouvelle migration doit
        # être réversible. À l'issue, la base est à head : on inspecte le
        # SCHÉMA RÉEL créé par la migration (pas celui du metadata des tests).
        run_cycle(disposable_db_url)
        engine = create_engine(sync_db_url(disposable_db_url))
        try:
            insp = inspect(engine)
            assert "job_offers" in insp.get_table_names()
            cols = {c["name"] for c in insp.get_columns("job_offers")}
            assert cols == {
                "id",
                "user_id",
                "raw_text",
                "text_hash",
                "analysis_json",
                "created_at",
                "updated_at",
            }
            uniques = {
                tuple(u["column_names"]): u["name"]
                for u in insp.get_unique_constraints("job_offers")
            }
            assert ("user_id", "text_hash") in uniques
            checks = {c["name"] for c in insp.get_check_constraints("job_offers")}
            assert "ck_job_offers_text_hash_sha256" in checks
            fks = insp.get_foreign_keys("job_offers")
            user_fk = next(fk for fk in fks if fk["referred_table"] == "users")
            assert user_fk["options"].get("ondelete") == "CASCADE"
        finally:
            engine.dispose()
