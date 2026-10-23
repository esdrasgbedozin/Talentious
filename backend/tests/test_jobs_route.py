"""
M1-T15 — `GET /jobs/{id}` unifié (tous `job_type`) + compat `/cv/jobs/{id}`.

Critères du ticket : schéma `JobStatus` du contrat pour `cv_generation` ;
l'ancien endpoint reste inchangé (alias déprécié, réservé aux jobs
`cv_generation` — un job d'un autre type y répond 404, contrat).

Garanties testées :
- conformité par validation contre le modèle GÉNÉRÉ `JobStatus` à chaque
  statut du cycle de vie ;
- champs conditionnels du contrat : `progress_pct` seulement en `running`,
  `result` seulement en `succeeded` (kind `cv`, id = cv généré),
  `error_message` seulement en `failed` ;
- tous types : un job `export` se lit sur `/jobs/{id}` mais répond 404 sur
  l'alias `/cv/jobs/{id}` ;
- 401 sans auth, 404 inconnu, 403 job d'autrui (contrat).
"""

import uuid

from app.generated.models import JobStatus as JobStatusContract
from app.models import CVJob, GeneratedCV, JobStatus, JobType


async def _seed_job(test_db, user, **overrides) -> CVJob:
    overrides.setdefault("status", JobStatus.QUEUED)
    job = CVJob(user_id=user.id, cv_name="CV", **overrides)
    test_db.add(job)
    await test_db.commit()
    await test_db.refresh(job)
    return job


class TestAcces:
    async def test_sans_auth_401(self, client):
        response = await client.get(f"/jobs/{uuid.uuid4()}")
        assert response.status_code == 401

    async def test_inconnu_404(self, client, auth_headers):
        response = await client.get(f"/jobs/{uuid.uuid4()}", headers=auth_headers)
        assert response.status_code == 404

    async def test_job_d_autrui_403(self, client, auth_headers, test_db, admin_user):
        job = await _seed_job(test_db, admin_user)
        response = await client.get(f"/jobs/{job.id}", headers=auth_headers)
        assert response.status_code == 403


class TestCycleDeVie:
    async def test_queued_conforme_sans_champs_conditionnels(
        self, client, auth_headers, test_db, test_user
    ):
        job = await _seed_job(test_db, test_user)
        response = await client.get(f"/jobs/{job.id}", headers=auth_headers)
        assert response.status_code == 200
        parsed = JobStatusContract.model_validate(response.json())
        assert parsed.job_type.value == "cv_generation"
        assert parsed.status.value == "queued"
        assert parsed.progress_pct is None  # running seulement (contrat)
        assert parsed.result is None
        assert parsed.error_message is None

    async def test_running_porte_la_progression(
        self, client, auth_headers, test_db, test_user
    ):
        job = await _seed_job(
            test_db, test_user, status=JobStatus.RUNNING, progress_pct=55
        )
        response = await client.get(f"/jobs/{job.id}", headers=auth_headers)
        parsed = JobStatusContract.model_validate(response.json())
        assert parsed.status.value == "running"
        assert parsed.progress_pct == 55

    async def test_succeeded_porte_le_result_cv(
        self, client, auth_headers, test_db, test_user
    ):
        cv = GeneratedCV(
            user_id=test_user.id,
            cv_name="CV",
            template_id="modern_sobre",
            cv_data_json={"summary": "x"},
        )
        test_db.add(cv)
        await test_db.flush()
        job = await _seed_job(
            test_db,
            test_user,
            status=JobStatus.SUCCEEDED,
            progress_pct=100,
            cv_id=cv.id,
        )
        response = await client.get(f"/jobs/{job.id}", headers=auth_headers)
        parsed = JobStatusContract.model_validate(response.json())
        assert parsed.status.value == "succeeded"
        assert parsed.result is not None
        assert parsed.result.result_kind.value == "cv"
        assert parsed.result.result_id == cv.id
        assert parsed.progress_pct is None  # terminé : plus de progression

    async def test_failed_porte_le_message_generique(
        self, client, auth_headers, test_db, test_user
    ):
        job = await _seed_job(
            test_db,
            test_user,
            status=JobStatus.FAILED,
            error_message="Job failed. Please try again.",
        )
        response = await client.get(f"/jobs/{job.id}", headers=auth_headers)
        parsed = JobStatusContract.model_validate(response.json())
        assert parsed.status.value == "failed"
        assert parsed.error_message == "Job failed. Please try again."
        assert parsed.result is None


class TestTousTypesEtAlias:
    async def test_un_job_export_se_lit_sur_jobs_mais_404_sur_l_alias(
        self, client, auth_headers, test_db, test_user
    ):
        """Le endpoint unifié couvre TOUS les types ; l'alias déprécié
        `/cv/jobs/{id}` ne couvre que `cv_generation` (contrat : un job
        d'un autre type y répond 404)."""
        job = await _seed_job(test_db, test_user, job_type=JobType.EXPORT)

        response = await client.get(f"/jobs/{job.id}", headers=auth_headers)
        assert response.status_code == 200
        parsed = JobStatusContract.model_validate(response.json())
        assert parsed.job_type.value == "export"

        response = await client.get(f"/cv/jobs/{job.id}", headers=auth_headers)
        assert response.status_code == 404

    async def test_le_sse_est_aussi_reserve_a_cv_generation(
        self, client, auth_headers, test_db, test_user
    ):
        """Revue pt 1 : le flux SSE est réservé aux jobs cv_generation
        (contrat) — un job export y répond 404 comme sur l'alias."""
        job = await _seed_job(test_db, test_user, job_type=JobType.EXPORT)
        response = await client.get(f"/cv/jobs/{job.id}/events", headers=auth_headers)
        assert response.status_code == 404

    async def test_succeeded_sans_cv_id_rend_200_sans_result(
        self, client, auth_headers, test_db, test_user
    ):
        """Revue pt 3 : données corrompues (impossible via le worker) —
        comportement FIGÉ : 200 sans `result`, loggé, jamais un 500 qui
        coincerait le polling."""
        job = await _seed_job(
            test_db, test_user, status=JobStatus.SUCCEEDED, cv_id=None
        )
        response = await client.get(f"/jobs/{job.id}", headers=auth_headers)
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "succeeded"
        assert "result" not in body

    async def test_admin_lit_le_job_d_autrui(
        self, client, admin_headers, test_db, test_user
    ):
        """Branche admin de la règle d'ownership partagée."""
        job = await _seed_job(test_db, test_user)
        response = await client.get(f"/jobs/{job.id}", headers=admin_headers)
        assert response.status_code == 200

    async def test_progress_zero_en_running_n_est_pas_omis(
        self, client, auth_headers, test_db, test_user
    ):
        """Revue pt 4 : exclude_none ne doit pas avaler un 0 légitime."""
        job = await _seed_job(
            test_db, test_user, status=JobStatus.RUNNING, progress_pct=0
        )
        response = await client.get(f"/jobs/{job.id}", headers=auth_headers)
        assert response.json()["progress_pct"] == 0

    async def test_l_alias_reste_inchange_pour_cv_generation(
        self, client, auth_headers, test_db, test_user
    ):
        """CRITÈRE : rétro-compat V1 — l'alias sert toujours les jobs
        cv_generation avec son schéma historique (cv_id à plat)."""
        job = await _seed_job(
            test_db, test_user, status=JobStatus.RUNNING, progress_pct=30
        )
        response = await client.get(f"/cv/jobs/{job.id}", headers=auth_headers)
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "running"
        assert body["progress_pct"] == 30
        assert "cv_id" in body  # schéma V1 CVJobStatus inchangé
