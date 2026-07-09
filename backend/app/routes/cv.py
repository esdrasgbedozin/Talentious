"""
CV Generation Router
Orchestrates the full AI pipeline: Analyzer → Writer
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Response,
    status,
)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.database import get_db, get_session_factory
from app.models import (
    CareerPass,
    CVJob,
    GeneratedCV,
    JobStatus,
    User,
    UserProfile,
    UserRole,
)
from app.routes.auth import get_current_active_user
from app.services.cv_worker import run_cv_generation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cv", tags=["CV Generation"])


# ==================== REQUEST/RESPONSE MODELS ====================


class GenerateCVRequest(BaseModel):
    """Request model for CV generation"""

    cv_name: str = Field(
        ..., min_length=1, max_length=255, description="Name for the generated CV"
    )
    offer_text: str = Field(
        ...,
        min_length=50,
        max_length=200000,
        description="Job offer text (50 to 200,000 characters)",
    )


class GenerateCVJobAccepted(BaseModel):
    """202 response: the generation job was accepted and queued."""

    job_id: UUID = Field(..., description="Identifier of the queued generation job")
    status: JobStatus = Field(..., description="Current job status (queued)")


class CVJobStatus(BaseModel):
    """Status of an asynchronous CV generation job."""

    job_id: UUID
    status: JobStatus
    progress_pct: Optional[int] = None
    cv_id: Optional[UUID] = None
    error_message: Optional[str] = None


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


async def check_career_pass_or_admin(current_user: User, db: AsyncSession) -> None:
    """
    Verify user has an active CareerPass or is admin.

    Raises:
        HTTPException(402): If user has no active pass and is not admin
    """
    # Admins bypass CareerPass check
    if current_user.role == UserRole.ADMIN:
        logger.info(f"Admin user {current_user.email} bypassing CareerPass check")
        return

    # Query for active CareerPass
    result = await db.execute(
        select(CareerPass)
        .where(CareerPass.user_id == current_user.id)
        .where(CareerPass.valid_until > datetime.now(timezone.utc))
        .order_by(CareerPass.valid_until.desc())
    )
    active_pass = result.scalars().first()

    if not active_pass:
        logger.warning(
            f"User {current_user.email} attempted CV generation without active CareerPass"
        )
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Active CareerPass required. Please purchase a pass to generate CVs.",
        )

    logger.info(
        f"User {current_user.email} has active {active_pass.pass_type} "
        f"(valid until {active_pass.valid_until})"
    )


# ==================== ENDPOINTS ====================


@router.post(
    "/generate",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=GenerateCVJobAccepted,
)
async def generate_cv(
    request: GenerateCVRequest,
    response: Response,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    session_factory: async_sessionmaker = Depends(get_session_factory),
):
    """
    🎯 **ORCHESTRATION ENDPOINT** — accepte une génération de CV (asynchrone).

    Vérifie l'accès (CareerPass ou admin) et l'existence du profil, garantit qu'une
    seule génération est active par utilisateur (idempotence), crée un `CVJob` en
    statut `queued` puis lance le pipeline IA en tâche de fond. Retourne `202` avec
    le `job_id` ; le client suit l'avancement via `GET /cv/jobs/{job_id}`.

    Raises:
        HTTPException(402): pas de CareerPass actif (non-admin)
        HTTPException(404): profil utilisateur absent
        HTTPException(409): une génération est déjà en cours pour cet utilisateur
    """
    # 1. Access control (CareerPass or admin) — raises 402 if not allowed.
    await check_career_pass_or_admin(current_user, db)

    # 2. The user must have a profile to generate from.
    result = await db.execute(
        select(UserProfile).where(UserProfile.user_id == current_user.id)
    )
    if result.scalars().first() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found. Please create your profile first.",
        )

    # 3. Idempotency: at most one active (queued/running) job per user.
    # Fast-path pre-check for a friendly 409...
    active = await db.execute(
        select(CVJob)
        .where(CVJob.user_id == current_user.id)
        .where(CVJob.status.in_([JobStatus.QUEUED, JobStatus.RUNNING]))
    )
    if active.scalars().first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A CV generation is already in progress. Please wait for it to finish.",
        )

    # 4. Create the job and schedule the background pipeline. The partial unique
    # index (uq_cv_jobs_one_active_per_user) is the real guard against a race
    # between two concurrent requests — catch its violation and return 409.
    job = CVJob(
        user_id=current_user.id,
        cv_name=request.cv_name,
        status=JobStatus.QUEUED,
        progress_pct=0,
    )
    db.add(job)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A CV generation is already in progress. Please wait for it to finish.",
        )
    await db.refresh(job)

    background_tasks.add_task(
        run_cv_generation,
        session_factory,
        job.id,
        current_user.id,
        request.cv_name,
        request.offer_text,
    )

    response.headers["Location"] = f"/cv/jobs/{job.id}"
    return GenerateCVJobAccepted(job_id=job.id, status=job.status)


async def _get_owned_job(
    cv_job_id: UUID, current_user: User, db: AsyncSession
) -> CVJob:
    """Fetch a job, enforcing ownership (or admin)."""
    result = await db.execute(select(CVJob).where(CVJob.id == cv_job_id))
    job = result.scalars().first()
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {cv_job_id} not found",
        )
    if job.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this job",
        )
    return job


@router.get("/jobs/{cv_job_id}", response_model=CVJobStatus)
async def get_cv_job(
    cv_job_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Poll the status of an asynchronous CV generation job."""
    job = await _get_owned_job(cv_job_id, current_user, db)
    return CVJobStatus(
        job_id=job.id,
        status=job.status,
        progress_pct=job.progress_pct,
        cv_id=job.cv_id,
        error_message=job.error_message,
    )


