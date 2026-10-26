"""
CV Generation Router
Orchestrates the full AI pipeline: Analyzer → Writer
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    Response,
    status,
)
from fastapi.responses import StreamingResponse

from app.core.rate_limit import EXPORT_RATE_LIMIT, limiter
from pydantic import BaseModel, Field, ValidationError, model_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.database import get_db, get_session_factory
from app.generated.models import (
    ExportFormat,
    ExportJobAccepted,
    ExportRequest,
    GeneratedCVData,
)
from app.generated.models import CVTemplate as CVTemplateContract
from app.generated.models import CVTheme as CVThemeContract
from app.generated.models import DocumentLanguage as DocumentLanguageContract
from app.models import (
    CVJob,
    CVTemplate,
    CVTheme,
    GeneratedCV,
    JobStatus,
    JobType,
    User,
    UserProfile,
)
from app.config import settings
from app.core.problem import ProblemException
from app.models.generated_cv import ANTHRACITE_TOKENS, DocumentLanguage
from app.routes.auth import get_current_active_user
from app.services.cv_content_coercion import CVContentCoercionError, coerce_cv_content
from app.services.cv_access import get_owned_cv
from app.services.jobs import get_owned_job
from app.services.entitlements import (
    Decision,
    DenialReason,
    can_create_variant,
    can_edit,
    can_use_language,
    can_use_template,
    can_use_theme,
    count_variants,
    subject_for,
)
from app.services.theme_validation import ThemeValidationError, validate_theme_tokens
from app.services.cv_worker import (
    DEFAULT_TEMPLATE_ID,
    CVEnvelope,
    run_cv_generation,
)
from app.services.export_worker import run_export_job

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cv", tags=["CV Generation"])


# ==================== REQUEST/RESPONSE MODELS ====================


class GenerateCVRequest(BaseModel):
    """Request model for CV generation — enveloppe optionnelle (M1-T12) :
    la requête V1 nue (cv_name + offer_text) reste valide."""

    cv_name: str = Field(
        ..., min_length=1, max_length=255, description="Name for the generated CV"
    )
    offer_text: str = Field(
        ...,
        min_length=50,
        max_length=200000,
        description="Job offer text (50 to 200,000 characters)",
    )
    # Nullable comme au contrat généré : null explicite = défaut (revue pt 8).
    template_id: Optional[str] = Field(
        DEFAULT_TEMPLATE_ID,
        min_length=1,
        max_length=64,
        description="Template du document (défaut : le template gratuit)",
    )
    theme: Optional[CVThemeContract] = Field(
        None,
        description="Thème CV inline (preset tel quel ou modifié) ; omis = "
        "thème par défaut du template",
    )
    target_language: DocumentLanguageContract = Field(
        DocumentLanguageContract.fr,
        description="Langue du document (en = premium, drapeau R6)",
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
    is_editable: bool
    created_at: datetime
    updated_at: datetime


class UpdateCVRequest(BaseModel):
    """Request model for updating CV — contenu ET enveloppe, INDÉPENDANTS
    (M1-T14, contrat : tous optionnels, au moins un fourni ; PUT à sémantique
    partielle, écart V1 assumé)."""

    cv_name: Optional[str] = Field(None, min_length=1, max_length=255)
    cv_data_json: Optional[dict] = None
    template_id: Optional[str] = Field(None, min_length=1, max_length=64)
    theme: Optional[CVThemeContract] = None
    language: Optional[DocumentLanguageContract] = None

    @model_validator(mode="after")
    def _au_moins_un_champ(self) -> "UpdateCVRequest":
        if all(
            value is None
            for value in (
                self.cv_name,
                self.cv_data_json,
                self.template_id,
                self.theme,
                self.language,
            )
        ):
            raise ValueError("au moins un champ doit être fourni")
        return self


# ==================== HELPER FUNCTIONS ====================


# Nom conventionnel d'un thème sans provenance (le front s'appuie sur
# `theme.id is None` pour l'i18n — la langue du DOCUMENT n'est pas celle de
# l'interface).
CUSTOM_THEME_NAME = "Personnalisé"

# Détails humains des refus typés (le `type` RFC 7807 vient du DenialReason).
_DENIAL_DETAILS = {
    DenialReason.CAREER_PASS_REQUIRED: (
        "An active Career Pass is required for this feature."
    ),
    DenialReason.PREMIUM_TEMPLATE_REQUIRED: (
        "This template is premium: an active Career Pass is required."
    ),
    DenialReason.PREMIUM_THEME_REQUIRED: (
        "Custom or premium themes require an active Career Pass."
    ),
    DenialReason.PREMIUM_LANGUAGE_REQUIRED: (
        "Generating a document in English requires an active Career Pass."
    ),
    DenialReason.VARIANT_LIMIT_REACHED: (
        "The free tier allows a single CV variant. Your existing documents "
        "remain readable and downloadable."
    ),
}


def _deny_if(decision: Decision) -> None:
    """Transporte un refus d'entitlements en réponse RFC 7807 TYPÉE (M1-T12) :
    le `type` du Problem est l'URL exacte du contrat, le statut vient du
    motif (401 anonyme / 402 premium)."""
    if decision.allowed:
        return
    raise ProblemException(
        decision.reason.http_status,
        detail=_DENIAL_DETAILS.get(
            decision.reason, "This capability requires an active Career Pass."
        ),
        type_=decision.reason.value,
    )


# Gating d'enveloppe partagé entre POST /cv/generate (M1-T12) et PUT /cv/{id}
# (M1-T14) : pour chaque ressource, EXISTENCE d'abord (422 — jamais un 402
# trompeur sur un id inconnu, ADR-GATING déc. 6), gating ensuite (402 typé).


async def _resolve_and_gate_template(db, subject, template_id: str) -> CVTemplate:
    template = (
        (await db.execute(select(CVTemplate).where(CVTemplate.id == template_id)))
        .scalars()
        .first()
    )
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Template inconnu : {template_id}",
        )
    _deny_if(can_use_template(subject, is_free=template.is_free))
    return template


async def _resolve_and_gate_theme(
    db, subject, theme: CVThemeContract
) -> tuple[dict, Optional[str], bool]:
    """→ (tokens validés, provenance, is_premium). Structure + lisibilité
    (M1-T09, 422), puis provenance : un preset MODIFIÉ est un thème
    personnalisé (contrat) — custom ou preset premium ⇒ gating 402."""
    try:
        validated_tokens = validate_theme_tokens(theme.tokens.model_dump())
    except ThemeValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    tokens = validated_tokens.model_dump()
    preset_id = None  # sans provenance : personnalisé
    preset_is_free = None  # personnalisé = premium
    if theme.id is not None:
        preset = (
            (await db.execute(select(CVTheme).where(CVTheme.id == theme.id)))
            .scalars()
            .first()
        )
        if preset is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Preset de thème inconnu : {theme.id}",
            )
        if tokens == preset.tokens:
            preset_is_free = preset.is_free
            preset_id = preset.id
    _deny_if(can_use_theme(subject, preset_is_free=preset_is_free))
    return tokens, preset_id, preset_is_free is not True


def _gate_language(subject, language: DocumentLanguageContract) -> None:
    """Gating (402 typé) PUIS drapeau R6 — un user gratuit reçoit l'upsell
    honnête, un user outillé reçoit le 422 explicite tant que la génération
    EN n'existe pas (M7-T11)."""
    if language is DocumentLanguageContract.fr:
        return
    _deny_if(can_use_language(subject, DocumentLanguage(language.value)))
    if not settings.target_language_en_enabled:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "target_language 'en' est désactivé pour l'instant "
                "(drapeau serveur, livraison M7-T11)."
            ),
        )


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


