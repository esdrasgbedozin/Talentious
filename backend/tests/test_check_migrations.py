"""
M1-T01 — Vérificateur de cycle de migrations `upgrade head → downgrade base →
upgrade head` sur base JETABLE (job CI de garde avant merge, F-07).

Garanties vérifiées ici :
- le cycle complet passe sur une base vierge et le rapport IMPRIME la base
  réellement connectée (leçon DET-CI-DBPROD : le contrôle qui ne dit pas où il
  a regardé a déjà coûté un hotfix) ;
- le vérificateur REFUSE de tourner sans `DATABASE_URL` et refuse tout hôte
  non local : il exécute un `downgrade base` (destructeur) — il ne doit jamais
  pouvoir être pointé sur la prod, même par accident ;
- un downgrade qui FUIT (laisse des tables derrière lui) est détecté : après
  `downgrade base`, le schéma doit être vide hors `alembic_version`.

Nécessite Postgres (même serveur que TEST_DATABASE_URL) ; le test crée sa
propre base jetable — le cycle Alembic ne touche jamais `talentious_test`.
"""

import os
import subprocess
import sys
import uuid
from pathlib import Path

import psycopg2
import pytest

from scripts.check_migrations import (
    MigrationCycleError,
    UnsafeTargetError,
    _check_disposable_url,
    run_cycle,
)

TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://talentious:talentious@localhost:5432/talentious_test",
)


