"""M2-T17 — POST /cv/{cv_id}/export (202/409/404/422) + GET /jobs/{id}/download.

Critères : PDF autorisé SANS Pass (D1) ; CV d'autrui ⇒ 404 (anti-IDOR) ; 2e
export actif ⇒ 409 ; docx ⇒ 422 tant que le drapeau R6 est off. Téléchargement
PROXIFIÉ : ownership revérifié, fichier purgé ⇒ 404, en-têtes données
personnelles. L'ownership croisé exhaustif (B sur A) est M2-T18.
"""

from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient

from app.config import settings
from app.models import CVJob, JobStatus, JobType, User
from app.models.generated_cv import GeneratedCV
from app.services import storage_service
from app.services.auth import hash_password

VALID_CV_DATA = {
    "personal_info": {"first_name": "A", "last_name": "B", "email": "a@b.fr"},
    "summary": "x",
    "selected_experiences": [],
    "highlighted_skills": [],
    "selected_educations": [],
}


async def _make_cv(test_db, user) -> GeneratedCV:
    cv = GeneratedCV(
        user_id=user.id,
        cv_name="CV",
        template_id="modern_sobre",
        cv_data_json=VALID_CV_DATA,
        language="fr",
    )
    test_db.add(cv)
    await test_db.commit()
    await test_db.refresh(cv)
    return cv


@pytest.fixture(autouse=True)
def worker_mock(monkeypatch):
    """Neutralise la tâche de fond : la route se teste sans Chromium ni GCS.
    Retourné pour vérifier la planification (args) quand c'est pertinent."""
    mock = AsyncMock()
    monkeypatch.setattr("app.routes.cv.run_export_job", mock)
    return mock


class TestPostExport:
    async def test_pdf_202_sans_pass(self, client, auth_headers, test_user, test_db):
        """D1 : exporter en PDF un CV possédé ne demande AUCUN Pass."""
        cv = await _make_cv(test_db, test_user)
        res = await client.post(
            f"/cv/{cv.id}/export", json={"format": "pdf"}, headers=auth_headers
        )
        assert res.status_code == 202
        body = res.json()
        assert body["job_type"] == "export"
        assert body["format"] == "pdf"
        assert res.headers.get("Location", "").endswith(f"/jobs/{body['job_id']}")
        job = await test_db.get(CVJob, body["job_id"])
        assert job.job_type is JobType.EXPORT and job.cv_id == cv.id

    async def test_worker_planifie_avec_session_et_job_id(
        self, client, auth_headers, test_user, test_db, worker_mock
    ):
        """Revue T17 : le worker est bien planifié (session_factory, job.id)."""
        cv = await _make_cv(test_db, test_user)
        res = await client.post(
            f"/cv/{cv.id}/export", json={"format": "pdf"}, headers=auth_headers
        )
        job_id = res.json()["job_id"]
        worker_mock.assert_called_once()
        assert str(worker_mock.call_args.args[1]) == job_id

    async def test_sans_authentification_401(self, client, test_db, test_user):
        cv = await _make_cv(test_db, test_user)
        res = await client.post(f"/cv/{cv.id}/export", json={"format": "pdf"})
        assert res.status_code == 401

    async def test_docx_422_drapeau_off(self, client, auth_headers, test_user, test_db):
        cv = await _make_cv(test_db, test_user)
        res = await client.post(
            f"/cv/{cv.id}/export", json={"format": "docx"}, headers=auth_headers
        )
        assert res.status_code == 422

    async def test_cv_inexistant_404(self, client, auth_headers):
        import uuid

        res = await client.post(
            f"/cv/{uuid.uuid4()}/export", json={"format": "pdf"}, headers=auth_headers
        )
        assert res.status_code == 404

    async def test_cv_d_autrui_404_anti_idor(self, client, auth_headers, test_db):
        other = User(
            email="autre@example.com",
            hashed_password=hash_password("x"),
            email_verified=True,
        )
        test_db.add(other)
        await test_db.commit()
        await test_db.refresh(other)
        cv = await _make_cv(test_db, other)
        res = await client.post(
            f"/cv/{cv.id}/export", json={"format": "pdf"}, headers=auth_headers
        )
        assert res.status_code == 404

    async def test_deuxieme_export_actif_409(
        self, client, auth_headers, test_user, test_db
    ):
        cv = await _make_cv(test_db, test_user)
        test_db.add(
            CVJob(
                user_id=test_user.id,
                cv_name="export",
                status=JobStatus.RUNNING,
                job_type=JobType.EXPORT,
                cv_id=cv.id,
            )
        )
        await test_db.commit()
        res = await client.post(
            f"/cv/{cv.id}/export", json={"format": "pdf"}, headers=auth_headers
        )
        assert res.status_code == 409

    async def test_export_actif_ne_bloque_pas_une_generation(
        self, client, auth_headers, test_user, test_db, monkeypatch
    ):
        """Un export actif ne doit pas bloquer un autre TYPE de job (index par type)."""
        cv = await _make_cv(test_db, test_user)
        test_db.add(
            CVJob(
                user_id=test_user.id,
                cv_name="gen",
                status=JobStatus.RUNNING,
                job_type=JobType.CV_GENERATION,
            )
        )
        await test_db.commit()
        res = await client.post(
            f"/cv/{cv.id}/export", json={"format": "pdf"}, headers=auth_headers
        )
        assert res.status_code == 202