# (M1-T12) check_career_pass_or_admin supprimé : la génération est freemium,
# le gating passe par app/services/entitlements (subject_for + décisions).


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

    FREEMIUM (M1-T12) : vérifie le profil puis le gating entitlements —
    existence des ressources (422), capacités premium en 402 TYPÉS du contrat
    (template/thème/langue), quota d'1 variante gratuite par COUNT — garantit
    qu'une seule génération est active par (user, type) (idempotence), crée
    un `CVJob` `queued` puis lance le pipeline IA en tâche de fond. Retourne
    `202` avec le `job_id`. L'enveloppe validée est PERSISTÉE par le worker à
    M1-T13 (hors périmètre ici).

    Raises:
        ProblemException(402): capacité premium sans Pass actif (type RFC
            7807 du contrat : premium-template/theme/language-required,
            variant-limit-reached)
        ProblemException(429): plafond journalier de lancements atteint
            (non-Pass, generation-daily-cap)
        HTTPException(404): profil utilisateur absent
        HTTPException(422): template/preset inconnu, thème invalide, langue
            désactivée par drapeau (R6)
        HTTPException(409): une génération est déjà en cours pour cet utilisateur
    """
    # 1. (M1-T12) La génération est FREEMIUM (Bible §4.3) : le « Pass
    # obligatoire » V1 est remplacé par le gating entitlements ci-dessous
    # (quota d'1 variante gratuite + capacités premium en 402 TYPÉS).

    # 2. The user must have a profile to generate from.
    result = await db.execute(
        select(UserProfile).where(UserProfile.user_id == current_user.id)
    )
    if result.scalars().first() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found. Please create your profile first.",
        )

    # 3. Gating entitlements (M1-T12) — helpers partagés avec PUT (M1-T14).
    subject = await subject_for(db, current_user)

    # Template (null explicite = défaut gratuit — contrat, revue pt 8).
    template = await _resolve_and_gate_template(
        db, subject, request.template_id or DEFAULT_TEMPLATE_ID
    )

    # Thème inline (optionnel) : enveloppe EFFECTIVE (tokens + provenance)
    # que le worker persistera (M1-T13).
    theme_is_premium = False
    if request.theme is not None:
        (
            effective_tokens,
            effective_preset_id,
            theme_is_premium,
        ) = await _resolve_and_gate_theme(db, subject, request.theme)
    else:
        # Thème omis : le preset PAR DÉFAUT du template s'applique (contrat) ;
        # repli anthracite (D2) si le template n'en référence aucun.
        default_preset_id = template.default_theme_id or "anthracite"
        default_preset = await db.get(CVTheme, default_preset_id)
        if default_preset is not None and not default_preset.is_free:
            # Défaut PREMIUM hérité (revue data M1-T13 pt 1) : jamais servi
            # en douce. Un sujet outillé le reçoit (capacité consommée,
            # flaguée) ; un sujet gratuit retombe sur anthracite — on ne
            # bloque pas un parcours V1 nu pour un défaut qu'il n'a pas
            # demandé (pas de 402 ici, contrairement au thème EXPLICITE).
            if subject.is_admin or subject.has_active_pass:
                theme_is_premium = True
            else:
                default_preset = await db.get(CVTheme, "anthracite")
        if default_preset is not None:
            effective_tokens = default_preset.tokens
            effective_preset_id = default_preset.id
        else:
            # Défense en profondeur INATTEIGNABLE par construction (les FK
            # RESTRICT garantissent l'existence des presets référencés) :
            # provenance NULL assumée — le document s'affichera
            # « Personnalisé » (revue pt 2), état exceptionnel loggé.
            logger.error(
                "preset par défaut introuvable, repli anthracite",
                extra={"preset_id": default_preset_id},
            )
            effective_tokens = ANTHRACITE_TOKENS
            effective_preset_id = None

    # Langue : gating 402 typé puis drapeau R6 (helper partagé).
    _gate_language(subject, request.target_language)

    # 4. Idempotency: at most one active (queued/running) job per (user,
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

    # Quota : la gratuité autorise UNE variante (COUNT à la demande).
    # APRÈS le contrôle « job actif » (revue sécu M1-T12 pt 2) : le worker
    # écrit le CV et clôt le job dans le MÊME commit — « aucun job actif »
    # garantit donc que tout CV d'une génération précédente est déjà visible
    # au COUNT (ferme la fenêtre quota lu avant la fin du job A).
    _deny_if(
        can_create_variant(
            subject, variant_count=await count_variants(db, current_user.id)
        )
    )

    # Frein de coût IA (revue sécu M1-T12 pt 1) : le quota de variantes est
    # un quota de STOCK — générer/supprimer/regénérer le contourne, et chaque
    # lancement coûte deux appels Vertex. Plafond de LANCEMENTS par 24 h pour
    # les non-Pass, compté en base sur les jobs (multi-instance, insensible
    # aux suppressions). 429 typé au contrat (generation-daily-cap).
    if not (subject.is_admin or subject.has_active_pass):
        attempts = (
            await db.execute(
                select(func.count())
                .select_from(CVJob)
                .where(CVJob.user_id == current_user.id)
                .where(CVJob.job_type == JobType.CV_GENERATION)
                .where(
                    CVJob.created_at >= datetime.now(timezone.utc) - timedelta(hours=24)
                )
            )
        ).scalar_one()
        if attempts >= settings.free_daily_generation_cap:
            raise ProblemException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    "Daily free generation limit reached. Try again tomorrow "
                    "or activate a Career Pass."
                ),
                type_="https://talentious.fr/errors/generation-daily-cap",
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

    # Enveloppe EFFECTIVE, validée et gatée ci-dessus, persistée par le
    # worker (M1-T13). created_under_pass = capacité premium CONSOMMÉE
    # (sens « entièrement gratuit » du contrat is_editable, D1) — pas
    # simplement « un Pass était actif ».
    envelope = CVEnvelope(
        template_id=template.id,
        # Copie défensive (revue data M1-T13 pt 6) : effective_tokens peut
        # être l'objet VIVANT du registre ORM ou la constante globale — une
        # mutation future les corromprait silencieusement.
        theme_json=dict(effective_tokens),
        theme_preset_id=effective_preset_id,
        language=DocumentLanguage(request.target_language.value),
        created_under_pass=(
            (not template.is_free)
            or theme_is_premium
            or request.target_language is not DocumentLanguageContract.fr
        ),
    )
    background_tasks.add_task(
        run_cv_generation,
        session_factory,
        job.id,
        current_user.id,
        request.cv_name,
        request.offer_text,
        envelope,
    )

    response.headers["Location"] = f"/cv/jobs/{job.id}"
    return GenerateCVJobAccepted(job_id=job.id, status=job.status)


_EXPORT_IN_PROGRESS = "An export is already in progress. Please wait for it to finish."


@router.post(
    "/{cv_id}/export",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=ExportJobAccepted,
)
@limiter.limit(EXPORT_RATE_LIMIT)
async def export_cv(
    request: Request,  # requis par slowapi (rate limit) — distinct du corps
    cv_id: UUID,
    payload: ExportRequest,
    response: Response,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    session_factory: async_sessionmaker = Depends(get_session_factory),
):
    """Lance l'export asynchrone d'un CV possédé (`job_type=export`).

    Gating = OWNERSHIP (D1) : exporter un document possédé n'est PAS premium —
    le PDF est autorisé sans Pass. `docx` est refusé par le drapeau R6 tant que
    M8-T05/T07 n'a pas livré le rendu docx (422, jamais un échec sale en aval).

    Raises:
        HTTPException(404): CV inexistant OU appartenant à un autre utilisateur
            (anti-IDOR : aucun oracle d'existence).
        HTTPException(422): format `docx` tant que le drapeau est désactivé.
        HTTPException(409): un export est déjà en cours pour cet utilisateur.
    """
    # Ownership : un CV d'autrui répond comme un inexistant (anti-IDOR). Le
    # user_id vient de la SESSION authentifiée, jamais de la requête.
    cv = (
        (
            await db.execute(
                select(GeneratedCV)
                .where(GeneratedCV.id == cv_id)
                .where(GeneratedCV.user_id == current_user.id)
            )
        )
        .scalars()
        .first()
    )
    if cv is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="CV not found"
        )

    # docx : capacité au contrat mais non implémentée (R6) — drapeau off ⇒ 422
    # explicite, même avec un Pass (la gratuité premium viendra à M8-T07).
    if payload.format is ExportFormat.docx and not settings.export_docx_enabled:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="L'export docx n'est pas encore disponible.",
        )

    # Idempotence : au plus un export actif par utilisateur (pré-check amical,
    # l'index partiel uq_cv_jobs_one_active_per_user_type reste le vrai garde).
    active = await db.execute(
        select(CVJob)
        .where(CVJob.user_id == current_user.id)
        .where(CVJob.job_type == JobType.EXPORT)
        .where(CVJob.status.in_([JobStatus.QUEUED, JobStatus.RUNNING]))
    )
    if active.scalars().first() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=_EXPORT_IN_PROGRESS,
        )

    job = CVJob(
        user_id=current_user.id,
        cv_name=cv.cv_name,
        status=JobStatus.QUEUED,
        job_type=JobType.EXPORT,
        cv_id=cv.id,
        progress_pct=0,
    )
    db.add(job)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if not _is_active_job_conflict(exc):
            raise
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=_EXPORT_IN_PROGRESS,
        )
    await db.refresh(job)

    background_tasks.add_task(run_export_job, session_factory, job.id)
    response.headers["Location"] = f"/jobs/{job.id}"
    return ExportJobAccepted(
        job_id=job.id,
        job_type="export",
        status="queued",
        format=payload.format,
        message="Export job accepted. Poll GET /jobs/{job_id} for status.",
    )


async def _get_owned_cv_generation_job(
    cv_job_id: UUID, current_user: User, db: AsyncSession
) -> CVJob:
    """Alias V1 (polling + SSE) : ownership via le service PARTAGÉ (règle
    unique — revue M1-T15 pt 2), restreint aux jobs `cv_generation`
    (contrat : un job d'un autre type répond 404 sur les endpoints
    dépréciés, SSE compris)."""
    return await get_owned_job(
        db, cv_job_id, current_user, job_types=(JobType.CV_GENERATION,)
    )


@router.get("/jobs/{cv_job_id}", response_model=CVJobStatus)
async def get_cv_job(
    cv_job_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Poll the status of an asynchronous CV generation job.

    Alias DÉPRÉCIÉ (contrat) : réservé aux jobs `cv_generation` — un job
    d'un autre type répond 404 (M1-T15) ; préférer `GET /jobs/{job_id}`.
    """
    job = await _get_owned_cv_generation_job(cv_job_id, current_user, db)
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
    # Ownership + filtre cv_generation (contrat : SSE réservé à ce type —
    # revue M1-T15 pt 1) AVANT d'ouvrir le flux.
    await _get_owned_cv_generation_job(cv_job_id, current_user, db)

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
        HTTPException(404): CV inconnu OU appartenant à un autre utilisateur
            (ADR-GATING : accès croisé = 404, aucun oracle d'existence)
    """
    cv = await get_owned_cv(db, cv_id, current_user)
    return await _detail_response(db, current_user, cv)


@router.put("/{cv_id}", response_model=CVDetailResponse)
async def update_cv(
    cv_id: UUID,
    request: UpdateCVRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Met à jour nom, contenu (`cv_data_json`) et/ou ENVELOPPE (`template_id`,
    `theme`, `language`) — sémantique PARTIELLE, champs indépendants
    (M1-T14) : modifier l'un ne modifie jamais l'autre. Tout est validé et
    gaté AVANT la première mutation (aucune écriture partielle, commit
    unique). Les capacités d'enveloppe suivent le plan du PROPRIÉTAIRE du
    document (un admin édite en support, il ne « donne » pas de premium).
    Cliquet monotone : introduire une capacité premium pose
    created_under_pass=true, jamais l'inverse (ADR-GATING déc. 8).

    Raises:
        HTTPException(404): CV inconnu OU appartenant à un autre utilisateur
            (ADR-GATING : accès croisé = 404, aucun oracle d'existence)
        ProblemException(402): édition d'un doc créé sous Pass sans Pass
            actif (D1), ou capacité premium introduite sans droit (types
            RFC 7807 du contrat)
        HTTPException(422): corps vide, contenu invalide, template/preset
            inconnu, thème illisible, langue désactivée (drapeau R6)
    """
    # ADR-GATING (M2-T18) : ownership D'ABORD (404 inconnu/croisé, aucun
    # oracle), gating premium (402) ENSUITE seulement — jamais un 402 avant le
    # 404 qui révélerait qu'un CV d'autrui existe ET qu'il est premium.
    cv = await get_owned_cv(db, cv_id, current_user)

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

    # Sujet du PROPRIÉTAIRE pour les capacités d'enveloppe (revue M1-T14
    # pt 1) : un admin édite en SUPPORT (bypass du gate D1 ci-dessus,
    # assumé à l'ADR-GATING), mais les capacités premium suivent le PLAN DU
    # PROPRIÉTAIRE — sinon l'admin poserait du premium sur le document d'un
    # user gratuit et le verrouillerait (cliquet) sans issue pour lui.
    if cv.user_id == current_user.id:
        envelope_subject = subject
    else:
        owner = await db.get(User, cv.user_id)
        envelope_subject = await subject_for(db, owner)

    # ÉDITION (M1-T14) — « tout valider/gater, PUIS muter » (revue pt 5) :
    # chaque champ est indépendant (sémantique partielle), un 402/422 sur
    # n'importe lequel ne laisse AUCUNE écriture partielle.
    # 1) Validations et gating, sans mutation.
    coerced_content = None
    if request.cv_data_json is not None:
        # Même ceinture de sécurité que la génération : le contenu édité est
        # aussi l'entrée directe du rendu HTML serveur V2 (export-service).
        # Coercition en liste blanche PUIS validation du schéma canonique ;
        # un contenu dangereux ou inexploitable est refusé (422) plutôt que
        # stocké brut (faille XSS/SSRF). Contrairement à la génération,
        # l'identité N'est PAS ancrée sur le profil : ici c'est le
        # propriétaire authentifié qui édite ses propres données.
        try:
            coerced_content, _ = coerce_cv_content(request.cv_data_json)
            GeneratedCVData.model_validate(coerced_content)
        except (CVContentCoercionError, ValidationError):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Le contenu du CV est invalide ou n'a pas pu être validé.",
            )
    new_template = None
    if request.template_id is not None:
        new_template = await _resolve_and_gate_template(
            db, envelope_subject, request.template_id
        )
    new_theme = None
    if request.theme is not None:
        new_theme = await _resolve_and_gate_theme(db, envelope_subject, request.theme)
    if request.language is not None:
        _gate_language(envelope_subject, request.language)

    # 2) Mutations (plus aucune levée possible à partir d'ici).
    premium_introduced = False
    if new_template is not None:
        cv.template_id = new_template.id
        premium_introduced = premium_introduced or not new_template.is_free
    if new_theme is not None:
        tokens, preset_id, theme_is_premium = new_theme
        # Règle T05 (a) : theme_json et theme_preset_id s'écrivent TOUJOURS
        # ensemble. Sur un UPDATE, l'affectation explicite de None émet bien
        # SET NULL (le piège server_default de M1-T11 ne concerne que
        # l'INSERT qui OMET la colonne) — prouvé en SQL par les tests.
        cv.theme_json = dict(tokens)
        cv.theme_preset_id = preset_id
        premium_introduced = premium_introduced or theme_is_premium
    if request.language is not None:
        cv.language = DocumentLanguage(request.language.value)
        premium_introduced = premium_introduced or (
            request.language is not DocumentLanguageContract.fr
        )
    if premium_introduced and not cv.created_under_pass:
        # CLIQUET MONOTONE (ADR-GATING déc. 8) : introduire une capacité
        # premium verrouille le document — jamais l'inverse.
        cv.created_under_pass = True
    if request.cv_name is not None:
        cv.cv_name = request.cv_name
    if coerced_content is not None:
        cv.cv_data_json = coerced_content

    cv.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(cv)

    # Même forme de réponse que GET /cv/{id} (helper partagé — M1-T11).
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
        HTTPException(404): CV inconnu OU appartenant à un autre utilisateur
            (ADR-GATING : accès croisé = 404, aucun oracle d'existence)
    """
    cv = await get_owned_cv(db, cv_id, current_user)
    await db.delete(cv)
    await db.commit()

    logger.info(f"CV {cv_id} deleted by user {current_user.email}")
