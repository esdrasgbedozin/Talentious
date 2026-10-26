"""
Accès aux jobs asynchrones — règle d'ownership UNIQUE (M1-T15, revue pt 2).

Une seule implémentation du « 404 inconnu / 404 job d'autrui (admin passe) /
404 type hors périmètre », partagée par `GET /jobs/{id}`, l'alias déprécié
`GET /cv/jobs/{id}` et son flux SSE : deux copies d'une règle de sécurité
finissent toujours par diverger.

ADR-GATING (M2-T18) : un job d'un AUTRE utilisateur répond le MÊME 404 que
l'inconnu — jamais 403. Un 403 serait un oracle d'existence (il révèle que le
`job_id` existe bel et bien) ; la posture anti-IDOR du projet est qu'un
non-propriétaire ne distingue pas « n'existe pas » de « pas à toi ». L'admin,
lui, accède (support). Le filtre de type répond ce même 404 (un endpoint qui
ne couvre pas le type ne révèle pas que le job existe).
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
    l'inconnu.

    ADR-GATING (M2-T18) : un job inconnu, appartenant à un autre utilisateur,
    ou d'un type hors périmètre répondent TOUS le même 404 — jamais 403 (aucun
    oracle d'existence pour un non-propriétaire). L'admin accède (support)."""
    job = (await db.execute(select(CVJob).where(CVJob.id == job_id))).scalars().first()
    if job is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found",
        )
    if job.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        # Non-propriétaire (hors admin) : 404, jamais 403 — ne pas confirmer
        # l'existence du job (anti-IDOR, ADR-GATING).
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found",
        )
    if job_types is not None and job.job_type not in job_types:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job {job_id} not found",
        )
    return job
