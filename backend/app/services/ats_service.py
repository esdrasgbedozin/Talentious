"""Orchestration du Score ATS (M5-T09/T10/T16).

Resout l'Offre (texte -> get-or-create, ou id possede), garantit l'analyse (cache
`analysis_json`, sinon appel agent -> 502), calcule le score DETERMINISTE
(ADR-ATS-DETERMINISTIC), persiste (upsert `ats_scores`) et construit la reponse
(detail tronque sans Pass, T10). Les fonctions levent des `ProblemException`
(RFC 7807) que la route laisse remonter. Aucun contenu d'offre n'est journalise
(RGPD).
"""

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.problem import ProblemException
from app.generated.models import ATSKeyword, ATSScoreRequest, ATSScoreResult
from app.models import AtsScore, GeneratedCV, JobOffer, User
from app.services.analyzer_client import analyzer_client
from app.services.ats_scoring import AtsScoreResult as ComputedScore
from app.services.job_offers import get_or_create_offer

logger = logging.getLogger(__name__)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def load_owned_cv(
    db: AsyncSession, cv_id: UUID, current_user: User
) -> GeneratedCV:
    """Charge le CV STRICTEMENT scope a l'utilisateur de session : FAIL-CLOSED,
    PAS de bypass admin (contrairement a `get_owned_cv`). Cette route ECRIT un
    `ats_scores` ; comme pour `POST /cv/{id}/export`, on refuse d'ecrire un
    artefact sur le CV d'autrui. CV inconnu OU d'un autre compte => meme 404
    (anti-IDOR, aucun oracle d'existence)."""
    cv = (
        await db.execute(
            select(GeneratedCV).where(
                GeneratedCV.id == cv_id,
                GeneratedCV.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()
    if cv is None:
        raise ProblemException(status.HTTP_404_NOT_FOUND, detail="CV not found.")
    return cv


async def resolve_offer(
    db: AsyncSession, current_user: User, request: ATSScoreRequest
) -> JobOffer:
    """Resout l'Offre a evaluer : EXACTEMENT un de `offer_text` / `job_offer_id`.

    - deux champs ou aucun -> 422 ;
    - `offer_text` -> get-or-create (service job_offers) ;
    - `job_offer_id` -> chargement SCOPE par utilisateur (anti-IDOR : offre
      inconnue OU d'un autre compte => meme 404).
    """
    has_text = request.offer_text is not None
    has_id = request.job_offer_id is not None
    if has_text == has_id:
        raise ProblemException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Fournir exactement un de offer_text ou job_offer_id.",
            type_="validation-error",
        )
    if has_text:
        return await get_or_create_offer(db, current_user.id, request.offer_text)
    offer = (
        await db.execute(
            select(JobOffer).where(
                JobOffer.id == request.job_offer_id,
                JobOffer.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()
    if offer is None:
        raise ProblemException(status.HTTP_404_NOT_FOUND, detail="Offer not found.")
    return offer


async def ensure_analysis_keywords(
    db: AsyncSession, offer: JobOffer
) -> list[ATSKeyword]:
    """Garantit l'analyse d'offre et renvoie ses mots-cles.

    Cache : si `analysis_json` est absent, on appelle l'agent analyseur-offre
    UNE fois et on memorise le resultat (une meme offre n'est jamais re-analysee).
    Toute panne de l'agent -> 502. Les mots-cles du cache sont parses en ATSKeyword
    de facon defensive (un enregistrement corrompu est ignore, jamais un 500).

    NB coût (suivi FinOps, hors de ce lot) : la transaction reste ouverte pendant
    l'appel HTTP a l'agent, et deux requetes identiques simultanees du meme
    utilisateur peuvent chacune declencher un appel (double-paiement au miss).
    Acceptable en V1 (meme utilisateur, rare) ; a durcir avec le plafond D3/429
    (et eventuellement un verrou sur l'offre) avant la montee en charge publique.
    """
    if offer.analysis_json is None:
        try:
            analysis = await analyzer_client.analyze_text(offer.raw_text)
        except HTTPException as exc:
            # Tout echec de l'agent -> 502 generique (contrat) ; le statut amont
            # est journalise (sans contenu d'offre) pour le diagnostic. Arbitrage
            # 400/422-agent -> 422 vs 502 : laisse en 502 (lettre du contrat).
            logger.warning(
                "ats.analyzer_failed",
                extra={
                    "event": "ats.analyzer_failed",
                    "offer_id": str(offer.id),
                    "upstream_status": exc.status_code,
                },
            )
            raise ProblemException(
                status.HTTP_502_BAD_GATEWAY,
                detail="Offer analysis is temporarily unavailable.",
                type_="analyzer-unavailable",
            ) from exc
        offer.analysis_json = analysis.to_dict()
        await db.flush()
        # T16 : metrique de rythme pour l'alerte de cout — ne compte QUE les
        # appels REELS a l'agent (cache miss). Pas de contenu d'offre (RGPD).
        logger.info(
            "ats.offer_analyzed",
            extra={"event": "ats.offer_analyzed", "offer_id": str(offer.id)},
        )
    raw_keywords = (offer.analysis_json or {}).get("keywords") or []
    keywords: list[ATSKeyword] = []
    for item in raw_keywords:
        if not isinstance(item, dict):
            continue
        try:
            keywords.append(ATSKeyword.model_validate(item))
        except ValidationError:
            # Cache corrompu (categorie hors enum, nom manquant...) : on ignore
            # l'entree, sans contenu logue (RGPD), plutot que de renvoyer un 500.
            logger.warning(
                "ats.keyword_ignored",
                extra={"event": "ats.keyword_ignored", "offer_id": str(offer.id)},
            )
            continue
    return keywords


async def upsert_ats_score(
    db: AsyncSession, cv_id: UUID, offer_id: UUID, computed: ComputedScore
) -> None:
    """Upsert du score pour le couple (Variante, Offre) : recalcul idempotent."""
    detail = {
        "matched_keywords": [k.model_dump() for k in computed.matched],
        "missing_keywords": [k.model_dump() for k in computed.missing],
        "missing_keywords_count": len(computed.missing),
    }
    stmt = (
        pg_insert(AtsScore)
        .values(
            cv_variant_id=cv_id,
            offer_id=offer_id,
            score=computed.score,
            result_json=detail,
        )
        .on_conflict_do_update(
            constraint="uq_ats_scores_variant_offer",
            set_={
                "score": computed.score,
                "result_json": detail,
                "updated_at": _utcnow(),
            },
        )
    )
    await db.execute(stmt)


def build_result(
    cv: GeneratedCV, offer: JobOffer, computed: ComputedScore, *, full_detail: bool
) -> ATSScoreResult:
    """Construit la reponse ; le SCORE est toujours complet, le DETAIL est tronque
    sans Pass actif (T10) : `missing_keywords_count` reste renseigne (teaser)."""
    missing_count = len(computed.missing)
    if full_detail:
        return ATSScoreResult(
            cv_id=cv.id,
            job_offer_id=offer.id,
            score=computed.score,
            matched_keywords=computed.matched,
            missing_keywords=computed.missing,
            missing_keywords_count=missing_count,
            detail_truncated=False,
        )
    return ATSScoreResult(
        cv_id=cv.id,
        job_offer_id=offer.id,
        score=computed.score,
        matched_keywords=[],
        missing_keywords=[],
        missing_keywords_count=missing_count,
        detail_truncated=True,
    )
