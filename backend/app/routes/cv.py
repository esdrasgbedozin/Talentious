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
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.database import get_db, get_session_factory
from app.generated.models import GeneratedCVData
from app.generated.models import CVTemplate as CVTemplateContract
from app.generated.models import CVTheme as CVThemeContract
from app.generated.models import DocumentLanguage as DocumentLanguageContract
from app.models import (
    CareerPass,
    CVJob,
    CVTemplate,
    CVTheme,
    GeneratedCV,
    JobStatus,
    JobType,
    User,
    UserProfile,
    UserRole,
)
from app.models.generated_cv import ANTHRACITE_TOKENS
from app.routes.auth import get_current_active_user
from app.services.cv_content_coercion import CVContentCoercionError, coerce_cv_content
from app.services.entitlements import can_edit, subject_for
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
    """CV list item for GET /cv — porte l'ENVELOPPE du document (M1-T11)."""

    id: UUID
    cv_name: str
    template_id: str
    theme: CVThemeContract
    language: DocumentLanguageContract
    job_offer_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime


class CVDetailResponse(BaseModel):
    """Detailed CV response for GET /cv/{cv_id} — enveloppe + is_editable
    CALCULÉ à la lecture, jamais persisté (D1, M1-T11)."""

    id: UUID
    cv_name: str
    template_id: str
    theme: CVThemeContract
    language: DocumentLanguageContract
    job_offer_id: Optional[UUID] = None
    job_offer_context: Optional[str]
    cv_data_json: dict
    gcs_pdf_url: Optional[str]
    is_editable: bool
    created_at: datetime
    updated_at: datetime


class UpdateCVRequest(BaseModel):
    """Request model for updating CV"""

    cv_name: Optional[str] = Field(None, min_length=1, max_length=255)
    cv_data_json: Optional[dict] = None


# ==================== HELPER FUNCTIONS ====================


# Nom conventionnel d'un thème sans provenance (le front s'appuie sur
# `theme.id is None` pour l'i18n — la langue du DOCUMENT n'est pas celle de
# l'interface).
CUSTOM_THEME_NAME = "Personnalisé"


def _theme_snapshot(cv: GeneratedCV, preset_name: Optional[str]) -> CVThemeContract:
    """Enveloppe → objet `CVTheme` du contrat : les TOKENS snapshotés font
    foi, `id` n'est que la provenance (NULL = thème personnalisé — T05) ; le
    nom vient du registre pour un preset (immuable, joint à la lecture).
    `is_free` est réservé aux presets du catalogue (readOnly), omis sur un
    document.

    Un `theme_json` stocké corrompu (la base ne garantit que « objet JSON »)
    DÉGRADE vers le défaut anthracite au lieu de rendre 500 toute la liste —
    même doctrine que le rendu (le point de rejet est à l'ÉCRITURE,
    ADR-THEME-DECOUPLED ; revue M1-T11). La provenance est retirée (plus
    garantie) et l'incident loggé sans les tokens (charge potentiellement
    hostile)."""
    try:
        return CVThemeContract(
            id=cv.theme_preset_id,
            name=preset_name or CUSTOM_THEME_NAME,
            tokens=cv.theme_json,
        )
    except ValidationError:
        logger.error(
            "theme_json corrompu servi en repli anthracite",
            extra={"cv_id": str(cv.id)},
        )
        return CVThemeContract(
            id=None, name=CUSTOM_THEME_NAME, tokens=ANTHRACITE_TOKENS
        )


async def _detail_response(
    db: AsyncSession, current_user: User, cv: GeneratedCV
) -> CVDetailResponse:
    """Forme unique de la réponse détail (GET et PUT — revue M1-T11 pt 3) :
    nom du preset depuis le registre, `is_editable` CALCULÉ (jamais
    persisté)."""
    preset_name = None
    if cv.theme_preset_id is not None:
        preset_name = (
            await db.execute(
                select(CVTheme.name).where(CVTheme.id == cv.theme_preset_id)
            )
        ).scalar_one_or_none()
    subject = await subject_for(db, current_user)
    editable = can_edit(subject, created_under_pass=cv.created_under_pass)
    return CVDetailResponse(
        id=cv.id,
        cv_name=cv.cv_name,
        template_id=cv.template_id,
        theme=_theme_snapshot(cv, preset_name),
        language=DocumentLanguageContract(cv.language.value),
        job_offer_id=cv.offer_id,
        job_offer_context=cv.job_offer_context,
        cv_data_json=cv.cv_data_json,
        gcs_pdf_url=cv.gcs_pdf_url,
        is_editable=editable.allowed,
        created_at=cv.created_at,
        updated_at=cv.updated_at,
    )


def _is_active_job_conflict(exc: IntegrityError) -> bool:
    """True si l'IntegrityError vient de l'index partiel d'unicité d'un job
    actif par (user, job_type) — la course entre deux lancements concurrents
    du même type. Toute autre cause doit remonter telle quelle (revue data
    M1-T06). À factoriser en helper partagé quand les routes lettre/export/
    relecture arriveront (M2-T16, M6-T10, M7-T04)."""
    return "uq_cv_jobs_one_active_per_user_type" in str(exc.orig)


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

    # 3. Idempotency: at most one active (queued/running) job per (user,
    # job_type) — contract `JobType` (M1-T06): an active export or letter job
    # must NOT block a CV generation. Fast-path pre-check for a friendly 409...
    active = await db.execute(
        select(CVJob)
        .where(CVJob.user_id == current_user.id)
        .where(CVJob.job_type == JobType.CV_GENERATION)
        .where(CVJob.status.in_([JobStatus.QUEUED, JobStatus.RUNNING]))
    )
    if active.scalars().first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A CV generation is already in progress. Please wait for it to finish.",
        )

    # 4. Create the job and schedule the background pipeline. The partial unique
    # index (uq_cv_jobs_one_active_per_user_type) is the real guard against a
    # race between two concurrent requests — catch its violation and return 409.
    job = CVJob(
        user_id=current_user.id,
        cv_name=request.cv_name,
        status=JobStatus.QUEUED,
        job_type=JobType.CV_GENERATION,
        progress_pct=0,
    )
    db.add(job)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        # Only the active-slot unique index means "already in progress" — any
        # other integrity violation (FK on a deleted user, NOT NULL…) must
        # surface as the server error it is, not masquerade as a 409.
        if not _is_active_job_conflict(exc):
            raise
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


