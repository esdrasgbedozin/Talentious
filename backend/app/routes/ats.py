"""Route Score ATS (M5-T09) : POST /cv/{cv_id}/ats-score.

Synchrone, deterministe (aucun LLM dans le calcul). La route reste mince : elle
authentifie, verifie l'ownership (404 anti-IDOR), delegue l'orchestration au
service `ats_service`, et applique la troncature du detail selon le Pass (T10).
"""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.generated.models import ATSScoreRequest, ATSScoreResult
from app.models import User
from app.routes.auth import get_current_active_user
from app.services import ats_service
from app.services.ats_scoring import compute_ats_score
from app.services.entitlements import subject_for

router = APIRouter(prefix="/cv", tags=["ATS"])


@router.post("/{cv_id}/ats-score", response_model=ATSScoreResult)
async def compute_ats_score_endpoint(
    cv_id: UUID,
    request: ATSScoreRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> ATSScoreResult:
    """Calcule et persiste le Score ATS d'un CV face a une offre."""
    cv = await ats_service.load_owned_cv(db, cv_id, current_user)  # 404 fail-closed
    offer = await ats_service.resolve_offer(db, current_user, request)  # 422/404
    keywords = await ats_service.ensure_analysis_keywords(db, offer)  # 502 si agent KO
    computed = compute_ats_score(keywords, cv.cv_data_json)
    await ats_service.upsert_ats_score(db, cv.id, offer.id, computed)
    subject = await subject_for(db, current_user)
    await db.commit()
    return ats_service.build_result(
        cv,
        offer,
        computed,
        full_detail=subject.has_active_pass or subject.is_admin,
    )
