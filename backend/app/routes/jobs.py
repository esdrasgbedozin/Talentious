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

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.generated.models import JobResult, JobResultKind
from app.generated.models import JobStatus as JobStatusContract
from app.models import JobStatus, JobType, User
from app.routes.auth import get_current_active_user
from app.services.jobs import get_owned_job

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/jobs", tags=["Jobs"])


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
    """État courant d'un job, quel que soit son type. 404 inconnu, 403 job
    d'autrui (contrat — même règle d'ownership que l'alias V1)."""
    job = await get_owned_job(db, job_id, current_user)

    result = None
    if job.status is JobStatus.SUCCEEDED and job.job_type is JobType.CV_GENERATION:
        if job.cv_id is not None:
            result = JobResult(result_kind=JobResultKind.cv, result_id=job.cv_id)
        else:
            # Données corrompues (un succeeded SANS résultat ne peut pas
            # venir du worker : cv_id et statut partent dans le même
            # commit). Choix assumé (revue M1-T15 pt 3) : 200 sans `result`
            # — un 500 coincerait le client en polling — mais JAMAIS en
            # silence.
            logger.error(
                "job succeeded sans cv_id — result omis",
                extra={"job_id": str(job.id)},
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
