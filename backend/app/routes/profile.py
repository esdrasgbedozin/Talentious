"""
Profile management routes.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

from app.database import get_db
from app.models import User, UserProfile
from app.schemas.user import UserResponse
from app.schemas.profile import ProfileResponse, ProfileUpdate, ProfileData
from app.services.dependencies import get_current_active_user

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=ProfileResponse)
async def get_profile(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get the profile of the currently authenticated user.
    
    Returns:
        ProfileResponse: Complete profile data with metadata
    """
    # Fetch user profile from database
    result = await db.execute(
        select(UserProfile).where(UserProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    return ProfileResponse(
        user_id=profile.user_id,
        profile_data=profile.profile_data,
        updated_at=profile.updated_at
    )


@router.put("", response_model=ProfileResponse)
async def update_profile(
    profile_update: ProfileUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
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
    profile.profile_data = profile_update.profile_data.model_dump(mode='json')
    # TODO: Use timezone-aware datetime once migration updates to TIMESTAMP WITH TIME ZONE
    profile.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(profile)
    
    return ProfileResponse(
        user_id=profile.user_id,
        profile_data=profile.profile_data,
        updated_at=profile.updated_at
    )