class TestGetJobsExportResult:
    async def test_jobs_export_succeeded_expose_download_url(
        self, client, auth_headers, test_user, test_db
    ):
        cv = await _make_cv(test_db, test_user)
        job = CVJob(
            user_id=test_user.id,
            cv_name="export",
            status=JobStatus.SUCCEEDED,
            job_type=JobType.EXPORT,
            cv_id=cv.id,
        )
        test_db.add(job)
        await test_db.commit()
        await test_db.refresh(job)
        res = await client.get(f"/jobs/{job.id}", headers=auth_headers)
        assert res.status_code == 200
        body = res.json()
        assert body["result"]["result_kind"] == "export"
        assert body["result"]["download_url"] == f"/jobs/{job.id}/download"


class TestDownload:
    async def _succeeded_export(self, test_db, user, object_name):
        cv = GeneratedCV(
            user_id=user.id,
            cv_name="CV",
            template_id="modern_sobre",
            cv_data_json=VALID_CV_DATA,
            language="fr",
            gcs_pdf_url=object_name,
        )
        test_db.add(cv)
        await test_db.commit()
        await test_db.refresh(cv)
        job = CVJob(
            user_id=user.id,
            cv_name="export",
            status=JobStatus.SUCCEEDED,
            job_type=JobType.EXPORT,
            cv_id=cv.id,
        )
        test_db.add(job)
        await test_db.commit()
        await test_db.refresh(job)
        return cv, job

    async def test_download_200_entetes_donnees_personnelles(
        self, client, auth_headers, test_user, test_db, monkeypatch
    ):
        obj = f"exports/{test_user.id}/placeholder/empreinte.pdf"
        cv, job = await self._succeeded_export(test_db, test_user, None)
        obj = f"exports/{test_user.id}/{cv.id}/empreinte.pdf"
        cv.gcs_pdf_url = obj
        await test_db.commit()
        monkeypatch.setattr(
            storage_service, "download_export", AsyncMock(return_value=b"%PDF-1.7 ok")
        )
        res = await client.get(f"/jobs/{job.id}/download", headers=auth_headers)
        assert res.status_code == 200
        assert res.headers["content-type"].startswith("application/pdf")
        assert "attachment" in res.headers["content-disposition"]
        assert res.headers["cache-control"] == "private, no-store"
        assert res.headers["x-content-type-options"] == "nosniff"
        assert res.headers["content-security-policy"] == "default-src 'none'; sandbox"
        assert res.content.startswith(b"%PDF-")

    async def test_download_job_pas_succeeded_409(
        self, client, auth_headers, test_user, test_db
    ):
        cv = await _make_cv(test_db, test_user)
        job = CVJob(
            user_id=test_user.id,
            cv_name="export",
            status=JobStatus.RUNNING,
            job_type=JobType.EXPORT,
            cv_id=cv.id,
        )
        test_db.add(job)
        await test_db.commit()
        await test_db.refresh(job)
        res = await client.get(f"/jobs/{job.id}/download", headers=auth_headers)
        assert res.status_code == 409

    async def test_download_fichier_purge_404_sans_nom(
        self, client, auth_headers, test_user, test_db, monkeypatch
    ):
        cv, job = await self._succeeded_export(test_db, test_user, None)
        obj = f"exports/{test_user.id}/{cv.id}/empreinte.pdf"
        cv.gcs_pdf_url = obj
        await test_db.commit()
        monkeypatch.setattr(
            storage_service,
            "download_export",
            AsyncMock(side_effect=storage_service.ExportFileMissingError(obj)),
        )
        res = await client.get(f"/jobs/{job.id}/download", headers=auth_headers)
        assert res.status_code == 404
        assert "empreinte.pdf" not in res.text

    async def test_download_job_d_autrui_404(self, client, auth_headers, test_db):
        other = User(
            email="autre2@example.com",
            hashed_password=hash_password("x"),
            email_verified=True,
        )
        test_db.add(other)
        await test_db.commit()
        await test_db.refresh(other)
        cv, job = await self._succeeded_export(
            test_db, other, f"exports/{other.id}/x/e.pdf"
        )
        cv.gcs_pdf_url = f"exports/{other.id}/{cv.id}/e.pdf"
        await test_db.commit()
        res = await client.get(f"/jobs/{job.id}/download", headers=auth_headers)
        assert res.status_code == 404

    async def test_download_job_non_export_404(
        self, client, auth_headers, test_user, test_db
    ):
        """Un job d'un AUTRE type (cv_generation) n'a pas de route download."""
        job = CVJob(
            user_id=test_user.id,
            cv_name="gen",
            status=JobStatus.SUCCEEDED,
            job_type=JobType.CV_GENERATION,
        )
        test_db.add(job)
        await test_db.commit()
        await test_db.refresh(job)
        res = await client.get(f"/jobs/{job.id}/download", headers=auth_headers)
        assert res.status_code == 404

    async def test_download_pointeur_hors_prefixe_refuse(
        self, client, auth_headers, test_user, test_db, monkeypatch
    ):
        """Défense en profondeur (revue T16) : un gcs_pdf_url qui ne commence pas
        par exports/{user}/{cv}/ n'est JAMAIS servi (jamais le fichier d'un autre)."""
        cv, job = await self._succeeded_export(test_db, test_user, None)
        cv.gcs_pdf_url = "exports/00000000-0000-0000-0000-000000000000/autre/e.pdf"
        await test_db.commit()
        dl = AsyncMock(return_value=b"%PDF-")
        monkeypatch.setattr(storage_service, "download_export", dl)
        res = await client.get(f"/jobs/{job.id}/download", headers=auth_headers)
        assert res.status_code == 404
        assert dl.await_count == 0  # jamais appelé sur un pointeur suspect
