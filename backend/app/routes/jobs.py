"""
`GET /jobs/{job_id}` — suivi asynchrone GÉNÉRIQUE, tous `job_type` (M1-T15).

Remplace `GET /cv/jobs/{job_id}` (conservé en alias déprécié, réservé aux
jobs `cv_generation` — rétro-compat V1). Réponse = schéma GÉNÉRÉ du contrat
(`JobStatus`), champs conditionnels respectés : `progress_pct` seulement en
`running`, `result` seulement en `succeeded`, `error_message` seulement en
`failed` (« omis sinon » — response_model_exclude_none).

Le `result` d'un job `cv_generation` pointe le CV produit (`result_kind=cv`).
Les kinds `letter`/`export`/`review` arrivent avec leurs workers (M2-T16,
M6-T10, M7-T04) — aucun job de ces types ne peut être `succeeded` avant.
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import DOWNLOAD_RATE_LIMIT, limiter
from app.database import get_db
from app.generated.models import JobResult, JobResultKind
from app.generated.models import JobStatus as JobStatusContract
from app.models import JobStatus, JobType, User
from app.models.generated_cv import GeneratedCV
from app.routes.auth import get_current_active_user
from app.services import storage_service
from app.services.jobs import get_owned_job

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/jobs", tags=["Jobs"])


def _export_download_path(job_id: UUID) -> str:
    """Chemin RELATIF de téléchargement proxifié (ADR-EXPORT-DELIVERY)."""
    return f"/jobs/{job_id}/download"


@router.get(
    "/{job_id}",
    response_model=JobStatusContract,
    response_model_exclude_none=True,
)
async def get_job_status(
    job_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """État courant d'un job, quel que soit son type. Job inconnu OU d'un autre
    utilisateur ⇒ 404 (aucun oracle d'existence — ADR-GATING ; l'admin accède)."""
    job = await get_owned_job(db, job_id, current_user)

    result = None
    if job.status is JobStatus.SUCCEEDED:
        if job.cv_id is None:
            # Données corrompues (un succeeded SANS résultat ne peut pas
            # venir du worker : cv_id et statut partent dans le même
            # commit). Choix assumé (revue M1-T15 pt 3) : 200 sans `result`
            # — un 500 coincerait le client en polling — mais JAMAIS en
            # silence.
            logger.error(
                "job succeeded sans cv_id — result omis",
                extra={"job_id": str(job.id)},
            )
        elif job.job_type is JobType.CV_GENERATION:
            result = JobResult(result_kind=JobResultKind.cv, result_id=job.cv_id)
        elif job.job_type is JobType.EXPORT:
            # download_url = CHEMIN relatif de la route proxifiée (M2-T17) ;
            # expires_at null : pas d'expiration par secret, la disponibilité
            # suit la rétention du bucket (ADR-EXPORT-DELIVERY).
            result = JobResult(
                result_kind=JobResultKind.export,
                result_id=job.cv_id,
                download_url=_export_download_path(job.id),
            )

    return JobStatusContract(
        job_id=job.id,
        job_type=job.job_type.value,
        status=job.status.value,
        progress_pct=(job.progress_pct if job.status is JobStatus.RUNNING else None),
        result=result,
        error_message=(job.error_message if job.status is JobStatus.FAILED else None),
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


@router.get("/{job_id}/download")
@limiter.limit(DOWNLOAD_RATE_LIMIT)
async def download_job_result(
    request: Request,  # requis par slowapi (rate limit)
    job_id: UUID,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Télécharge le fichier d'un job d'export `succeeded` — PROXIFIÉ par le
    backend (ADR-EXPORT-DELIVERY : bucket privé, ownership à CHAQUE accès).
    Sert l'export COURANT du CV (cv.gcs_pdf_url) : si le CV a été ré-exporté
    depuis, c'est le fichier à jour qui est servi (ADR-EXPORT-DELIVERY).

    404 : job inconnu, d'un autre utilisateur (anti-IDOR strict), non-export,
    ou fichier purgé (relancer l'export). 409 : job pas encore `succeeded`.
    Autorisé sans Pass (D1). Un admin accède (get_owned_job)."""
    # Ownership STRICT : un job d'autrui répond 404 (aucun oracle — ADR-GATING,
    # désormais le comportement par défaut). user_id vient de la session.
    job = await get_owned_job(db, job_id, current_user)
    # Accès admin au fichier d'un autre utilisateur (get_owned_job laisse
    # passer ADMIN) : donnée personnelle ⇒ trace d'AUDIT (revue sécu T17 — on
    # assume l'accès support, on ne le fait jamais en silence).
    if job.user_id != current_user.id:
        logger.warning(
            "download: accès admin au fichier d'un autre utilisateur",
            extra={"job_id": str(job.id), "admin_id": str(current_user.id)},
        )
    if job.job_type is not JobType.EXPORT:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if job.status is not JobStatus.SUCCEEDED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Export not ready. Poll the job status first.",
        )

    cv = await db.get(GeneratedCV, job.cv_id) if job.cv_id else None
    # Invariant EXPLICITE (revue sécu T17) : le CV doit exister ET appartenir
    # au même utilisateur que le job — un job/CV croisé (donnée corrompue) ne
    # sert jamais le fichier d'autrui (le préfixe le refuserait aussi).
    if cv is None or cv.user_id != job.user_id:
        logger.error(
            "download: CV absent ou propriétaire incohérent avec le job",
            extra={"job_id": str(job.id)},
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="File not found"
        )
    object_name = cv.gcs_pdf_url
    # Défense en profondeur (revue T16) : ne JAMAIS servir un pointeur qui ne
    # vit pas sous le préfixe de CE user/CV — un pointeur corrompu ou croisé
    # ne doit pas livrer le fichier d'un autre. Jamais le nom en clair au client.
    expected_prefix = f"exports/{job.user_id}/{job.cv_id}/"
    if not object_name or not object_name.startswith(expected_prefix):
        logger.error(
            "download: pointeur absent ou hors préfixe",
            extra={"job_id": str(job.id)},
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="File not found"
        )

    try:
        pdf = await storage_service.download_export(object_name)
    except storage_service.ExportFileMissingError:
        # Fichier purgé par la rétention : relancer l'export le reproduit.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Export file no longer available. Please export again.",
        )

    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            # Donnée personnelle : pièce jointe, jamais mise en cache, pas de sniff.
            "Content-Disposition": 'attachment; filename="cv.pdf"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            # Défense en profondeur (revue sécu T17) : un PDF servi inline ne
            # doit rien pouvoir charger/exécuter s'il est ouvert dans un onglet.
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )
