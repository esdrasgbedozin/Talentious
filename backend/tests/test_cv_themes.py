"""
M1-T04 — Table `cv_themes` (presets système immuables) + seed `anthracite`
+ FK `cv_templates.default_theme_id → cv_themes.id` posée dans la MÊME
migration, APRÈS vérification que tout thème référencé existe (condition
revue data M1-T03 : le seed T03 référence déjà `anthracite` sans FK).

Garanties vérifiées ici :
- le preset `anthracite` est seedé gratuit, avec les tokens EXACTS de
  `DEFAULT_CV_THEME_TOKENS` (packages/cv-render/src/theme.ts) — la base et le
  package de rendu doivent décrire le même thème (D2) ;
- la FK est posée et RESTRICT en pratique : supprimer un preset référencé est
  refusé ;
- le garde-fou pré-FK : si un template référence un thème HORS registre,
  l'upgrade échoue avec un message explicite (pas de backfill silencieux —
  contrairement à T03, `cv_templates` est géré par migrations : une valeur
  inconnue est un bug de seed, pas une donnée utilisateur à assainir) ;
- le downgrade retire FK et table (aucun ENUM ici), les templates survivent,
  et le re-upgrade repasse sur la base peuplée ;
- côté ORM : un `default_theme_id` hors registre est refusé par la base.
"""

import re
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from app.models import CVTheme
from scripts.check_migrations import _alembic_config
from tests.conftest import sync_db_url

_PRE_T04_REV = "c8d9e0f1a2b3"  # head juste avant cv_themes (cv_templates)

# Mêmes valeurs que DEFAULT_CV_THEME_TOKENS (theme.ts) : dupliquées à dessein
# (une migration est un instantané figé) — l'alignement RÉEL avec theme.ts est
# prouvé par TestAlignementThemeTs, qui lit le fichier source.
_ANTHRACITE_TOKENS = {
    "color_accent": "#2D3748",
    "color_text": "#1A202C",
    "color_muted": "#4A5568",
    "color_background": "#FFFFFF",
    "font_heading": "Inter",
    "font_body": "Inter",
}


class TestAlignementThemeTs:
    def test_les_tokens_anthracite_sont_alignes_sur_theme_ts(self):
        """La base (seed migration) et le rendu (theme.ts) décrivent le MÊME
        thème par défaut (D2). Ce test lit la source TypeScript : toute dérive
        de l'une des deux copies casse la suite (relevé revue data M1-T04 —
        avant lui, l'alignement était affirmé mais pas vérifié)."""
        theme_ts = (
            Path(__file__).parents[2] / "packages" / "cv-render" / "src" / "theme.ts"
        )
        source = theme_ts.read_text(encoding="utf-8")
        block = re.search(
            r"DEFAULT_CV_THEME_TOKENS\s*:\s*CVThemeTokens\s*=\s*\{(.*?)\}",
            source,
            re.S,
        )
        assert block is not None, "DEFAULT_CV_THEME_TOKENS introuvable dans theme.ts"
        parsed = dict(re.findall(r"(\w+)\s*:\s*'([^']*)'", block.group(1)))
        assert parsed == _ANTHRACITE_TOKENS