# Chemins LITTÉRAUX déclarés avant la route paramétrée "/{cv_id}" (contrat :
# « Chemin littéral : prioritaire ») — FastAPI matche dans l'ordre
# d'enregistrement, les déplacer après l'avalerait en 422 "invalid uuid".


@router.get("/templates", response_model=list[CVTemplateContract])
async def list_cv_templates(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Catalogue des Templates (M1-T10) — DATA-DRIVEN depuis le registre
    `cv_templates` (seedé par migrations), jamais une liste en dur. Tous les
    templates sont listés, gratuits comme premium (l'aperçu est libre ; c'est
    la GÉNÉRATION/ÉDITION premium qui répond 402 — gating M1-T12)."""
    result = await db.execute(select(CVTemplate).order_by(CVTemplate.id))
    return [
        CVTemplateContract(
            id=template.id,
            name=template.name,
            sector=template.sector.value,
            is_free=template.is_free,
            description=template.description,
            preview_url=template.preview_url,
            default_theme_id=template.default_theme_id,
        )
        for template in result.scalars().all()
    ]


@router.get("/themes", response_model=list[CVThemeContract])
async def list_cv_themes(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Catalogue des presets de Thème CV (M1-T10) — registre `cv_themes`
    (système, immuable, géré par migrations). Un preset est un POINT DE
    DÉPART : le client renvoie le thème choisi INLINE, le serveur le
    snapshote (jamais de référence mutable — ADR-THEME-DECOUPLED)."""
    result = await db.execute(select(CVTheme).order_by(CVTheme.id))
    return [
        CVThemeContract(
            id=theme.id,
            name=theme.name,
            tokens=theme.tokens,
            is_free=theme.is_free,
        )
        for theme in result.scalars().all()
    ]


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
    # Jointure sur le registre pour le NOM du preset (une requête, pas de
    # N+1) ; outerjoin : un thème custom n'a pas de provenance (T05).
    result = await db.execute(
        select(GeneratedCV, CVTheme.name)
        .outerjoin(CVTheme, GeneratedCV.theme_preset_id == CVTheme.id)
        .where(GeneratedCV.user_id == current_user.id)
        .order_by(GeneratedCV.created_at.desc())
    )

    return [
        CVListItem(
            id=cv.id,
            cv_name=cv.cv_name,
            template_id=cv.template_id,
            theme=_theme_snapshot(cv, preset_name),
            language=DocumentLanguageContract(cv.language.value),
            job_offer_id=cv.offer_id,
            created_at=cv.created_at,
            updated_at=cv.updated_at,
        )
        for cv, preset_name in result.all()
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

    # Authorization check (403 contrat V1 — harmonisation 404 anti-IDOR
    # tracée pour la matrice M9-T11, ADR-GATING).
    if cv.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this CV",
        )

    return await _detail_response(db, current_user, cv)


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

    # Authorization check (ownership D'ABORD, gating ENSUITE — ADR-GATING).
    if cv.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to update this CV",
        )

    # Gating D1 (revue M1-T11 pt 2) : l'ÉCRITURE suit la même règle que
    # is_editable — un document créé sous Pass ne se modifie pas sans Pass
    # actif. Cohérence : le PUT ne peut pas réussir là où la réponse dirait
    # « verrouillé ».
    subject = await subject_for(db, current_user)
    if not can_edit(subject, created_under_pass=cv.created_under_pass).allowed:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                "Ce document a été créé avec un Pass : son édition requiert "
                "un Pass actif (la lecture et le téléchargement restent "
                "libres)."
            ),
        )

    # Update fields
    if request.cv_name is not None:
        cv.cv_name = request.cv_name
    if request.cv_data_json is not None:
        # Même ceinture de sécurité que la génération : le contenu édité est aussi
        # l'entrée directe du rendu HTML serveur V2 (export-service). On coerce en
        # liste blanche PUIS on valide le schéma canonique ; un contenu dangereux ou
        # inexploitable est refusé (422) plutôt que stocké brut (faille XSS/SSRF).
        # Contrairement à la génération, l'identité N'est PAS ancrée sur le profil :
        # ici c'est le propriétaire authentifié qui édite ses propres données.
        try:
            coerced, _ = coerce_cv_content(request.cv_data_json)
            GeneratedCVData.model_validate(coerced)
        except (CVContentCoercionError, ValidationError):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Le contenu du CV est invalide ou n'a pas pu être validé.",
            )
        cv.cv_data_json = coerced

    cv.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(cv)

    # Même forme de réponse que GET /cv/{id} (helper partagé — M1-T11).
    # L'ÉDITION de l'enveloppe via PUT (template/thème/langue + 402 typés)
    # arrive avec M1-T12+ — ici on ne fait que SERVIR.
    return await _detail_response(db, current_user, cv)


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
