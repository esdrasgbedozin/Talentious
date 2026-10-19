"""
Décompte LECTURE SEULE des CV V1 stockés non conformes au schéma canonique sûr (M0-T05).

Contexte : avant la V2, `cv_worker` stockait la sortie du rédacteur brute
(`cv_data_json=cv_data`). Ces CV peuvent contenir des clés hors schéma, le champ
interne `optimization_notes`, des URL dangereuses ou des structures non canoniques —
sans danger tant qu'ils sont réaffichés par React (échappé), mais à traiter avant le
rendu HTML serveur V2. Ce script CHIFFRE la population concernée pour éclairer la
décision PAH-M0 (backfill de coercition en base vs coercition au rendu).

Garanties : AUCUNE écriture (SELECT seulement, pas de commit). Exécution :

    DATABASE_URL=postgresql+asyncpg://... python -m scripts.count_nonconformant_cvs

La logique de classification est `is_cv_content_conformant` (testée unitairement,
sans base) ; ce module ne fait qu'itérer la table en lecture seule et agréger.
"""

from __future__ import annotations

import asyncio
import os
from collections import Counter

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.models import GeneratedCV
from app.services.cv_content_coercion import is_cv_content_conformant


async def count_nonconformant(session: AsyncSession) -> dict:
    """Parcourt les CV en LECTURE SEULE et agrège le verdict de conformité.

    Retourne un rapport {total, conformant, nonconformant, reasons, sample_ids}.
    """
    result = await session.execute(select(GeneratedCV.id, GeneratedCV.cv_data_json))
    rows = result.all()

    reasons: Counter = Counter()
    sample_ids: list[str] = []
    nonconformant = 0
    for cv_id, cv_data_json in rows:
        ok, reason = is_cv_content_conformant(cv_data_json)
        if not ok:
            nonconformant += 1
            reasons[reason] += 1
            if len(sample_ids) < 10:
                sample_ids.append(str(cv_id))

    return {
        "total": len(rows),
        "conformant": len(rows) - nonconformant,
        "nonconformant": nonconformant,
        "reasons": dict(reasons),
        "sample_ids": sample_ids,
    }


async def _main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL requis (lecture seule).")

    engine = create_async_engine(database_url)
    try:
        async with AsyncSession(engine) as session:
            report = await count_nonconformant(session)
    finally:
        await engine.dispose()

    print("Décompte des CV non conformes (lecture seule) :")
    print(f"  total          : {report['total']}")
    print(f"  conformes      : {report['conformant']}")
    print(f"  non conformes  : {report['nonconformant']}")
    for reason, n in report["reasons"].items():
        print(f"    - {reason} : {n}")
    if report["sample_ids"]:
        print(f"  échantillon ids : {', '.join(report['sample_ids'])}")


if __name__ == "__main__":
    asyncio.run(_main())
