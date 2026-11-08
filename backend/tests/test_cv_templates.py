"""
M1-T03 — Table `cv_templates` + seed `modern_sobre` + BACKFILL des
`template_id` existants avant la pose de la FK (archi V2 §4).

Critère du ticket : sur une base V1 PEUPLÉE, toutes les FK sont valides après
l'upgrade ; le downgrade passe.

Garanties vérifiées ici :
- sur une base portant des stamps V1 réels (`modern_v1`, valeurs farfelues),
  l'upgrade backfille vers `modern_sobre` (le MÊME alias que le registre front,
  ADR-TEMPLATE-REGISTRY) AVANT de poser la FK — aucune ligne orpheline (le
  WHERE du backfill exclut les stamps déjà au registre ; sa nécessité est
  prouvée par mutation, pas par ce test) ;
- le seed `modern_sobre` est présent et gratuit (`is_free=true`) ;
- la FK est RESTRICT en pratique : supprimer un template référencé est refusé ;
- le downgrade retire FK, table ET type ENUM, puis un re-upgrade repasse sur la
  base PEUPLÉE (les stamps backfillés restent `modern_sobre`, valeur V1 valide
  — non-restauration assumée, docstring de la migration) ;
- côté ORM : la FK est enforce — un `template_id` hors registre est refusé.
"""

import json
import uuid
from datetime import datetime

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from app.models import CVTemplate, GeneratedCV, User
from scripts.check_migrations import _alembic_config
from tests.conftest import sync_db_url

_PRE_T03_REV = "b7c8d9e0f1a2"  # head juste avant cv_templates (job_offers)
# Révision du SEED des templates M3 : ce test cible CETTE migration précise (son
# up/down), pas « head » — d'autres migrations peuvent se poser au-dessus (ex.
# ats_scores, M5-T08). On y upgrade/downgrade explicitement pour rester robuste.
_M3_SEED_REV = "a7b8c9d0e1f2"


def _seed_v1_rows(engine) -> dict:
    """Peuple une base au schéma pré-T03 avec des stamps V1 réels."""
    ids = {
        "legacy": uuid.uuid4(),
        "junk": uuid.uuid4(),
        "canonical": uuid.uuid4(),
    }
    user_id = uuid.uuid4()
    now = datetime(2026, 1, 1)
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO users (id, email, hashed_password, role, created_at) "
                "VALUES (:id, 'v1@test.fr', 'x', 'user', :now)"
            ),
            {"id": user_id, "now": now},
        )
        for key, stamp in (
            ("legacy", "modern_v1"),
            ("junk", "moderne"),
            ("canonical", "modern_sobre"),
        ):
            conn.execute(
                text(
                    "INSERT INTO generated_cvs (id, user_id, cv_name, template_id, "
                    "cv_data_json, created_at, updated_at) VALUES "
                    "(:id, :uid, :name, :stamp, :data, :now, :now)"
                ),
                {
                    "id": ids[key],
                    "uid": user_id,
                    "name": f"CV {key}",
                    "stamp": stamp,
                    "data": json.dumps({}),
                    "now": now,
                },
            )
    return ids


