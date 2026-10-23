"""
M1-T06 — `cv_jobs.job_type` + unicité par (user, job_type) (ADR-JOBS).

Les jobs se généralisent (contrat `JobType` : `cv_generation`,
`letter_generation`, `export`, `review`) : l'index partiel « un job actif par
user » (c2a3b4d5e6f7) devient « un job actif par (user, job_type) » — sinon un
export en cours interdirait de lancer une lettre.

Critère du ticket : deux jobs actifs de types différents OK ; même type ⇒
conflit.

Garanties vérifiées ici :
- le stock V1 est backfillé `cv_generation` par server_default (metadata-only,
  aucun UPDATE — tous les jobs existants SONT des générations de CV) ;
- l'ancien index disparaît, le nouveau est UNIQUE, PARTIEL (statuts actifs
  seulement) et porte (user_id, job_type) ;
- deux jobs actifs de types différents coexistent ; un doublon actif du même
  type est refusé par la base ; un job terminé ne bloque rien (index partiel) ;
- un `job_type` hors contrat est refusé par le type ENUM ;
- le downgrade restaure l'ancien index et retire colonne + ENUM `jobtype`,
  le re-upgrade repasse sur base peuplée ;
- côté ORM et route : une écriture « code V1 » (sans `job_type`) reçoit le
  défaut, et un job actif d'un AUTRE type ne déclenche plus le 409 de
  `POST /cv/generate`.
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import false as sa_false
from sqlalchemy import inspect, text
from sqlalchemy.exc import DataError, IntegrityError

from app.models import CVJob, JobStatus, JobType
from tests.test_generated_cvs_envelope import _restore_env, _upgrade_ctx

_PRE_T06_REV = "e0f1a2b3c4d5"  # head juste avant (enveloppe de la Variante)

VALID_OFFER = (
    "We are hiring a senior backend engineer with strong Python and FastAPI skills. "
    * 2
)


def _seed_pre_t06(engine) -> dict:
    """Base au schéma T05, peuplée : 2 users, 3 jobs V1 (dont 1 terminé)."""
    ids = {
        "user_a": uuid.uuid4(),
        "user_b": uuid.uuid4(),
        "job_a_done": uuid.uuid4(),
        "job_a_queued": uuid.uuid4(),
        "job_b_running": uuid.uuid4(),
    }
    now = datetime(2026, 1, 1)
    with engine.begin() as conn:
        for key in ("user_a", "user_b"):
            conn.execute(
                text(
                    "INSERT INTO users (id, email, hashed_password, role, created_at) "
                    "VALUES (:id, :email, 'x', 'user', :now)"
                ),
                {"id": ids[key], "email": f"{key}@test.fr", "now": now},
            )
        for key, user, status in (
            ("job_a_done", "user_a", "succeeded"),
            ("job_a_queued", "user_a", "queued"),
            ("job_b_running", "user_b", "running"),
        ):
            conn.execute(
                text(
                    "INSERT INTO cv_jobs (id, user_id, status, cv_name, "
                    "created_at, updated_at) VALUES (:id, :uid, :status, "
                    ":name, :now, :now)"
                ),
                {
                    "id": ids[key],
                    "uid": ids[user],
                    "status": status,
                    "name": f"CV {key}",
                    "now": now,
                },
            )
    return ids


def _index_defs(engine) -> dict:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'cv_jobs'"
            )
        ).fetchall()
    return {row[0]: row[1] for row in rows}


def _insert_job(engine, user_id, status, job_type) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO cv_jobs (id, user_id, status, job_type, cv_name, "
                "created_at, updated_at) VALUES (:id, :uid, :status, :jt, "
                "'x', :now, :now)"
            ),
            {
                "id": uuid.uuid4(),
                "uid": user_id,
                "status": status,
                "jt": job_type,
                "now": datetime(2026, 1, 2),
            },
        )


class TestMigrationJobType:
    def test_backfill_cv_generation_et_cycle(self, disposable_db_url):
        os, command, cfg, previous, engine = _upgrade_ctx(disposable_db_url)
        try:
            command.upgrade(cfg, _PRE_T06_REV)
            _seed_pre_t06(engine)

            command.upgrade(cfg, "head")

            # Backfill : tout le stock V1 est une génération de CV.
            with engine.connect() as conn:
                types = conn.execute(
                    text("SELECT DISTINCT job_type FROM cv_jobs")
                ).fetchall()
            assert types == [("cv_generation",)]

            # L'ancien index a disparu ; le nouveau est UNIQUE, PARTIEL et
            # porte le couple (user_id, job_type).
            defs = _index_defs(engine)
            assert "uq_cv_jobs_one_active_per_user" not in defs
            new_def = defs["uq_cv_jobs_one_active_per_user_type"]
            assert "UNIQUE" in new_def
            assert "user_id, job_type" in new_def
            assert "WHERE" in new_def

            # Downgrade : colonne et ENUM retirés, ancien index restauré.
            command.downgrade(cfg, _PRE_T06_REV)
            insp = inspect(engine)
            cols = {c["name"] for c in insp.get_columns("cv_jobs")}
            assert "job_type" not in cols
            with engine.connect() as conn:
                enum_left = conn.execute(
                    text("SELECT 1 FROM pg_type WHERE typname = 'jobtype'")
                ).fetchone()
            assert enum_left is None
            defs = _index_defs(engine)
            assert "uq_cv_jobs_one_active_per_user_type" not in defs
            assert "uq_cv_jobs_one_active_per_user" in defs

            # Re-upgrade sur base peuplée.
            command.upgrade(cfg, "head")
            assert "uq_cv_jobs_one_active_per_user_type" in _index_defs(engine)
        finally:
            engine.dispose()
            _restore_env(os, previous)

    def test_unicite_par_user_et_type(self, disposable_db_url):
        """CRITÈRE : deux jobs actifs de types différents OK ; même type ⇒
        conflit — et un job terminé ne bloque rien (index partiel)."""
        os, command, cfg, previous, engine = _upgrade_ctx(disposable_db_url)
        try:
            command.upgrade(cfg, _PRE_T06_REV)
            ids = _seed_pre_t06(engine)
            command.upgrade(cfg, "head")

            # user_a a déjà un cv_generation actif (queued) : un export actif
            # coexiste (types différents), puis un review aussi.
            _insert_job(engine, ids["user_a"], "queued", "export")
            _insert_job(engine, ids["user_a"], "running", "review")

            # Doublon actif du MÊME type : refusé par la base.
            with pytest.raises(
                IntegrityError, match="uq_cv_jobs_one_active_per_user_type"
            ):
                _insert_job(engine, ids["user_a"], "queued", "cv_generation")
            with pytest.raises(
                IntegrityError, match="uq_cv_jobs_one_active_per_user_type"
            ):
                _insert_job(engine, ids["user_a"], "running", "export")

            # Un job TERMINÉ du même type ne bloque pas (index partiel) :
            # user_b termine sa génération puis en relance une.
            with engine.begin() as conn:
                conn.execute(
                    text("UPDATE cv_jobs SET status = 'succeeded' WHERE id = :id"),
                    {"id": ids["job_b_running"]},
                )
            _insert_job(engine, ids["user_b"], "queued", "cv_generation")

            # L'unicité est PAR USER : user_b peut avoir un export actif
            # alors que user_a en a déjà un.
            _insert_job(engine, ids["user_b"], "queued", "export")

            # Un type hors contrat est refusé par le type ENUM.
            with pytest.raises(DataError, match="jobtype"):
                _insert_job(engine, ids["user_b"], "queued", "telepathy")
        finally:
            engine.dispose()
            _restore_env(os, previous)


class TestMigrationJobTypeDowngrade:
    def test_le_downgrade_echoue_si_plusieurs_types_actifs(self, disposable_db_url):
        """Échec ASSUMÉ (docstring + runbook, revue data 8) : l'ancien index
        « un actif par user » ne peut pas se poser si un user a deux jobs
        actifs de types différents — et la transaction unique annule TOUT
        (version Alembic et index inchangés), jamais de suppression
        silencieuse."""
        os, command, cfg, previous, engine = _upgrade_ctx(disposable_db_url)
        try:
            command.upgrade(cfg, _PRE_T06_REV)
            ids = _seed_pre_t06(engine)
            command.upgrade(cfg, "head")
            # user_a : cv_generation actif (seed) + export actif.
            _insert_job(engine, ids["user_a"], "queued", "export")

            with pytest.raises(Exception, match="uq_cv_jobs_one_active_per_user"):
                command.downgrade(cfg, _PRE_T06_REV)

            # Transaction unique : rien n'a bougé.
            with engine.connect() as conn:
                version = conn.execute(
                    text("SELECT version_num FROM alembic_version")
                ).scalar()
            assert version == "f1a2b3c4d5e6"
            defs = _index_defs(engine)
            assert "uq_cv_jobs_one_active_per_user_type" in defs
            assert "uq_cv_jobs_one_active_per_user" not in defs
        finally:
            engine.dispose()
            _restore_env(os, previous)


class TestORMJobType:
    async def test_une_ecriture_sql_sans_job_type_recoit_le_defaut_de_la_base(
        self, test_db, test_user
    ):
        """Rétro-compat rollout : le code N-1 ignore `job_type` ET n'a pas le
        default Python du modèle N — INSERT SQL brut sans la colonne, c'est la
        BASE qui pose `cv_generation` (server_default), pas l'ORM (revue
        data 11)."""
        job_id = uuid.uuid4()
        now = datetime(2026, 1, 1, tzinfo=timezone.utc)
        await test_db.execute(
            text(
                "INSERT INTO cv_jobs (id, user_id, status, cv_name, "
                "created_at, updated_at) VALUES (:id, :uid, 'queued', "
                "'CV V1', :now, :now)"
            ),
            {"id": job_id, "uid": test_user.id, "now": now},
        )
        row = (
            await test_db.execute(
                text("SELECT job_type FROM cv_jobs WHERE id = :id"),
                {"id": job_id},
            )
        ).fetchone()
        assert row[0] == "cv_generation"


class TestConflictFilter:
    def test_seule_la_contrainte_d_unicite_donne_un_409(self):
        """Le catch du 409 filtre sur le NOM de la contrainte (revue data 6) :
        toute autre IntegrityError (FK user supprimé, NOT NULL…) doit
        remonter, pas se déguiser en « génération en cours »."""
        from app.routes.cv import _is_active_job_conflict

        def exc(msg: str) -> IntegrityError:
            return IntegrityError("INSERT INTO cv_jobs …", {}, Exception(msg))

        assert _is_active_job_conflict(
            exc(
                "duplicate key value violates unique constraint "
                '"uq_cv_jobs_one_active_per_user_type"'
            )
        )
        assert not _is_active_job_conflict(
            exc(
                'insert or update on table "cv_jobs" violates foreign key '
                'constraint "cv_jobs_user_id_fkey"'
            )
        )


class TestRouteJobType:
    async def test_un_job_actif_d_un_autre_type_ne_bloque_pas_la_generation(
        self, client, admin_headers, admin_user, test_db, monkeypatch
    ):
        """Le 409 d'idempotence s'applique PAR TYPE (contrat `JobType`) : un
        export en cours n'interdit pas de lancer une génération de CV."""
        monkeypatch.setattr("app.routes.cv.run_cv_generation", AsyncMock())

        existing = CVJob(
            user_id=admin_user.id,
            cv_name="export en cours",
            status=JobStatus.RUNNING,
            job_type=JobType.EXPORT,
        )
        test_db.add(existing)
        await test_db.commit()

        response = await client.post(
            "/cv/generate",
            headers=admin_headers,
            json={"cv_name": "pendant l'export", "offer_text": VALID_OFFER},
        )
        assert response.status_code == 202

    async def test_la_course_est_arretee_par_l_index_et_renvoie_409(
        self, client, admin_headers, admin_user, test_db, monkeypatch
    ):
        """Chemin « course » (revue data 7) : deux lancements concurrents du
        même type — le pre-check de la seconde requête ne voit rien (on
        l'aveugle), c'est l'INDEX qui refuse à l'INSERT, et le catch filtré
        doit quand même rendre un 409 propre (pas un 500)."""
        import app.routes.cv as cv_routes

        monkeypatch.setattr(cv_routes, "run_cv_generation", AsyncMock())

        existing = CVJob(
            user_id=admin_user.id,
            cv_name="génération en cours",
            status=JobStatus.RUNNING,
            job_type=JobType.CV_GENERATION,
        )
        test_db.add(existing)
        await test_db.commit()

        real_select = cv_routes.select

        def blind_to_jobs(*args, **kwargs):
            stmt = real_select(*args, **kwargs)
            if args and args[0] is CVJob:
                stmt = stmt.where(sa_false())
            return stmt

        monkeypatch.setattr(cv_routes, "select", blind_to_jobs)

        response = await client.post(
            "/cv/generate",
            headers=admin_headers,
            json={"cv_name": "course perdue", "offer_text": VALID_OFFER},
        )
        assert response.status_code == 409
        assert response.headers["content-type"].startswith("application/problem+json")
