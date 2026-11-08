"""Service `job_offers` (M4-T03) — normalisation, empreinte, get-or-create.

Une Offre est le texte d'une annonce collée par l'utilisateur + le cache de son
analyse (`analysis_json`). L'analyse coûte un appel LLM : on hache le texte
NORMALISÉ (`text_hash`) et on déduplique par `(user_id, text_hash)` pour ne
jamais refacturer la même annonce (levier FinOps, archi V2 §4). Réutilisé par le
Score ATS (M5) et la Lettre (M6).
"""

import hashlib
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.job_offer import JobOffer


def normalize_offer_text(text: str) -> str:
    """Normalisation DÉTERMINISTE pour l'empreinte de cache : blancs compressés
    (espaces, tabulations, retours à la ligne -> un espace simple), bords retirés.
    Deux collages du même texte à l'espacement près partagent une empreinte.
    Tolère un non-string (-> "")."""
    if not isinstance(text, str):
        return ""
    return " ".join(text.split())


def offer_text_hash(normalized: str) -> str:
    """sha256 hexadécimal (64 caractères) du texte normalisé : la clé de cache."""
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


async def get_or_create_offer(
    db: AsyncSession, user_id: UUID, raw_text: str
) -> JobOffer:
    """Renvoie l'Offre `(user_id, empreinte)` si elle existe, sinon la crée.

    Idempotent : « même texte => même offre ». L'INSERT ... ON CONFLICT DO NOTHING
    sur l'unique `(user_id, text_hash)` rend l'opération sûre en concurrence (deux
    requêtes du même utilisateur avec la même annonce ne créent qu'une ligne) ; le
    SELECT qui suit renvoie la ligne, qu'elle vienne d'être posée ou qu'elle
    préexiste. `raw_text` conserve le texte d'origine (ce que l'utilisateur a
    collé) ; seule l'EMPREINTE est calculée sur la forme normalisée.

    Hypothèse d'isolation : READ COMMITTED (défaut PostgreSQL). Sous une course
    (même user + même texte simultanés), le ON CONFLICT fait attendre la
    transaction concurrente, puis le SELECT (nouveau snapshot par statement) voit
    la ligne committée. Par robustesse, si le premier SELECT ne la voit pas encore
    (isolation plus stricte), on retente UN SELECT avant d'échouer franchement.
    """
    normalized = normalize_offer_text(raw_text)
    text_hash = offer_text_hash(normalized)
    insert_stmt = (
        pg_insert(JobOffer)
        .values(user_id=user_id, raw_text=raw_text, text_hash=text_hash)
        .on_conflict_do_nothing(constraint="uq_job_offers_user_text_hash")
    )
    select_stmt = select(JobOffer).where(
        JobOffer.user_id == user_id,
        JobOffer.text_hash == text_hash,
    )
    await db.execute(insert_stmt)
    offer = (await db.execute(select_stmt)).scalar_one_or_none()
    if offer is None:
        offer = (await db.execute(select_stmt)).scalar_one_or_none()
    if offer is None:  # pragma: no cover — course anormale (isolation stricte)
        raise RuntimeError(
            "job_offers: ligne introuvable après ON CONFLICT (concurrence anormale)"
        )
    return offer