class TestMigrationCvThemes:
    def test_seed_anthracite_fk_restrict_et_down_ok(self, disposable_db_url):
        import os

        from alembic import command

        cfg = _alembic_config()
        previous = os.environ.get("DATABASE_URL")
        os.environ["DATABASE_URL"] = disposable_db_url
        engine = create_engine(sync_db_url(disposable_db_url))
        try:
            # Base au schéma T03 : cv_templates existe, modern_sobre référence
            # déjà 'anthracite' SANS FK (l'état réel de la prod avant T04).
            command.upgrade(cfg, _PRE_T04_REV)
            # Cas légitime : un template SANS thème par défaut (colonne
            # nullable) — le garde-fou pré-FK doit l'ignorer (revue data D).
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "INSERT INTO cv_templates "
                        "(id, name, sector, is_free, description, preview_url, "
                        "default_theme_id) VALUES ('sans_theme', 'Sans thème', "
                        "'tech', false, 'x', 'https://talentious.app/x.png', NULL)"
                    )
                )

            command.upgrade(cfg, "head")

            with engine.connect() as conn:
                row = conn.execute(
                    text(
                        "SELECT name, is_free, tokens FROM cv_themes "
                        "WHERE id = 'anthracite'"
                    )
                ).fetchone()
                assert row is not None
                assert row[0] == "Anthracite"
                assert row[1] is True
                assert row[2] == _ANTHRACITE_TOKENS
            fks = inspect(engine).get_foreign_keys("cv_templates")
            assert any(fk["referred_table"] == "cv_themes" for fk in fks)
            # La règle est bien RESTRICT ('r') — un refus de DELETE seul ne la
            # distinguerait pas de NO ACTION (revue data C).
            with engine.connect() as conn:
                deltype = conn.execute(
                    text(
                        "SELECT confdeltype FROM pg_constraint "
                        "WHERE conname = 'fk_cv_templates_default_theme_id'"
                    )
                ).fetchone()
                assert deltype is not None and deltype[0] == "r"
            # RESTRICT en pratique : un preset référencé ne se supprime pas.
            with pytest.raises(Exception, match="fk_cv_templates_default_theme_id"):
                with engine.begin() as conn:
                    conn.execute(text("DELETE FROM cv_themes WHERE id = 'anthracite'"))

            # Down OK : FK et table disparaissent, les templates restent.
            command.downgrade(cfg, _PRE_T04_REV)
            insp = inspect(engine)
            assert "cv_themes" not in insp.get_table_names()
            assert not any(
                fk["referred_table"] == "cv_themes"
                for fk in insp.get_foreign_keys("cv_templates")
            )
            with engine.connect() as conn:
                stamp = conn.execute(
                    text(
                        "SELECT default_theme_id FROM cv_templates "
                        "WHERE id = 'modern_sobre'"
                    )
                ).fetchone()
                assert stamp is not None and stamp[0] == "anthracite"

            # Re-upgrade sur base peuplée (le cycle M1-T01 ne le joue qu'à vide).
            command.upgrade(cfg, "head")
            with engine.connect() as conn:
                orphans = conn.execute(
                    text(
                        "SELECT COUNT(*) FROM cv_templates t LEFT JOIN cv_themes th "
                        "ON t.default_theme_id = th.id "
                        "WHERE t.default_theme_id IS NOT NULL AND th.id IS NULL"
                    )
                ).fetchone()[0]
                assert orphans == 0
        finally:
            engine.dispose()
            if previous is None:
                os.environ.pop("DATABASE_URL", None)
            else:
                os.environ["DATABASE_URL"] = previous

    def test_un_theme_reference_inconnu_fait_echouer_l_upgrade(self, disposable_db_url):
        """Garde-fou pré-FK : thème référencé hors registre = échec EXPLICITE.

        Pas de backfill silencieux ici : cv_templates est une table de registre
        gérée par migrations — une référence inconnue est un bug de seed à
        corriger, pas une donnée à assainir.
        """
        import os

        from alembic import command

        cfg = _alembic_config()
        previous = os.environ.get("DATABASE_URL")
        os.environ["DATABASE_URL"] = disposable_db_url
        engine = create_engine(sync_db_url(disposable_db_url))
        try:
            command.upgrade(cfg, _PRE_T04_REV)
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "INSERT INTO cv_templates "
                        "(id, name, sector, is_free, description, preview_url, "
                        "default_theme_id) VALUES ('fantome', 'Fantôme', 'tech', "
                        "false, 'x', 'https://talentious.app/x.png', "
                        "'theme_inexistant')"
                    )
                )

            # Match sur « hors registre » (le message du GARDE-FOU) et pas
            # seulement sur la valeur : l'erreur FK brute de Postgres citerait
            # elle aussi 'theme_inexistant' — on prouve ici que l'échec vient
            # bien de la vérification explicite, message actionnable inclus.
            with pytest.raises(Exception, match="hors registre.*theme_inexistant"):
                command.upgrade(cfg, "head")

            # L'échec est transactionnel : la base reste au schéma T03.
            assert "cv_themes" not in inspect(engine).get_table_names()
        finally:
            engine.dispose()
            if previous is None:
                os.environ.pop("DATABASE_URL", None)
            else:
                os.environ["DATABASE_URL"] = previous


class TestCVThemeORM:
    async def test_un_default_theme_id_hors_registre_est_refuse(self, test_db):
        from app.models import CVTemplate

        test_db.add(
            CVTemplate(
                id="t_orphelin",
                name="Orphelin",
                sector="tech",
                description="x",
                preview_url="https://talentious.app/x.png",
                default_theme_id="theme_inconnu",
            )
        )
        with pytest.raises(IntegrityError):
            await test_db.flush()
        await test_db.rollback()

    async def test_le_seed_des_fixtures_porte_le_preset_gratuit(self, test_db):
        row = await test_db.get(CVTheme, "anthracite")
        assert row is not None
        assert row.is_free is True
        assert row.tokens == _ANTHRACITE_TOKENS