def _sync_url(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://")


@pytest.fixture()
def disposable_db_url():
    """Base jetable sur le serveur de test : créée vierge, détruite après."""
    name = f"migcheck_{uuid.uuid4().hex[:12]}"
    admin = psycopg2.connect(_sync_url(TEST_DATABASE_URL))
    admin.autocommit = True
    try:
        with admin.cursor() as cur:
            cur.execute(f'CREATE DATABASE "{name}"')
        base, _, _ = TEST_DATABASE_URL.rpartition("/")
        yield f"{base}/{name}"
        with admin.cursor() as cur:
            # Déloger toute connexion restante avant le DROP.
            cur.execute(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity "
                "WHERE datname = %s AND pid <> pg_backend_pid()",
                (name,),
            )
            cur.execute(f'DROP DATABASE "{name}"')
    finally:
        admin.close()


class TestGardeFousURL:
    def test_refuse_url_absente(self):
        with pytest.raises(ValueError, match="DATABASE_URL"):
            _check_disposable_url(None)

    def test_refuse_url_vide(self):
        with pytest.raises(ValueError, match="DATABASE_URL"):
            _check_disposable_url("")

    def test_refuse_hote_distant_sans_fuiter_le_mot_de_passe(self):
        # Le cycle contient un `downgrade base` : tout hôte non local est
        # refusé AVANT la moindre connexion — et le message de refus (destiné
        # aux logs CI) ne doit JAMAIS contenir le mot de passe de l'URL.
        with pytest.raises(UnsafeTargetError, match="10.1.2.3") as exc_info:
            _check_disposable_url(
                "postgresql+asyncpg://u:motdepasse-secret@10.1.2.3:5432/migcheck_x"
            )
        assert "motdepasse-secret" not in str(exc_info.value)

    def test_refuse_un_sous_domaine_qui_commence_par_localhost(self):
        with pytest.raises(UnsafeTargetError, match="localhost.evil.com"):
            _check_disposable_url(
                "postgresql+asyncpg://u:p@localhost.evil.com:5432/migcheck_x"
            )

    def test_refuse_les_parametres_de_requete(self):
        # `?host=`/`?hostaddr=` écrasent l'hôte côté libpq : une URL « localhost »
        # peut en réalité viser un hôte distant. Toute requête est refusée.
        with pytest.raises(UnsafeTargetError, match="host"):
            _check_disposable_url(
                "postgresql+asyncpg://u:p@localhost:5432/migcheck_x?host=10.1.2.3"
            )

    def test_refuse_un_nom_de_base_non_jetable_meme_local(self):
        # La prod est joignable sur 127.0.0.1 dès qu'un Cloud SQL proxy tourne
        # (revue sécurité M1-T01) : l'hôte local ne suffit pas, le NOM de la
        # base doit être explicitement jetable — `talentious` est irrecevable.
        with pytest.raises(UnsafeTargetError, match="talentious"):
            _check_disposable_url("postgresql+asyncpg://u:p@127.0.0.1:5433/talentious")

    def test_accepte_les_hotes_locaux_et_noms_jetables(self):
        for host in ("localhost", "127.0.0.1", "db", "[::1]"):
            _check_disposable_url(f"postgresql+asyncpg://u:p@{host}:5432/jetable")
            _check_disposable_url(
                f"postgresql+asyncpg://u:p@{host}:5432/talentious_migcheck"
            )

    def test_mot_de_passe_avec_arobase_brut_refuse_encode_accepte(self):
        # make_url (le MÊME parseur que celui qui se connecte) coupe au PREMIER
        # '@' : un mot de passe contenant un '@' BRUT donne un hôte farfelu
        # (`ss@localhost`) → refus, direction sûre. La forme correcte est
        # l'URL-encodage (`%40`), qui passe.
        with pytest.raises(UnsafeTargetError, match="refusé"):
            _check_disposable_url(
                "postgresql+asyncpg://u:p@ss@localhost:5432/migcheck_x"
            )
        _check_disposable_url("postgresql+asyncpg://u:p%40ss@localhost:5432/migcheck_x")


class TestCycleUpDownUp:
    def test_cycle_complet_sur_base_vierge(self, disposable_db_url):
        report = run_cycle(disposable_db_url)
        # Le rapport dit OÙ il a regardé (DET-CI-DBPROD) et atteste le cycle.
        assert report["database"] == disposable_db_url.rpartition("/")[2]
        assert report["head"]
        assert report["after_upgrade"] == report["head"]
        assert report["after_downgrade"] is None
        assert report["after_reupgrade"] == report["head"]
        # À l'issue du cycle la base est à head : les tables applicatives existent.
        with psycopg2.connect(_sync_url(disposable_db_url)) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT version_num FROM alembic_version")
                assert cur.fetchone()[0] == report["head"]

    def test_downgrade_qui_fuit_est_detecte(self, disposable_db_url):
        # Une table étrangère aux migrations simule un downgrade incomplet :
        # après `downgrade base` elle subsiste → le vérificateur doit ÉCHOUER
        # (c'est la garde qui attraperait un `def downgrade(): pass`).
        with psycopg2.connect(_sync_url(disposable_db_url)) as conn:
            with conn.cursor() as cur:
                cur.execute("CREATE TABLE zombie (id int)")
            conn.commit()
        with pytest.raises(MigrationCycleError, match="zombie"):
            run_cycle(disposable_db_url)

    def test_downgrade_qui_fuit_un_type_enum_est_detecte(self, disposable_db_url):
        # Le bug réel attrapé par ce vérificateur : un downgrade qui droppe les
        # tables mais pas les types ENUM (cas de la migration initiale avant
        # correction). Un type étranger qui subsiste après `downgrade base`
        # doit faire échouer le cycle, comme une table.
        with psycopg2.connect(_sync_url(disposable_db_url)) as conn:
            with conn.cursor() as cur:
                cur.execute("CREATE TYPE zombie_enum AS ENUM ('a', 'b')")
            conn.commit()
        with pytest.raises(MigrationCycleError, match="zombie_enum"):
            run_cycle(disposable_db_url)

    def test_refuse_une_base_contenant_des_donnees(self, disposable_db_url):
        # Défense en profondeur : même une base au nom jetable est refusée si
        # elle contient la moindre LIGNE — jetable = schéma au plus, zéro donnée.
        with psycopg2.connect(_sync_url(disposable_db_url)) as conn:
            with conn.cursor() as cur:
                cur.execute("CREATE TABLE precieuse (id int)")
                cur.execute("INSERT INTO precieuse VALUES (1)")
            conn.commit()
        with pytest.raises(UnsafeTargetError, match="precieuse"):
            run_cycle(disposable_db_url)


class TestCLI:
    """Le point d'entrée exact du job CI : `python scripts/check_migrations.py`."""

    def test_rapport_ok_nomme_la_base(self, disposable_db_url):
        env = dict(os.environ, DATABASE_URL=disposable_db_url)
        result = subprocess.run(
            [sys.executable, "scripts/check_migrations.py"],
            env=env,
            capture_output=True,
            text=True,
            cwd=Path(__file__).resolve().parents[1],
        )
        assert result.returncode == 0, result.stderr
        # Le rapport nomme la base réellement contrôlée (DET-CI-DBPROD).
        assert disposable_db_url.rpartition("/")[2] in result.stdout
        assert "OK" in result.stdout

    def test_sans_database_url_sort_en_erreur_sans_traceback(self):
        env = {k: v for k, v in os.environ.items() if k != "DATABASE_URL"}
        result = subprocess.run(
            [sys.executable, "scripts/check_migrations.py"],
            env=env,
            capture_output=True,
            text=True,
            cwd=Path(__file__).resolve().parents[1],
        )
        assert result.returncode != 0
        assert "DATABASE_URL" in result.stderr
        assert "Traceback" not in result.stderr
