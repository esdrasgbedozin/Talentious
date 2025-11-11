"""
CV Generation Router
Orchestrates the full AI pipeline: Analyzer → Writer
"""

import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User, UserProfile, CareerPass, GeneratedCV
from app.routes.auth import get_current_active_user
from app.services.analyzer_client import analyzer_client
from app.services.writer_client import writer_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cv", tags=["CV Generation"])


# ==================== REQUEST/RESPONSE MODELS ====================

class GenerateCVRequest(BaseModel):
    """Request model for CV generation"""
    cv_name: str = Field(..., min_length=1, max_length=255, description="Name for the generated CV")
    offer_text: str = Field(..., min_length=50, description="Job offer text (minimum 50 characters)")


class GenerateCVResponse(BaseModel):
    """Response model for CV generation"""
    cv_id: UUID = Field(..., description="Unique identifier of the generated CV")
    cv_data: dict = Field(..., description="Generated CV data (JSON structure)")
    message: str = Field(default="CV generated successfully")


class CVListItem(BaseModel):
    """CV list item for GET /cv"""
    id: UUID
    cv_name: str
    template_id: str
    created_at: datetime
    updated_at: datetime


class CVDetailResponse(BaseModel):
    """Detailed CV response for GET /cv/{cv_id}"""
    id: UUID
    cv_name: str
    template_id: str
    job_offer_context: Optional[str]
    cv_data_json: dict
    gcs_pdf_url: Optional[str]
    created_at: datetime
    updated_at: datetime


class UpdateCVRequest(BaseModel):
    """Request model for updating CV"""
    cv_name: Optional[str] = Field(None, min_length=1, max_length=255)
    cv_data_json: Optional[dict] = None


# ==================== HELPER FUNCTIONS ====================

async def check_career_pass_or_admin(
    current_user: User,
    db: AsyncSession
) -> None:
    """
    Verify user has an active CareerPass or is admin.
    
    Raises:
        HTTPException(402): If user has no active pass and is not admin
    """
    # Admins bypass CareerPass check
    if current_user.role == "admin":
        logger.info(f"Admin user {current_user.email} bypassing CareerPass check")
        return
    
    # Query for active CareerPass
    result = await db.execute(
        select(CareerPass)
        .where(CareerPass.user_id == current_user.id)
        .where(CareerPass.valid_until > datetime.utcnow())
        .order_by(CareerPass.valid_until.desc())
    )
    active_pass = result.scalars().first()
    
    if not active_pass:
        logger.warning(f"User {current_user.email} attempted CV generation without active CareerPass")
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Active CareerPass required. Please purchase a pass to generate CVs."
        )
    
    logger.info(
        f"User {current_user.email} has active {active_pass.pass_type} "
        f"(valid until {active_pass.valid_until})"
    )


# ==================== ENDPOINTS ====================

