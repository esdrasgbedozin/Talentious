"""
M1-T01 — Cycle de migrations `upgrade head → downgrade base → upgrade head`
sur base JETABLE (F-07, fin de jalon M1 : chaque migration doit être réversible).

Exécuté par le job CI `migrations` (ci-build.yml) sur un Postgres éphémère à
chaque PR, et exécutable en local contre une base jetable :

    DATABASE_URL=postgresql+asyncpg://talentious:talentious@localhost:5432/migcheck_local \
        python scripts/check_migrations.py

Garde-fous (le cycle contient un `downgrade base`, DESTRUCTEUR) — cumulés,
aucun ne suffit seul (revue sécurité M1-T01 : un proxy Cloud SQL local rend la
prod joignable sur 127.0.0.1, l'hôte local n'est donc PAS une preuve de base
jetable) :
- `DATABASE_URL` obligatoire, parsé par `make_url` (le MÊME parseur que celui
  qui se connecte — aucun écart de parse exploitable) ;
- aucun paramètre de requête accepté (`?host=`, `?hostaddr=`… écrasent l'hôte
  côté libpq et contourneraient la garde) ;
- hôte dans la liste locale ET nom de base explicitement jetable (contient
  « migcheck » ou commence par « jetable ») — `talentious` est irrecevable,
  même à travers un proxy ;
- refus si la base contient la moindre ligne de données avant le cycle ;
- le rapport imprime la base réellement connectée (leçon DET-CI-DBPROD : un
  contrôle qui ne dit pas où il a regardé a déjà coûté un hotfix).
"""

import os
import re
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool

_BACKEND_DIR = Path(__file__).resolve().parents[1]

# Hôtes considérés comme locaux : loopback et le service compose `db`.
_LOCAL_HOSTS = frozenset({"localhost", "127.0.0.1", "::1", "db"})

# Noms de base reconnus comme JETABLES : `migcheck_<hex>` (tests),
# `talentious_migcheck` (CI), `migcheck_local`/`jetable*` (local).
_DISPOSABLE_NAME_RE = re.compile(r"migcheck|^jetable")


class UnsafeTargetError(ValueError):
    """La cible refuse les gardes « base jetable » : on ne touche à rien."""


class MigrationCycleError(RuntimeError):
    """Le cycle up/down/up n'a pas abouti (état inattendu à une étape)."""


def _check_disposable_url(raw: str | None) -> str:
    """Valide que l'URL cible une base JETABLE locale ; la renvoie telle quelle."""
    if not raw:
        raise UnsafeTargetError(
            "DATABASE_URL requis — et uniquement vers une base JETABLE locale "
            "(le cycle exécute un `downgrade base`)."
        )
    try:
        url = make_url(raw)
    except Exception:
        # Ne JAMAIS reproduire l'URL (elle peut contenir un mot de passe).
        raise UnsafeTargetError(
            "DATABASE_URL illisible (make_url) — refus par précaution."
        ) from None
    if url.query:
        raise UnsafeTargetError(
            f"paramètres de requête refusés ({', '.join(sorted(url.query))}) : "
            "`host=`/`hostaddr=`… écrasent l'hôte côté libpq et contourneraient "
            "la garde d'hôte local."
        )
    if url.host not in _LOCAL_HOSTS:
        # Un '@' BRUT dans le mot de passe fait atterrir sa fin dans url.host
        # (make_url coupe au premier '@') : ne JAMAIS reproduire un tel hôte
        # dans le message — il partirait dans les logs CI.
        shown = (
            "invalide (contient « @ » — mot de passe non URL-encodé ?)"
            if url.host and "@" in url.host
            else f"« {url.host} »"
        )
        raise UnsafeTargetError(
            f"hôte {shown} refusé : seuls les hôtes locaux "
            f"({', '.join(sorted(_LOCAL_HOSTS))}) sont acceptés — ce cycle est "
            "destructeur et réservé aux bases jetables."
        )
    if not url.database or not _DISPOSABLE_NAME_RE.search(url.database):
        raise UnsafeTargetError(
            f"base « {url.database} » refusée : le nom doit être explicitement "
            "jetable (contenir « migcheck » ou commencer par « jetable »). Un "
            "hôte local n'est pas une preuve de base jetable — un proxy Cloud "
            "SQL rend la prod joignable sur 127.0.0.1."
        )
    return raw


