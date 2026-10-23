"""
Accès aux jobs asynchrones — règle d'ownership UNIQUE (M1-T15, revue pt 2).

Une seule implémentation du « 404 inconnu / 403 job d'autrui (admin passe) /
404 type hors périmètre », partagée par `GET /jobs/{id}`, l'alias déprécié
`GET /cv/jobs/{id}` et son flux SSE : deux copies d'une règle de sécurité
finissent toujours par diverger.

Le filtre de type répond le MÊME 404 que l'inconnu (pas d'oracle : seul le
propriétaire — ou un admin — apprend qu'un job existe, jamais son type via
un endpoint qui ne le couvre pas).
"""

from typing import Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CVJob, JobType, User, UserRole


async def get_owned_job(
    db: AsyncSession,
    job_id: UUID,
    current_user: User,
    *,
    job_types: Optional[tuple[JobType, ...]] = None,
) -> CVJob:
    """Charge un job avec ownership (ou admin) ; `job_types` restreint les
    types servis (alias dépréciés) — hors périmètre ⇒ 404 identique à
    l'inconnu."""
    job = (await db.execute(select(CVJob).where(CVJob.id == job_id))).scalars().first()
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found",
        )
    if job.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this job",
        )
    if job_types is not None and job.job_type not in job_types:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found",
        )
    return job
