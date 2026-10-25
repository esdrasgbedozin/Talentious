"""M2-T16 — worker `run_export_job` : ownership, recoercition défensive,
cache par empreinte contenu+thème+format.

Critères du ticket : job `succeeded` (+ `result.download_url` côté route,
testé dans test_export_job_result) ; MÊME contenu ⇒ resservi SANS nouveau
rendu (l'export-service n'est pas rappelé). Erreurs : messages SÛRS, jamais
un détail interne.
"""

import uuid
from unittest.mock import AsyncMock

import pytest

from app.models import CVJob, JobStatus, JobType
from app.models.generated_cv import GeneratedCV
from app.services import export_worker, storage_service
from app.services.export_client import ExportRejectedError, ExportUnavailableError

VALID_CV_DATA = {
    "personal_info": {
        "first_name": "Alice",
        "last_name": "Martin",
        "email": "alice.martin@example.com",
    },
    "summary": "Résumé professionnel",
    "selected_experiences": [
        {
            "id": "exp-1",
            "title": "Ingénieure",
            "company": "Acme",
            "start_date": "2020-01",
            "description": "Backend",
            "highlighted_skills": ["Python"],
        }
    ],
    "highlighted_skills": [],
    "selected_educations": [],
}


async def _make_cv(test_db, user, **overrides) -> GeneratedCV:
    cv = GeneratedCV(
        user_id=user.id,
        cv_name="CV export",
        template_id=overrides.get("template_id", "modern_sobre"),
        cv_data_json=overrides.get("cv_data_json", VALID_CV_DATA),
        language=overrides.get("language", "fr"),
        gcs_pdf_url=overrides.get("gcs_pdf_url"),
    )
    test_db.add(cv)
    await test_db.commit()
    await test_db.refresh(cv)
    return cv


async def _make_job(test_db, user, cv_id) -> CVJob:
    job = CVJob(
        user_id=user.id,
        cv_name="export",
        status=JobStatus.QUEUED,
        job_type=JobType.EXPORT,
        cv_id=cv_id,
    )
    test_db.add(job)
    await test_db.commit()
    await test_db.refresh(job)
    return job


