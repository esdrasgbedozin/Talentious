"""
M1-T05 — ALTER `generated_cvs` : la table DEVIENT la Variante de CV (archi V2
§4). Ajout de l'enveloppe (`theme_json`, `theme_preset_id`, `language`,
`offer_id`, `created_under_pass`, `gcs_docx_url`, `parent_variant_id`) avec
backfill `anthracite`/`fr`/`false` par server_default (metadata-only, aucun
UPDATE : le stock n'est pas réécrit).

Critère du ticket : checksum de `cv_data_json` IDENTIQUE avant/après ; backfill
`fr`/anthracite/`false`. Invariant archi : `cv_data_json` reste contenu PUR,
jamais transformé — la forme vit dans les colonnes sœurs.

Garanties vérifiées ici :
- le contenu canonique est sémantiquement identique (md5 de `jsonb::text` par
  ligne — jsonb normalise ordre des clés et espaces, l'invariant est
  sémantique, pas binaire — avant l'upgrade, après, et après le downgrade) ;
- le stock reçoit l'enveloppe par défaut : `language='fr'`,
  `created_under_pass=false`, `theme_preset_id='anthracite'`, `theme_json` =
  snapshot anthracite (tokens EXACTS du registre) ; liens (`offer_id`,
  `parent_variant_id`) et `gcs_docx_url` à NULL ;
- les 3 FK tiennent : `theme_preset_id` hors registre refusé ; `offer_id`
  inconnu refusé ; supprimer l'offre ou le parent met le lien à NULL
  (SET NULL — un document ne meurt jamais par ricochet) ;
- le downgrade retire colonnes, FK et type ENUM `documentlanguage`, et le
  re-upgrade repasse sur la base peuplée ;
- côté ORM : une écriture « code V1 » (sans les nouveaux champs) reçoit les
  défauts — rétro-compat pendant le rollout (le migrate précède les services).
"""

import json
import uuid
from datetime import datetime

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import DataError, IntegrityError

from app.models import DocumentLanguage, GeneratedCV, User
from scripts.check_migrations import _alembic_config
from tests.conftest import sync_db_url
from tests.test_cv_themes import _ANTHRACITE_TOKENS

_PRE_T05_REV = "d9e0f1a2b3c4"  # head juste avant l'ALTER (cv_themes)


def _upgrade_ctx(disposable_db_url):
    import os

    from alembic import command

    cfg = _alembic_config()
    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = disposable_db_url
    engine = create_engine(sync_db_url(disposable_db_url))
    return os, command, cfg, previous, engine


def _restore_env(os, previous):
    if previous is None:
        os.environ.pop("DATABASE_URL", None)
    else:
        os.environ["DATABASE_URL"] = previous


def _seed_pre_t05(engine) -> dict:
    """Base au schéma T04, peuplée : 1 user, 1 offre, 2 CV au contenu réel."""
    ids = {
        "user": uuid.uuid4(),
        "offer": uuid.uuid4(),
        "cv1": uuid.uuid4(),
        "cv2": uuid.uuid4(),
    }
    now = datetime(2026, 1, 1)
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO users (id, email, hashed_password, role, created_at) "
                "VALUES (:id, 'v1@test.fr', 'x', 'user', :now)"
            ),
            {"id": ids["user"], "now": now},
        )
        conn.execute(
            text(
                "INSERT INTO job_offers (id, user_id, raw_text, text_hash, "
                "created_at, updated_at) VALUES (:id, :uid, 'Offre', :hash, "
                ":now, :now)"
            ),
            {"id": ids["offer"], "uid": ids["user"], "hash": "a" * 64, "now": now},
        )
        for key, data in (
            ("cv1", {"summary": "Pâtissier reconverti — éàç", "skills": ["a", "b"]}),
            ("cv2", {"nested": {"deep": [1, 2, {"x": None}]}, "text": "profil"}),
        ):
            conn.execute(
                text(
                    "INSERT INTO generated_cvs (id, user_id, cv_name, template_id, "
                    "cv_data_json, created_at, updated_at) VALUES "
                    "(:id, :uid, :name, 'modern_sobre', :data, :now, :now)"
                ),
                {
                    "id": ids[key],
                    "uid": ids["user"],
                    "name": f"CV {key}",
                    "data": json.dumps(data),
                    "now": now,
                },
            )
    return ids


def _checksums(engine) -> dict:
    with engine.connect() as conn:
        rows = conn.execute(
            text("SELECT id, md5(cv_data_json::text) FROM generated_cvs")
        ).fetchall()
    return {str(row[0]): row[1] for row in rows}


