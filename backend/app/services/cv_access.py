"""
Accès à un CV possédé — règle d'ownership UNIQUE (M2-T18, symétrique de
`get_owned_job`).

ADR-GATING déc. 4/9 : un CV inconnu ET un CV appartenant à un autre
utilisateur répondent le MÊME 404 — jamais 403, jamais 402. Un code distinct
serait un oracle d'existence (il confirmerait que l'id existe, voire qu'il est
premium). Trois routes (`GET`/`PUT`/`DELETE /cv/{id}`) partageaient cette règle
en trois copies : une règle de sécurité dupliquée finit toujours par diverger,
d'où ce point de vérité unique.

`POST /cv/{id}/export` n'utilise PAS ce helper à dessein : il filtre en SQL sur
`user_id == current_user.id` (sans bypass admin) — un admin ne crée pas d'export
sur le CV d'un autre (moindre privilège, fail-closed) ; il peut en revanche
re-télécharger un export existant (support). Asymétrie assumée (ADR-GATING).
"""

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, UserRole
from app.models.generated_cv import GeneratedCV


async def get_owned_cv(
    db: AsyncSession, cv_id: UUID, current_user: User
) -> GeneratedCV:
    """Charge un CV dont `current_user` est propriétaire (ou admin, support).

    CV inconnu OU d'un autre utilisateur ⇒ 404 identique (aucun oracle,
    ADR-GATING). `user_id` vient de la session, jamais de l'URL. Charge par PK
    sans filtre `user_id` pour que les deux cas suivent le MÊME chemin (pas de
    divergence de timing observable)."""
    cv = (
        (await db.execute(select(GeneratedCV).where(GeneratedCV.id == cv_id)))
        .scalars()
        .first()
    )
    if cv is None or (
        cv.user_id != current_user.id and current_user.role != UserRole.ADMIN
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"CV with ID {cv_id} not found",
        )
    return cv
