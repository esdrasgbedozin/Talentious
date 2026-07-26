"""
Routes d'administration (M8-T02) — lecture seule, rôle admin uniquement.

GET /admin/users : tous les comptes avec leur état (email vérifié, pass
actif + échéance, nombre de CV, nom issu du profil). Aucune action
d'administration sur les comptes n'est exposée en V1.
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import CareerPass, GeneratedCV, User
from app.models.user_profile import UserProfile
from app.services.dependencies import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


def _full_name(profile_data: dict | None) -> str | None:
    if not isinstance(profile_data, dict):
        return None
    pi = profile_data.get("personal_info") or {}
    name = f"{pi.get('first_name') or ''} {pi.get('last_name') or ''}".strip()
    return name or None


@router.get("/users")
async def list_users(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    _admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Liste paginée des comptes, inscriptions récentes d'abord."""
    now = datetime.now(timezone.utc)

    pass_until = (
        select(func.max(CareerPass.valid_until))
        .where(CareerPass.user_id == User.id)
        .where(CareerPass.valid_until > now)
        .correlate(User)
        .scalar_subquery()
    )
    cv_count = (
        select(func.count(GeneratedCV.id))
        .where(GeneratedCV.user_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )

    total = await db.scalar(select(func.count(User.id)))
    rows = await db.execute(
        select(User, UserProfile.profile_data, pass_until, cv_count)
        .outerjoin(UserProfile, UserProfile.user_id == User.id)
        .order_by(User.created_at.desc())
        .limit(limit)
        .offset(offset)
    )

    users = []
    for user, profile_data, valid_until, count in rows.all():
        users.append(
            {
                "id": str(user.id),
                "email": user.email,
                "full_name": _full_name(profile_data),
                "role": user.role.value,
                "email_verified": user.email_verified,
                "created_at": user.created_at,
                "has_active_pass": valid_until is not None,
                "pass_valid_until": valid_until,
                "cv_count": count or 0,
            }
        )

    return {"total": total or 0, "users": users}