class TestMigrationCvTemplates:
    def test_backfill_sur_base_v1_peuplee_puis_fk_valide_et_down_ok(
        self, disposable_db_url
    ):
        import os

        from alembic import command

        cfg = _alembic_config()
        previous = os.environ.get("DATABASE_URL")
        os.environ["DATABASE_URL"] = disposable_db_url
        engine = create_engine(sync_db_url(disposable_db_url))
        try:
            # Base V1 peuplée : schéma pré-T03 + stamps réels.
            command.upgrade(cfg, _PRE_T03_REV)
            ids = _seed_v1_rows(engine)

            command.upgrade(cfg, "head")

            with engine.connect() as conn:
                # Le seed est là, gratuit.
                seed = conn.execute(
                    text("SELECT is_free FROM cv_templates WHERE id = 'modern_sobre'")
                ).fetchone()
                assert seed is not None and seed[0] is True
                # Backfill : legacy et farfelu → modern_sobre ; canonique intact.
                stamps = {
                    key: conn.execute(
                        text("SELECT template_id FROM generated_cvs WHERE id = :id"),
                        {"id": ids[key]},
                    ).fetchone()[0]
                    for key in ids
                }
                assert stamps == {
                    "legacy": "modern_sobre",
                    "junk": "modern_sobre",
                    "canonical": "modern_sobre",
                }
                # Aucune ligne orpheline : la FK est posée et valide.
                orphans = conn.execute(
                    text(
                        "SELECT COUNT(*) FROM generated_cvs g LEFT JOIN cv_templates t "
                        "ON g.template_id = t.id WHERE t.id IS NULL"
                    )
                ).fetchone()[0]
                assert orphans == 0
            fks = inspect(engine).get_foreign_keys("generated_cvs")
            assert any(fk["referred_table"] == "cv_templates" for fk in fks)
            # RESTRICT en pratique : un template référencé ne se supprime pas.
            with pytest.raises(Exception, match="fk_generated_cvs_template_id"):
                with engine.begin() as conn:
                    conn.execute(
                        text("DELETE FROM cv_templates WHERE id = 'modern_sobre'")
                    )

            # Down OK : FK, table ET type ENUM disparaissent, les CV restent.
            command.downgrade(cfg, _PRE_T03_REV)
            insp = inspect(engine)
            assert "cv_templates" not in insp.get_table_names()
            assert not any(
                fk["referred_table"] == "cv_templates"
                for fk in insp.get_foreign_keys("generated_cvs")
            )
            with engine.connect() as conn:
                count = conn.execute(
                    text("SELECT COUNT(*) FROM generated_cvs")
                ).fetchone()[0]
                assert count == 3
                enum_left = conn.execute(
                    text("SELECT 1 FROM pg_type WHERE typname = 'templatesector'")
                ).fetchone()
                assert enum_left is None

            # Et le re-upgrade repasse sur la base PEUPLÉE (le cycle générique
            # de M1-T01 ne le voit que sur base vide).
            command.upgrade(cfg, "head")
            with engine.connect() as conn:
                orphans = conn.execute(
                    text(
                        "SELECT COUNT(*) FROM generated_cvs g LEFT JOIN cv_templates t "
                        "ON g.template_id = t.id WHERE t.id IS NULL"
                    )
                ).fetchone()[0]
                assert orphans == 0
        finally:
            engine.dispose()
            if previous is None:
                os.environ.pop("DATABASE_URL", None)
            else:
                os.environ["DATABASE_URL"] = previous


class TestCVTemplateORM:
    async def test_un_template_id_hors_registre_est_refuse(self, test_db):
        # Depuis T03 la validité du stamp est garantie PAR LA BASE (FK), plus
        # par la discipline du code — un id hors registre ne peut plus entrer.
        user = User(email="fk@test.fr", hashed_password="x", email_verified=True)
        test_db.add(user)
        await test_db.flush()
        test_db.add(
            GeneratedCV(
                user_id=user.id,
                cv_name="CV",
                template_id="inconnu_au_registre",
                cv_data_json={},
            )
        )
        with pytest.raises(IntegrityError):
            await test_db.flush()
        await test_db.rollback()

    async def test_le_seed_des_fixtures_porte_le_template_gratuit(self, test_db):
        row = await test_db.get(CVTemplate, "modern_sobre")
        assert row is not None
        assert row.is_free is True
        assert row.sector == "modern"


class TestMigrationSeedM3Templates:
    """M3-T07 — le seed d'activation ajoute corporate_sobre / tech / creatif au
    catalogue data-driven : à `head`, `cv_templates` porte 4 entrées, seul
    `modern_sobre` est gratuit. Le downgrade (un cran) retire les 3 templates
    M3 et laisse `modern_sobre` — migration de données symétrique."""

    _EXPECTED = {
        "modern_sobre": True,
        "corporate_sobre": False,
        "tech": False,
        "creatif": False,
    }

    def test_head_seede_les_4_templates_un_seul_gratuit_et_down_les_retire(
        self, disposable_db_url
    ):
        import os

        from alembic import command

        cfg = _alembic_config()
        previous = os.environ.get("DATABASE_URL")
        os.environ["DATABASE_URL"] = disposable_db_url
        engine = create_engine(sync_db_url(disposable_db_url))
        try:
            command.upgrade(cfg, _M3_SEED_REV)
            with engine.connect() as conn:
                rows = dict(
                    conn.execute(
                        text("SELECT id, is_free FROM cv_templates")
                    ).fetchall()
                )
            # 4 entrées, mapping is_free exact (seul modern_sobre gratuit).
            assert rows == self._EXPECTED

            # Downgrade d'UN cran : les 3 templates M3 disparaissent, le gratuit
            # historique reste (parité avec le seed M1-T03).
            command.downgrade(cfg, "-1")
            with engine.connect() as conn:
                ids = {
                    r[0]
                    for r in conn.execute(
                        text("SELECT id FROM cv_templates")
                    ).fetchall()
                }
            assert ids == {"modern_sobre"}

            # Re-upgrade : de nouveau les 4 (idempotence du cycle).
            command.upgrade(cfg, _M3_SEED_REV)
            with engine.connect() as conn:
                count = conn.execute(
                    text("SELECT COUNT(*) FROM cv_templates")
                ).fetchone()[0]
            assert count == 4
        finally:
            engine.dispose()
            if previous is None:
                os.environ.pop("DATABASE_URL", None)
            else:
                os.environ["DATABASE_URL"] = previous