def _alembic_config() -> Config:
    # Pas de `set_main_option("sqlalchemy.url", …)` ici : env.py lit
    # DATABASE_URL dans l'environnement (canal unique), et l'interpolation
    # configparser casserait sur un `%` dans le mot de passe.
    cfg = Config(str(_BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(_BACKEND_DIR / "alembic"))
    return cfg


def _current_revision(engine) -> str | None:
    with engine.connect() as conn:
        if not inspect(conn).has_table("alembic_version"):
            return None
        row = conn.execute(text("SELECT version_num FROM alembic_version")).fetchone()
        return row[0] if row else None


def _assert_sans_donnees(engine) -> None:
    """Refuse toute base contenant des LIGNES : jetable = schéma au plus, zéro donnée."""
    preparer = engine.dialect.identifier_preparer
    with engine.connect() as conn:
        for table in inspect(conn).get_table_names():
            if table == "alembic_version":
                continue
            row = conn.execute(
                text(f"SELECT 1 FROM {preparer.quote(table)} LIMIT 1")
            ).fetchone()
            if row is not None:
                raise UnsafeTargetError(
                    f"la table « {table} » contient des données : cette base "
                    "n'est pas jetable, le cycle (downgrade base) est refusé."
                )


def _leftover_objects(engine) -> list[str]:
    """Tables ET types ENUM qui subsistent (hors alembic_version).

    Les types ENUM sont inclus car `drop_table` ne droppe PAS les types créés
    par `sa.Enum` : un downgrade qui les oublie casse le re-upgrade suivant
    (« type already exists ») — c'est le bug réel attrapé à l'écriture de ce
    vérificateur (migration initiale 5d94399568e5). Périmètre : schéma courant,
    tables + ENUM (les séquences des SERIAL tombent avec leurs tables).
    """
    with engine.connect() as conn:
        tables = inspect(conn).get_table_names()
        enums = conn.execute(
            text(
                "SELECT t.typname FROM pg_type t "
                "JOIN pg_namespace n ON n.oid = t.typnamespace "
                "WHERE t.typtype = 'e' AND n.nspname = current_schema()"
            )
        ).fetchall()
    leftovers = [t for t in tables if t != "alembic_version"]
    leftovers += [f"type enum « {row[0]} »" for row in enums]
    return sorted(leftovers)


def run_cycle(database_url: str) -> dict:
    """Exécute up → down → up et renvoie le rapport ; lève MigrationCycleError."""
    url = _check_disposable_url(database_url)
    cfg = _alembic_config()
    head = ScriptDirectory.from_config(cfg).get_current_head()
    database = make_url(url).database

    # env.py (exécuté par chaque commande alembic) lit DATABASE_URL : on le
    # pointe explicitement sur la base validée, puis on restaure.
    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = url
    engine = create_engine(
        url.replace("postgresql+asyncpg://", "postgresql://"), poolclass=NullPool
    )
    try:
        _assert_sans_donnees(engine)

        command.upgrade(cfg, "head")
        after_upgrade = _current_revision(engine)
        if after_upgrade != head:
            raise MigrationCycleError(
                f"après upgrade : révision « {after_upgrade} » ≠ head « {head} »"
            )

        command.downgrade(cfg, "base")
        after_downgrade = _current_revision(engine)
        if after_downgrade is not None:
            raise MigrationCycleError(
                f"après downgrade base : révision résiduelle « {after_downgrade} »"
            )
        leftovers = _leftover_objects(engine)
        if leftovers:
            raise MigrationCycleError(
                "après downgrade base, objets résiduels (downgrade incomplet "
                f"ou base non vierge) : {', '.join(leftovers)}"
            )

        command.upgrade(cfg, "head")
        after_reupgrade = _current_revision(engine)
        if after_reupgrade != head:
            raise MigrationCycleError(
                f"après re-upgrade : révision « {after_reupgrade} » ≠ head « {head} »"
            )
    finally:
        engine.dispose()
        if previous is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous

    return {
        "database": database,
        "head": head,
        "after_upgrade": after_upgrade,
        "after_downgrade": after_downgrade,
        "after_reupgrade": after_reupgrade,
    }


def _main() -> None:
    # Les gardes et l'échec du cycle sortent en message propre ; toute autre
    # exception (connexion, SQL) garde son traceback — utile en CI, et sans
    # secret : la garde n'a laissé passer qu'une base jetable locale.
    try:
        report = run_cycle(os.getenv("DATABASE_URL"))
    except UnsafeTargetError as exc:
        raise SystemExit(f"check_migrations REFUS : {exc}")
    except MigrationCycleError as exc:
        raise SystemExit(f"check_migrations ÉCHEC : {exc}")
    print(
        f"check_migrations OK — base « {report['database']} » : "
        f"upgrade {report['head']} → downgrade base (schéma vide) → "
        f"re-upgrade {report['after_reupgrade']}."
    )


if __name__ == "__main__":
    _main()