@router.post("/generate", response_model=GenerateCVResponse)
async def generate_cv(
    request: GenerateCVRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    🎯 **ORCHESTRATION ENDPOINT** - Generate optimized CV from job offer
    
    This is the main endpoint that orchestrates the full AI pipeline:
    1. Verify user has active CareerPass (or is admin)
    2. Fetch user profile from database
    3. Call Analyseur-Offre to analyze job offer
    4. Call Rédacteur-CV to generate optimized CV
    5. Save generated CV to database
    
    **Pipeline:** `User Profile + Job Offer → Analyzer → Writer → Database`
    
    **Performance Note:** Generation takes 2-5 minutes due to:
    - Gemini API latency (sequential calls to Analyzer + Writer)
    - Retry logic for JSON validation (up to 3 attempts per agent)
    - Large prompts and detailed responses (8192 max tokens)
    
    Returns:
        GenerateCVResponse: Generated CV data with unique ID
        
    Raises:
        HTTPException(402): No active CareerPass
        HTTPException(404): User profile not found
        HTTPException(502/503/504): AI service errors
    """
    try:
        # 1. Check permissions (CareerPass or Admin)
        await check_career_pass_or_admin(current_user, db)
        
        # 2. Fetch user profile
        logger.info(f"Fetching profile for user {current_user.email}...")
        result = await db.execute(
            select(UserProfile).where(UserProfile.user_id == current_user.id)
        )
        user_profile = result.scalars().first()
        
        if not user_profile:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found. Please create your profile first."
            )
        
        # 3. Analyze job offer with Analyseur-Offre
        logger.info("📊 Step 1/2: Analyzing job offer...")
        analysis_result = await analyzer_client.analyze_text(request.offer_text)
        logger.info(
            f"✅ Offer analyzed: {len(analysis_result.hard_skills)} hard skills, "
            f"{len(analysis_result.soft_skills)} soft skills"
        )
        
        # 4. Generate CV with Rédacteur-CV
        logger.info("✍️  Step 2/2: Generating optimized CV...")
        generated_response = await writer_client.generate_cv(
            user_profile=user_profile.profile_data,
            offer_analysis=analysis_result.to_dict()
        )
        
        # Extract cv_data from response (writer returns {"cv_data": {...}, "message": "..."})
        cv_data = generated_response.get("cv_data", generated_response)
        
        logger.info("✅ CV generated successfully by AI pipeline")
        
        # 5. Save to database
        new_cv = GeneratedCV(
            user_id=current_user.id,
            cv_name=request.cv_name,
            template_id="modern_v1",  # Default template for now
            job_offer_context=request.offer_text,
            cv_data_json=cv_data
        )
        
        db.add(new_cv)
        await db.commit()
        await db.refresh(new_cv)
        
        logger.info(f"💾 CV saved to database with ID: {new_cv.id}")
        
        return GenerateCVResponse(
            cv_id=new_cv.id,
            cv_data=cv_data,
            message="CV generated successfully"
        )
        
    except HTTPException:
        # Re-raise HTTPExceptions as-is (from permissions, clients, etc.)
        raise
    except Exception as e:
        logger.error(f"Unexpected error during CV generation: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"CV generation failed: {str(e)}"
        )


@router.get("", response_model=list[CVListItem])
async def list_cvs(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    List all CVs generated by the current user
    
    Returns:
        List of CV summaries (without full cv_data to reduce payload size)
    """
    result = await db.execute(
        select(GeneratedCV)
        .where(GeneratedCV.user_id == current_user.id)
        .order_by(GeneratedCV.created_at.desc())
    )
    cvs = result.scalars().all()
    
    return [
        CVListItem(
            id=cv.id,
            cv_name=cv.cv_name,
            template_id=cv.template_id,
            created_at=cv.created_at,
            updated_at=cv.updated_at
        )
        for cv in cvs
    ]


@router.get("/{cv_id}", response_model=CVDetailResponse)
async def get_cv(
    cv_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get full details of a specific CV
    
    Returns:
        Complete CV data including cv_data_json
        
    Raises:
        HTTPException(404): CV not found
        HTTPException(403): CV belongs to another user
    """
    result = await db.execute(
        select(GeneratedCV).where(GeneratedCV.id == cv_id)
    )
    cv = result.scalars().first()
    
    if not cv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"CV with ID {cv_id} not found"
        )
    
    # Authorization check
    if cv.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this CV"
        )
    
    return CVDetailResponse(
        id=cv.id,
        cv_name=cv.cv_name,
        template_id=cv.template_id,
        job_offer_context=cv.job_offer_context,
        cv_data_json=cv.cv_data_json,
        gcs_pdf_url=cv.gcs_pdf_url,
        created_at=cv.created_at,
        updated_at=cv.updated_at
    )


@router.put("/{cv_id}", response_model=CVDetailResponse)
async def update_cv(
    cv_id: UUID,
    request: UpdateCVRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Update CV name or cv_data
    
    Raises:
        HTTPException(404): CV not found
        HTTPException(403): CV belongs to another user
    """
    result = await db.execute(
        select(GeneratedCV).where(GeneratedCV.id == cv_id)
    )
    cv = result.scalars().first()
    
    if not cv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"CV with ID {cv_id} not found"
        )
    
    # Authorization check
    if cv.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to update this CV"
        )
    
    # Update fields
    if request.cv_name is not None:
        cv.cv_name = request.cv_name
    if request.cv_data_json is not None:
        cv.cv_data_json = request.cv_data_json
    
    cv.updated_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(cv)
    
    return CVDetailResponse(
        id=cv.id,
        cv_name=cv.cv_name,
        template_id=cv.template_id,
        job_offer_context=cv.job_offer_context,
        cv_data_json=cv.cv_data_json,
        gcs_pdf_url=cv.gcs_pdf_url,
        created_at=cv.created_at,
        updated_at=cv.updated_at
    )


@router.delete("/{cv_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cv(
    cv_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Delete a CV
    
    Raises:
        HTTPException(404): CV not found
        HTTPException(403): CV belongs to another user
    """
    result = await db.execute(
        select(GeneratedCV).where(GeneratedCV.id == cv_id)
    )
    cv = result.scalars().first()
    
    if not cv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"CV with ID {cv_id} not found"
        )
    
    # Authorization check
    if cv.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to delete this CV"
        )
    
    await db.delete(cv)
    await db.commit()
    
    logger.info(f"CV {cv_id} deleted by user {current_user.email}")