@router.get("/jobs/{cv_job_id}/events")
async def stream_cv_job(
    cv_job_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    session_factory: async_sessionmaker = Depends(get_session_factory),
):
    """Server-Sent Events stream of a job's progress until it reaches a terminal state."""
    # Ownership check up-front (raises 403/404) before opening the stream.
    await _get_owned_job(cv_job_id, current_user, db)

    async def event_generator():
        terminal = {JobStatus.SUCCEEDED, JobStatus.FAILED}
        try:
            for _ in range(600):  # safety bound (~10 min at 1s cadence)
                async with session_factory() as stream_db:
                    job = await stream_db.get(CVJob, cv_job_id)
                if job is None:
                    break
                payload = {
                    "job_id": str(job.id),
                    "status": job.status.value,
                    "progress_pct": job.progress_pct,
                    "cv_id": str(job.cv_id) if job.cv_id else None,
                }
                if job.status in terminal:
                    payload["error_message"] = job.error_message
                    yield f"event: done\ndata: {json.dumps(payload)}\n\n"
                    return
                yield f"event: progress\ndata: {json.dumps(payload)}\n\n"
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            # Client disconnected — stop quietly.
            raise
        except Exception:
            logger.error("SSE stream failed for job %s", cv_job_id, exc_info=True)
            # Tell the client the stream ended abnormally, without leaking details.
            yield 'event: error\ndata: {"status": "error"}\n\n'

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("", response_model=list[CVListItem])
async def list_cvs(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
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
            updated_at=cv.updated_at,
        )
        for cv in cvs
    ]


@router.get("/{cv_id}", response_model=CVDetailResponse)
async def get_cv(
    cv_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get full details of a specific CV

    Returns:
        Complete CV data including cv_data_json

    Raises:
        HTTPException(404): CV not found
        HTTPException(403): CV belongs to another user
    """
    result = await db.execute(select(GeneratedCV).where(GeneratedCV.id == cv_id))
    cv = result.scalars().first()

    if not cv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"CV with ID {cv_id} not found",
        )

    # Authorization check
    if cv.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this CV",
        )

    return CVDetailResponse(
        id=cv.id,
        cv_name=cv.cv_name,
        template_id=cv.template_id,
        job_offer_context=cv.job_offer_context,
        cv_data_json=cv.cv_data_json,
        gcs_pdf_url=cv.gcs_pdf_url,
        created_at=cv.created_at,
        updated_at=cv.updated_at,
    )


@router.put("/{cv_id}", response_model=CVDetailResponse)
async def update_cv(
    cv_id: UUID,
    request: UpdateCVRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update CV name or cv_data

    Raises:
        HTTPException(404): CV not found
        HTTPException(403): CV belongs to another user
    """
    result = await db.execute(select(GeneratedCV).where(GeneratedCV.id == cv_id))
    cv = result.scalars().first()

    if not cv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"CV with ID {cv_id} not found",
        )

    # Authorization check
    if cv.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to update this CV",
        )

    # Update fields
    if request.cv_name is not None:
        cv.cv_name = request.cv_name
    if request.cv_data_json is not None:
        cv.cv_data_json = request.cv_data_json

    cv.updated_at = datetime.now(timezone.utc)

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
        updated_at=cv.updated_at,
    )


@router.delete("/{cv_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_cv(
    cv_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete a CV

    Raises:
        HTTPException(404): CV not found
        HTTPException(403): CV belongs to another user
    """
    result = await db.execute(select(GeneratedCV).where(GeneratedCV.id == cv_id))
    cv = result.scalars().first()

    if not cv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"CV with ID {cv_id} not found",
        )

    # Authorization check
    if cv.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to delete this CV",
        )

    await db.delete(cv)
    await db.commit()

    logger.info(f"CV {cv_id} deleted by user {current_user.email}")