class TestMigrationEnvelope:
    def test_cv_data_json_intact_backfill_puis_down_et_reup(self, disposable_db_url):
        os, command, cfg, previous, engine = _upgrade_ctx(disposable_db_url)
        try:
            command.upgrade(cfg, _PRE_T05_REV)
            _seed_pre_t05(engine)
            before = _checksums(engine)
            assert len(before) == 2

            command.upgrade(cfg, "head")

            # CRITÈRE : le contenu canonique n'a pas bougé d'un octet.
            assert _checksums(engine) == before

            with engine.connect() as conn:
                rows = conn.execute(
                    text(
                        "SELECT language, created_under_pass, theme_preset_id, "
                        "theme_json, offer_id, gcs_docx_url, parent_variant_id "
                        "FROM generated_cvs"
                    )
                ).fetchall()
            assert len(rows) == 2
            for row in rows:
                assert row[0] == "fr"
                assert row[1] is False
                assert row[2] == "anthracite"
                assert row[3] == _ANTHRACITE_TOKENS
                assert row[4] is None and row[5] is None and row[6] is None

            # Down OK : colonnes, FK et ENUM disparaissent ; contenu intact.
            command.downgrade(cfg, _PRE_T05_REV)
            insp = inspect(engine)
            cols = {c["name"] for c in insp.get_columns("generated_cvs")}
            assert not cols & {
                "theme_json",
                "theme_preset_id",
                "language",
                "offer_id",
                "created_under_pass",
                "gcs_docx_url",
                "parent_variant_id",
            }
            with engine.connect() as conn:
                enum_left = conn.execute(
                    text("SELECT 1 FROM pg_type WHERE typname = 'documentlanguage'")
                ).fetchone()
                assert enum_left is None
            assert _checksums(engine) == before

            # Re-upgrade sur base peuplée.
            command.upgrade(cfg, "head")
            assert _checksums(engine) == before
        finally:
            engine.dispose()
            _restore_env(os, previous)

    def test_les_fk_de_l_enveloppe_tiennent(self, disposable_db_url):
        os, command, cfg, previous, engine = _upgrade_ctx(disposable_db_url)
        try:
            command.upgrade(cfg, _PRE_T05_REV)
            ids = _seed_pre_t05(engine)
            command.upgrade(cfg, "head")

            # Les 3 FK sont VALIDÉES (une contrainte restée NOT VALID
            # passerait tous les autres tests — revue data 9).
            with engine.connect() as conn:
                validated = conn.execute(
                    text(
                        "SELECT conname, convalidated FROM pg_constraint "
                        "WHERE conname IN ("
                        "'fk_generated_cvs_theme_preset_id', "
                        "'fk_generated_cvs_offer_id', "
                        "'fk_generated_cvs_parent_variant_id')"
                    )
                ).fetchall()
            assert len(validated) == 3
            assert all(row[1] is True for row in validated)

            # theme_preset_id hors registre : refusé par la base.
            with pytest.raises(
                IntegrityError, match="fk_generated_cvs_theme_preset_id"
            ):
                with engine.begin() as conn:
                    conn.execute(
                        text(
                            "UPDATE generated_cvs SET theme_preset_id = 'fantome' "
                            "WHERE id = :id"
                        ),
                        {"id": ids["cv1"]},
                    )
            # offer_id inconnu : refusé.
            with pytest.raises(IntegrityError, match="fk_generated_cvs_offer_id"):
                with engine.begin() as conn:
                    conn.execute(
                        text("UPDATE generated_cvs SET offer_id = :oid WHERE id = :id"),
                        {"oid": uuid.uuid4(), "id": ids["cv1"]},
                    )
            # Auto-parenté refusée (revue data M1-T05) : un cycle de longueur 1
            # ferait boucler tout parcours de lignée. Les cycles ≥ 2 relèvent
            # du service (M1-T13 : le parent existe avant l'enfant).
            with pytest.raises(IntegrityError, match="ck_generated_cvs_no_self_parent"):
                with engine.begin() as conn:
                    conn.execute(
                        text(
                            "UPDATE generated_cvs SET parent_variant_id = :id "
                            "WHERE id = :id"
                        ),
                        {"id": ids["cv1"]},
                    )
            # theme_json doit être un objet JSON (il sera copié dans les
            # exports/duplications — un scalaire corromprait en silence).
            with pytest.raises(
                IntegrityError, match="ck_generated_cvs_theme_json_object"
            ):
                with engine.begin() as conn:
                    conn.execute(
                        text(
                            "UPDATE generated_cvs SET theme_json = '\"oops\"'::jsonb "
                            "WHERE id = :id"
                        ),
                        {"id": ids["cv1"]},
                    )

            # Une langue hors contrat est refusée par le type ENUM.
            with pytest.raises(DataError, match="documentlanguage"):
                with engine.begin() as conn:
                    conn.execute(
                        text("UPDATE generated_cvs SET language = 'de' WHERE id = :id"),
                        {"id": ids["cv1"]},
                    )
            # RESTRICT réel : anthracite est référencé par le stock backfillé,
            # sa suppression est refusée (match générique : cv_templates ET
            # generated_cvs le référencent, l'erreur peut citer l'un ou
            # l'autre — c'est le refus qui compte).
            with pytest.raises(IntegrityError, match="still referenced"):
                with engine.begin() as conn:
                    conn.execute(text("DELETE FROM cv_themes WHERE id = 'anthracite'"))

            # Liens valides, puis SET NULL : un document ne meurt jamais par
            # ricochet de la suppression d'une offre ou de son parent.
            with engine.begin() as conn:
                conn.execute(
                    text("UPDATE generated_cvs SET offer_id = :oid WHERE id = :id"),
                    {"oid": ids["offer"], "id": ids["cv1"]},
                )
                conn.execute(
                    text(
                        "UPDATE generated_cvs SET parent_variant_id = :pid "
                        "WHERE id = :id"
                    ),
                    {"pid": ids["cv1"], "id": ids["cv2"]},
                )
            with engine.begin() as conn:
                conn.execute(
                    text("DELETE FROM job_offers WHERE id = :id"),
                    {"id": ids["offer"]},
                )
                conn.execute(
                    text("DELETE FROM generated_cvs WHERE id = :id"),
                    {"id": ids["cv1"]},
                )
            with engine.connect() as conn:
                row = conn.execute(
                    text(
                        "SELECT offer_id, parent_variant_id FROM generated_cvs "
                        "WHERE id = :id"
                    ),
                    {"id": ids["cv2"]},
                ).fetchone()
            assert row == (None, None)
        finally:
            engine.dispose()
            _restore_env(os, previous)

    def test_la_suppression_du_user_cascade_toute_la_lignee(self, disposable_db_url):
        """RGPD : DELETE user déclenche CASCADE (job_offers, generated_cvs) qui
        s'entrelace avec les SET NULL de l'enveloppe (offre liée, lignée
        parent→enfant) — l'interaction doit passer sans erreur ni résidu."""
        os, command, cfg, previous, engine = _upgrade_ctx(disposable_db_url)
        try:
            command.upgrade(cfg, _PRE_T05_REV)
            ids = _seed_pre_t05(engine)
            command.upgrade(cfg, "head")
            with engine.begin() as conn:
                conn.execute(
                    text("UPDATE generated_cvs SET offer_id = :oid WHERE id = :id"),
                    {"oid": ids["offer"], "id": ids["cv1"]},
                )
                conn.execute(
                    text(
                        "UPDATE generated_cvs SET parent_variant_id = :pid "
                        "WHERE id = :id"
                    ),
                    {"pid": ids["cv1"], "id": ids["cv2"]},
                )
            with engine.begin() as conn:
                conn.execute(
                    text("DELETE FROM users WHERE id = :id"), {"id": ids["user"]}
                )
            with engine.connect() as conn:
                leftovers = conn.execute(
                    text(
                        "SELECT (SELECT COUNT(*) FROM generated_cvs), "
                        "(SELECT COUNT(*) FROM job_offers)"
                    )
                ).fetchone()
            assert leftovers == (0, 0)
        finally:
            engine.dispose()
            _restore_env(os, previous)


class TestORMEnvelope:
    async def test_une_ecriture_v1_recoit_l_enveloppe_par_defaut(self, test_db):
        """Rétro-compat rollout : le code N-1 insère sans les nouveaux champs,
        la base pose les défauts (fr / anthracite / false)."""
        user = User(email="env@test.fr", hashed_password="x", email_verified=True)
        test_db.add(user)
        await test_db.flush()
        cv = GeneratedCV(
            user_id=user.id,
            cv_name="CV V1",
            template_id="modern_sobre",
            cv_data_json={"summary": "x"},
        )
        test_db.add(cv)
        await test_db.flush()
        await test_db.refresh(cv)
        assert cv.language == DocumentLanguage.FR
        assert cv.created_under_pass is False
        assert cv.theme_preset_id == "anthracite"
        assert cv.theme_json == _ANTHRACITE_TOKENS
        assert cv.offer_id is None
        assert cv.gcs_docx_url is None
        assert cv.parent_variant_id is None