@pytest.fixture()
async def test_user_2(test_db):
    """Second utilisateur (anti-IDOR) — sans profil, une ligne User suffit."""
    from app.models import User

    user = User(
        email="autre.utilisateur@example.com",
        hashed_password="inutilise",
        email_verified=True,
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user


@pytest.fixture()
def mocks(monkeypatch):
    """export_client + storage mockés : le worker se teste sans Chromium ni GCS.
    export_exists=True par défaut (le cache-hit sert) ; delete_export no-op."""
    render = AsyncMock(return_value=b"%PDF-1.7 rendu")
    upload = AsyncMock()
    exists = AsyncMock(return_value=True)
    delete = AsyncMock()
    monkeypatch.setattr(export_worker.export_client, "render_pdf", render)
    monkeypatch.setattr(export_worker.storage_service, "upload_export", upload)
    monkeypatch.setattr(export_worker.storage_service, "export_exists", exists)
    monkeypatch.setattr(export_worker.storage_service, "delete_export", delete)
    return {"render": render, "upload": upload, "exists": exists, "delete": delete}


async def test_job_succeeded_et_fichier_stocke(
    session_factory, test_db, test_user, mocks
):
    cv = await _make_cv(test_db, test_user)
    job = await _make_job(test_db, test_user, cv.id)

    await export_worker.run_export_job(session_factory, job.id)

    await test_db.refresh(job)
    await test_db.refresh(cv)
    assert job.status is JobStatus.SUCCEEDED
    assert mocks["render"].await_count == 1
    assert mocks["upload"].await_count == 1
    # L'objet stocké suit la convention empreinte, et le CV le mémorise.
    object_name = mocks["upload"].await_args.args[0]
    assert object_name.startswith(f"exports/{test_user.id}/{cv.id}/")
    assert object_name.endswith(".pdf")
    assert cv.gcs_pdf_url == object_name
    # Le request_id de corrélation est l'id du job (bout en bout, T12/T14).
    assert mocks["render"].await_args.kwargs["request_id"] == str(job.id)


async def test_cache_meme_contenu_resservi_sans_nouveau_rendu(
    session_factory, test_db, test_user, mocks
):
    cv = await _make_cv(test_db, test_user)
    job1 = await _make_job(test_db, test_user, cv.id)
    await export_worker.run_export_job(session_factory, job1.id)
    await test_db.refresh(cv)
    assert mocks["render"].await_count == 1

    job2 = await _make_job(test_db, test_user, cv.id)
    await export_worker.run_export_job(session_factory, job2.id)
    await test_db.refresh(job2)
    assert job2.status is JobStatus.SUCCEEDED
    # CRITÈRE : même contenu ⇒ AUCUN nouveau rendu ni upload.
    assert mocks["render"].await_count == 1
    assert mocks["upload"].await_count == 1


async def test_contenu_modifie_invalide_le_cache(
    session_factory, test_db, test_user, mocks
):
    cv = await _make_cv(test_db, test_user)
    job1 = await _make_job(test_db, test_user, cv.id)
    await export_worker.run_export_job(session_factory, job1.id)

    cv.cv_data_json = {**VALID_CV_DATA, "summary": "Résumé MODIFIÉ"}
    await test_db.commit()

    job2 = await _make_job(test_db, test_user, cv.id)
    await export_worker.run_export_job(session_factory, job2.id)
    await test_db.refresh(job2)
    assert job2.status is JobStatus.SUCCEEDED
    assert mocks["render"].await_count == 2


async def test_ownership_cv_d_autrui_echoue_sans_fuite(
    session_factory, test_db, test_user, test_user_2, mocks
):
    cv_autrui = await _make_cv(test_db, test_user_2)
    job = await _make_job(test_db, test_user, cv_autrui.id)

    await export_worker.run_export_job(session_factory, job.id)

    await test_db.refresh(job)
    assert job.status is JobStatus.FAILED
    # Anti-IDOR : même message qu'un CV inexistant, rien sur autrui.
    assert "introuvable" in job.error_message.lower()
    assert mocks["render"].await_count == 0


async def test_cv_inexistant_echoue_proprement(
    session_factory, test_db, test_user, mocks
):
    job = await _make_job(test_db, test_user, None)
    await export_worker.run_export_job(session_factory, job.id)
    await test_db.refresh(job)
    assert job.status is JobStatus.FAILED
    assert "introuvable" in job.error_message.lower()


async def test_service_indisponible_message_sur(
    session_factory, test_db, test_user, mocks
):
    mocks["render"].side_effect = ExportUnavailableError(
        "Rendu PDF indisponible (statut 500)"
    )
    cv = await _make_cv(test_db, test_user)
    job = await _make_job(test_db, test_user, cv.id)
    await export_worker.run_export_job(session_factory, job.id)
    await test_db.refresh(job)
    assert job.status is JobStatus.FAILED
    assert "réessayer" in job.error_message.lower()
    assert "500" not in job.error_message


async def test_payload_refuse_message_sur(session_factory, test_db, test_user, mocks):
    mocks["render"].side_effect = ExportRejectedError("statut 422")
    cv = await _make_cv(test_db, test_user)
    job = await _make_job(test_db, test_user, cv.id)
    await export_worker.run_export_job(session_factory, job.id)
    await test_db.refresh(job)
    assert job.status is JobStatus.FAILED
    assert "422" not in job.error_message


async def test_contenu_corrompu_recoercition_defensive(
    session_factory, test_db, test_user, mocks
):
    # Un cv_data_json corrompu (pré-ceinture) passe la RECOERCITION : le rendu
    # reçoit un contenu coercé, jamais le brut.
    corrompu = {
        **VALID_CV_DATA,
        "summary": 12345,  # type invalide : la coercition le normalise
        "champ_inconnu_v1": "legacy",
    }
    cv = await _make_cv(test_db, test_user, cv_data_json=corrompu)
    job = await _make_job(test_db, test_user, cv.id)
    await export_worker.run_export_job(session_factory, job.id)
    await test_db.refresh(job)
    assert job.status is JobStatus.SUCCEEDED
    sent = mocks["render"].await_args.kwargs["cv_content"]
    assert "champ_inconnu_v1" not in sent  # clé hors liste blanche écartée
    assert sent.get("summary") != 12345  # type invalide jamais transmis brut


async def test_theme_corrompu_repli_anthracite(
    session_factory, test_db, test_user, mocks
):
    cv = await _make_cv(test_db, test_user)
    cv.theme_json = {"color_accent": "pas-un-hex"}
    await test_db.commit()
    job = await _make_job(test_db, test_user, cv.id)
    await export_worker.run_export_job(session_factory, job.id)
    await test_db.refresh(job)
    assert job.status is JobStatus.SUCCEEDED
    theme = mocks["render"].await_args.kwargs["theme"]
    assert theme["color_accent"].startswith("#")


async def test_job_mauvais_type_refuse(session_factory, test_db, test_user, mocks):
    job = CVJob(
        user_id=test_user.id,
        cv_name="gen",
        status=JobStatus.QUEUED,
        job_type=JobType.CV_GENERATION,
    )
    test_db.add(job)
    await test_db.commit()
    await test_db.refresh(job)
    await export_worker.run_export_job(session_factory, job.id)
    await test_db.refresh(job)
    # Un job d'un autre type n'est JAMAIS touché par ce worker (revue T16, C7).
    assert job.status is JobStatus.QUEUED
    assert job.error_message is None
    assert mocks["render"].await_count == 0


async def test_idempotence_job_deja_succeeded_ignore(
    session_factory, test_db, test_user, mocks
):
    """Revue T16, C6/B1 : un job déjà terminé n'est jamais ressuscité."""
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

    await export_worker.run_export_job(session_factory, job.id)
    await test_db.refresh(job)
    assert job.status is JobStatus.SUCCEEDED
    assert mocks["render"].await_count == 0


async def test_cache_hit_mais_objet_purge_force_le_re_rendu(
    session_factory, test_db, test_user, mocks
):
    """Revue T16, C1 : gcs_pdf_url pointe le bon chemin mais l'objet a été purgé
    (rétention) ⇒ re-rendu, jamais un cache mort servi en succeeded."""
    cv = await _make_cv(test_db, test_user)
    job1 = await _make_job(test_db, test_user, cv.id)
    await export_worker.run_export_job(session_factory, job1.id)
    await test_db.refresh(cv)
    assert mocks["render"].await_count == 1

    mocks["exists"].return_value = False  # objet disparu du bucket
    job2 = await _make_job(test_db, test_user, cv.id)
    await export_worker.run_export_job(session_factory, job2.id)
    await test_db.refresh(job2)
    assert job2.status is JobStatus.SUCCEEDED
    assert mocks["render"].await_count == 2  # re-rendu forcé


async def test_ancien_objet_supprime_apres_re_rendu(
    session_factory, test_db, test_user, mocks
):
    """Revue T16, C5 (RGPD) : après un nouvel upload, l'ancien PDF est purgé."""
    cv = await _make_cv(test_db, test_user)
    await export_worker.run_export_job(
        session_factory, (await _make_job(test_db, test_user, cv.id)).id
    )
    await test_db.refresh(cv)
    ancien = cv.gcs_pdf_url
    assert mocks["delete"].await_count == 0  # rien à purger au 1er rendu

    cv.cv_data_json = {**VALID_CV_DATA, "summary": "Contenu MODIFIÉ"}
    await test_db.commit()
    await export_worker.run_export_job(
        session_factory, (await _make_job(test_db, test_user, cv.id)).id
    )
    await test_db.refresh(cv)
    assert mocks["delete"].await_count == 1
    assert mocks["delete"].await_args.args[0] == ancien
    assert cv.gcs_pdf_url != ancien


async def test_cache_invalide_par_chaque_dimension(
    session_factory, test_db, test_user, mocks
):
    """Revue T16, C8 : template, thème ET langue (pas seulement le contenu)
    changent l'empreinte et forcent un re-rendu."""
    from app.models import CVTemplate

    cv = await _make_cv(test_db, test_user)
    await export_worker.run_export_job(
        session_factory, (await _make_job(test_db, test_user, cv.id)).id
    )
    assert mocks["render"].await_count == 1

    # template_id est une FK : créer le template cible avant de pointer dessus.
    test_db.add(
        CVTemplate(
            id="corporate_strict",
            name="Corporate",
            sector="corporate",
            is_free=False,
            description="x",
            preview_url="https://talentious.app/t.png",
            default_theme_id=None,
        )
    )
    await test_db.commit()
    cv.template_id = "corporate_strict"
    await test_db.commit()
    await export_worker.run_export_job(
        session_factory, (await _make_job(test_db, test_user, cv.id)).id
    )
    assert mocks["render"].await_count == 2

    cv.theme_json = {
        "color_accent": "#2B6CB0",
        "color_text": "#1A202C",
        "color_muted": "#4A5568",
        "color_background": "#FFFFFF",
        "font_heading": "Lora",
        "font_body": "Source Sans 3",
    }
    await test_db.commit()
    await export_worker.run_export_job(
        session_factory, (await _make_job(test_db, test_user, cv.id)).id
    )
    assert mocks["render"].await_count == 3

    cv.language = "en"
    await test_db.commit()
    await export_worker.run_export_job(
        session_factory, (await _make_job(test_db, test_user, cv.id)).id
    )
    assert mocks["render"].await_count == 4


async def test_echec_upload_job_failed_sans_pointeur(
    session_factory, test_db, test_user, mocks
):
    """Revue T16, C8 : upload qui plante ⇒ FAILED, message sûr, gcs_pdf_url intact."""
    mocks["upload"].side_effect = RuntimeError("DÉTAIL_INTERNE_GCS")
    cv = await _make_cv(test_db, test_user)
    job = await _make_job(test_db, test_user, cv.id)
    await export_worker.run_export_job(session_factory, job.id)
    await test_db.refresh(job)
    await test_db.refresh(cv)
    assert job.status is JobStatus.FAILED
    assert "DÉTAIL_INTERNE_GCS" not in (job.error_message or "")
    assert cv.gcs_pdf_url is None


async def test_stockage_non_configure_message_sur(
    session_factory, test_db, test_user, mocks
):
    """Revue T16, C8 : StorageNotConfiguredError ⇒ FAILED indisponible."""
    mocks["upload"].side_effect = storage_service.StorageNotConfiguredError("vide")
    cv = await _make_cv(test_db, test_user)
    job = await _make_job(test_db, test_user, cv.id)
    await export_worker.run_export_job(session_factory, job.id)
    await test_db.refresh(job)
    assert job.status is JobStatus.FAILED
    assert "indisponible" in job.error_message.lower()


async def test_contenu_non_objet_message_invalide(
    session_factory, test_db, test_user, mocks
):
    """Revue T16, C8 : cv_data_json non-objet ⇒ MSG_CONTENU_INVALIDE, pas de rendu."""
    cv = await _make_cv(test_db, test_user, cv_data_json=["pas", "un", "objet"])
    job = await _make_job(test_db, test_user, cv.id)
    await export_worker.run_export_job(session_factory, job.id)
    await test_db.refresh(job)
    assert job.status is JobStatus.FAILED
    assert "exportable" in job.error_message.lower()
    assert mocks["render"].await_count == 0


async def test_progression_atteint_100_au_succes(
    session_factory, test_db, test_user, mocks
):
    cv = await _make_cv(test_db, test_user)
    job = await _make_job(test_db, test_user, cv.id)
    await export_worker.run_export_job(session_factory, job.id)
    await test_db.refresh(job)
    assert job.status is JobStatus.SUCCEEDED
    assert job.progress_pct == 100
