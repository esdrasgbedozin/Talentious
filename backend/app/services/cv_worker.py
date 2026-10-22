"""
Asynchronous CV generation worker.

Runs the AI pipeline (Analyseur-Offre -> Rédacteur-CV) outside the request/response
cycle. Scheduled via FastAPI BackgroundTasks by POST /cv/generate. Owns its own DB
session (independent of the request session) via an injected session factory, so it
can update the CVJob after the HTTP response has been returned.

No skills transformation happens here: the profile's canonical `{hard, soft}` skills
structure is passed to the writer agent as-is (the contract is the single source of
truth — see contracts/openapi.yaml).
"""

from __future__ import annotations

import logging
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.generated.models import GeneratedCVData
from app.models import CVJob, GeneratedCV, JobStatus, UserProfile
from app.services.analyzer_client import analyzer_client
from app.services.cv_content_coercion import (
    CVContentCoercionError,
    coerce_cv_content,
    coerce_personal_info,
)
from app.services.writer_client import writer_client

logger = logging.getLogger(__name__)

# PAH-M0 (2026-10-22) : les nouveaux CV portent l'id canonique V2 du registre
# (`modern_sobre`) ; `modern_v1` ne subsiste que comme ALIAS de lecture pour le
# stock existant (packages/cv-render, registre des templates).
DEFAULT_TEMPLATE_ID = "modern_sobre"

# Safe, client-facing failure messages. The raw exception is logged server-side
# (exc_info=True) but NEVER stored in job.error_message, which is returned to the
# client via GET /cv/jobs/{id} — storing str(exc) would leak internals/PII.
_SAFE_PROFILE_MISSING = (
    "Profil utilisateur introuvable. Complétez votre profil avant de générer un CV."
)
_SAFE_GENERIC = "La génération a échoué (service IA momentanément indisponible). Merci de réessayer."
_SAFE_CONTENT_INVALID = (
    "Le CV généré n'a pas pu être validé (contenu inattendu). Merci de réessayer."
)


class ProfileNotFoundError(Exception):
    """Raised when the user's profile is missing at generation time."""


class CVContentInvalidError(Exception):
    """Raised when the writer output cannot be coerced/validated to GeneratedCVData.

    Guards the V2 server-side HTML render : the stored `cv_data_json` must be a
    clean, schema-valid GeneratedCVData (see cv_content_coercion + ADR-CONTENT-SCHEMA).
    """


def _safe_error_message(exc: Exception) -> str:
    """Map an exception to a safe, non-leaking client-facing message."""
    if isinstance(exc, ProfileNotFoundError):
        return _SAFE_PROFILE_MISSING
    if isinstance(exc, CVContentInvalidError):
        return _SAFE_CONTENT_INVALID
    return _SAFE_GENERIC


async def run_cv_generation(
    session_factory: async_sessionmaker,
    job_id: UUID,
    user_id: UUID,
    cv_name: str,
    offer_text: str,
) -> None:
    """Run the full CV generation pipeline for a queued job and update its status.

    On success: creates a GeneratedCV, links it to the job, marks the job `succeeded`.
    On any failure: marks the job `failed` and records a sanitized error message.
    """
    async with session_factory() as db:
        job = await db.get(CVJob, job_id)
        if job is None:
            logger.error("run_cv_generation: job %s not found", job_id)
            return

        try:
            job.status = JobStatus.RUNNING
            job.progress_pct = 10
            await db.commit()

            result = await db.execute(
                select(UserProfile).where(UserProfile.user_id == user_id)
            )
            profile = result.scalars().first()
            if profile is None:
                raise ProfileNotFoundError()

            # Canonical profile passed through untouched — no runtime skills transform.
            profile_data = dict(profile.profile_data)

            job.progress_pct = 30
            await db.commit()
            analysis = await analyzer_client.analyze_text(offer_text)

            job.progress_pct = 60
            await db.commit()
            generated = await writer_client.generate_cv(
                user_profile=profile_data,
                offer_analysis=analysis.to_dict(),
            )
            raw_cv_data = generated.get("cv_data", generated)

            # Ceinture de sécurité post-LLM : liste blanche stricte (types, caps,
            # URL http(s), enums, drop de `optimization_notes`), PUIS validation du
            # schéma canonique. Un contenu inexploitable fait échouer le job plutôt
            # que de stocker une sortie brute dangereuse une fois rendue en HTML.
            try:
                cv_data, coercion_warnings = coerce_cv_content(raw_cv_data)
            except CVContentCoercionError as exc:
                raise CVContentInvalidError("writer output not coercible") from exc

            # Ancrage d'identité : le nom / email / contact affichés viennent du profil
            # vérifié, JAMAIS de la sortie du LLM — une injection ne peut donc pas
            # changer les coordonnées du candidat (ADR-CONTENT-SCHEMA, décision identité).
            profile_personal_info = profile_data.get("personal_info")
            if isinstance(profile_personal_info, dict):
                cv_data["personal_info"] = coerce_personal_info(profile_personal_info)

            try:
                GeneratedCVData.model_validate(cv_data)
            except ValidationError as exc:
                # Log d'observabilité SANS valeurs (RGPD) : seulement où ça casse.
                safe_errors = [
                    {"loc": e.get("loc"), "type": e.get("type")}
                    for e in exc.errors(include_url=False)
                ]
                logger.warning(
                    "CV generation job %s: coerced content failed schema validation (%s)",
                    job_id,
                    safe_errors,
                )
                raise CVContentInvalidError(
                    "coerced content failed schema validation"
                ) from exc

            if coercion_warnings:
                logger.warning(
                    "CV generation job %s: writer output sanitized (%s)",
                    job_id,
                    coercion_warnings,
                )

            new_cv = GeneratedCV(
                user_id=user_id,
                cv_name=cv_name,
                template_id=DEFAULT_TEMPLATE_ID,
                job_offer_context=offer_text,
                cv_data_json=cv_data,
            )
            db.add(new_cv)
            await db.flush()

            job.cv_id = new_cv.id
            job.status = JobStatus.SUCCEEDED
            job.progress_pct = 100
            await db.commit()
            logger.info("CV generation job %s succeeded (cv_id=%s)", job_id, new_cv.id)

        except Exception as exc:  # noqa: BLE001 — worker must never crash silently
            if isinstance(exc, CVContentInvalidError):
                # Déjà loggué au point d'échec (champs seulement, sans valeurs). On
                # évite exc_info ici : la ValidationError chaînée embarque input_value
                # (email/nom/contenu) → ne doit pas atterrir en clair dans les logs.
                logger.error("CV generation job %s failed: content invalid", job_id)
            else:
                logger.error(
                    "CV generation job %s failed: %s", job_id, exc, exc_info=True
                )
            await db.rollback()
            job = await db.get(CVJob, job_id)
            if job is not None:
                job.status = JobStatus.FAILED
                # Safe message only — the real exception was logged above.
                job.error_message = _safe_error_message(exc)
                await db.commit()
