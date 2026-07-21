"""
Profile management routes.
"""

import logging

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
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
from app.services.parser_client import parser_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/profile", tags=["profile"])

# Pré-contrôle avant d'expédier le fichier à l'agent (économie réseau/coût).
MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024  # 10 Mo (contrat)


@router.post("/import-cv")
@limiter.limit(IMPORT_RATE_LIMIT)
async def import_cv(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
):
    """
    Importe un CV ou un export LinkedIn (PDF) et renvoie un BROUILLON de profil.

    RIEN n'est persisté ici : le brouillon est relu par l'utilisateur dans le
    formulaire de profil puis sauvegardé via PUT /profile (validation
    canonique). Cette relecture humaine est le garde-fou final contre
    l'injection de prompt (le contenu d'un PDF est une entrée non fiable).
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
    await file.seek(0)

    result = await parser_client.extract_profile(file)

    # Défense en profondeur : le brouillon DOIT valider le ProfileData canonique
    # (même si l'agent est censé coercer). Un brouillon hors contrat = 502,
    # jamais transmis au client.
    try:
        draft = ProfileData.model_validate(result.get("profile_data"))
    except ValidationError as e:
        logger.error(
            "Agent returned an out-of-contract draft for user %s: %s",
            current_user.id,
            str(e)[:300],
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="L'import a produit un résultat invalide. Réessayez.",
        )

    warnings = [w for w in result.get("warnings", []) if isinstance(w, str)]
    logger.info(
        "CV imported for user %s (%d warnings) — draft only, nothing persisted",
        current_user.id,
        len(warnings),
    )
    return {"profile_data": draft.model_dump(mode="json"), "warnings": warnings}


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
