"""
Profile management routes.
"""

import logging

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Request,
    Response,
    UploadFile,
    status,
)
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone

from app.core.rate_limit import IMPORT_RATE_LIMIT, limiter
from app.database import get_db
from app.models import User, UserProfile
from app.schemas.user import UserResponse
from app.schemas.profile import ProfileResponse, ProfileUpdate, ProfileData
from app.services.dependencies import get_current_active_user
from app.services.import_jobs import import_job_store
from app.services.parser_client import parser_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/profile", tags=["profile"])

# Pré-contrôle avant d'expédier le fichier à l'agent (économie réseau/coût).
MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024  # 10 Mo (contrat)


async def _run_import(job_id: str, user_id, content: bytes, filename: str) -> None:
    """Tâche de fond : extraction par l'agent puis re-validation stricte.

    Toute issue (succès, erreur métier, panne agent, crash) termine le job —
    jamais d'exception qui remonte, le client lit l'état par polling.
    """
    try:
        result = await parser_client.extract_profile(content, filename)
    except HTTPException as e:
        # Erreurs déjà qualifiées par le client parser (422 scanné, 502/503/504)
        import_job_store.fail(job_id, str(e.detail))
        return
    except Exception:
        logger.exception("Unexpected import failure for user %s", user_id)
        import_job_store.fail(job_id, "L'import a échoué. Réessayez.")
        return

    # Défense en profondeur : le brouillon DOIT valider le ProfileData canonique
    # (même si l'agent est censé coercer). Un brouillon hors contrat ne sort
    # JAMAIS du serveur.
    try:
        draft = ProfileData.model_validate(result.get("profile_data"))
    except ValidationError as e:
        logger.error(
            "Agent returned an out-of-contract draft for user %s: %s",
            user_id,
            str(e)[:300],
        )
        import_job_store.fail(
            job_id, "L'import a produit un résultat invalide. Réessayez."
        )
        return

    warnings = [w for w in result.get("warnings", []) if isinstance(w, str)]
    logger.info(
        "CV imported for user %s (%d warnings) — draft only, nothing persisted",
        user_id,
        len(warnings),
    )
    import_job_store.succeed(job_id, draft.model_dump(mode="json"), warnings)


@router.post("/import-cv", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit(IMPORT_RATE_LIMIT)
async def import_cv(
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
):
    """
    Lance l'import ASYNCHRONE d'un CV/export LinkedIn (PDF) : 202 + job_id.

    Asynchrone parce que la façade CDN coupe toute requête à 60 s alors que
    l'extraction Gemini peut durer davantage (incident du 2026-07-23). RIEN
    n'est persisté : le brouillon attend en mémoire (≤ 15 min) que le client
    le récupère via GET /profile/import-cv/jobs/{job_id}, le relise dans le
    formulaire puis le sauvegarde via PUT /profile (validation canonique).
    Cette relecture humaine est le garde-fou final contre l'injection de
    prompt (le contenu d'un PDF est une entrée non fiable).
    """
    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Format invalide : seul le PDF est accepté",
        )

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Fichier vide"
        )
    if len(content) > MAX_IMPORT_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Fichier trop volumineux (maximum 10 Mo)",
        )

    if import_job_store.has_active(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Un import est déjà en cours. Attendez qu'il se termine.",
        )

    job = import_job_store.create(current_user.id)
    background_tasks.add_task(
        _run_import, job.id, current_user.id, content, file.filename
    )
    response.headers["Location"] = f"/profile/import-cv/jobs/{job.id}"
    return {
        "job_id": job.id,
        "status": "running",
        "message": "Import accepté. Suivez l'état via GET /profile/import-cv/jobs/{job_id}.",
    }


@router.get("/import-cv/jobs/{job_id}")
async def get_import_job_status(
    job_id: str,
    current_user: User = Depends(get_current_active_user),
):
    """État d'un job d'import. Job inconnu, expiré ou d'un autre utilisateur
    → 404 (indistinguables, pas d'énumération possible)."""
    job = import_job_store.get(job_id, current_user.id)
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job d'import introuvable ou expiré. Relancez l'import.",
        )

    body = {"job_id": job.id, "status": job.status}
    if job.status == "succeeded":
        body["profile_data"] = job.profile_data
        body["warnings"] = job.warnings
    elif job.status == "failed":
        body["error_message"] = job.error_message
    return body


@router.get("", response_model=ProfileResponse)
async def get_profile(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get the profile of the currently authenticated user.
    If profile doesn't exist, create an empty one automatically.

    Returns:
        ProfileResponse: Complete profile data with metadata
    """
    # Fetch user profile from database
    result = await db.execute(
        select(UserProfile).where(UserProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()

    # Create empty profile if doesn't exist
    if not profile:
        # Create default empty profile data
        empty_profile_data = {
            "personal_info": {
                "first_name": "",
                "last_name": "",
                "email": current_user.email,  # Pre-fill from user account
                "phone": None,
                "linkedin": None,
                "address": None,
                "city": None,
                "postal_code": None,
                "country": "France",
            },
            "summary": "",
            "experiences": [],
            "educations": [],
            "skills": {"hard": [], "soft": []},
            "projects": [],
            "certifications": [],
        }

        profile = UserProfile(
            user_id=current_user.id,
            profile_data=empty_profile_data,
            updated_at=datetime.now(timezone.utc),
        )
        db.add(profile)
        await db.commit()
        await db.refresh(profile)

    return ProfileResponse(
        user_id=profile.user_id,
        profile_data=profile.profile_data,
        updated_at=profile.updated_at,
    )


@router.put("", response_model=ProfileResponse)
async def update_profile(
    profile_update: ProfileUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update the profile of the currently authenticated user.

    Args:
        profile_update: Complete profile data to update

    Returns:
        ProfileResponse: Updated profile data with metadata
    """
    # Fetch user profile from database
    result = await db.execute(
        select(UserProfile).where(UserProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    # Update profile data (use mode='json' to serialize dates properly)
    profile.profile_data = profile_update.profile_data.model_dump(mode="json")
    # TODO: Use timezone-aware datetime once migration updates to TIMESTAMP WITH TIME ZONE
    profile.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(profile)

    return ProfileResponse(
        user_id=profile.user_id,
        profile_data=profile.profile_data,
        updated_at=profile.updated_at,
    )
