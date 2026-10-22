"""
Backfill des CV V1 stockés non conformes vers le schéma canonique sûr (PAH-M0).

Décision fondateur du 2026-10-22 (PAH-M0) : la population prod chiffrée par
M0-T05 (5 CV non conformes sur 6) est réécrite EN BASE via la coercition
canonique `coerce_cv_content` (M0-T04), plutôt que de porter une coercition au
rendu à vie. Ce backfill débloque la suppression du pont legacy
`toCanonicalCVData` côté front (T08c).

Garde-fous (durcis en revue) :
- VERROU : les lignes sont lues sous `FOR UPDATE` — aucune écriture concurrente
  de l'app live ne peut être écrasée, et la sauvegarde reflète exactement les
  valeurs remplacées.
- SAUVEGARDE D'ABORD : les lignes non conformes (id + `cv_data_json` d'origine,
  intact) sont écrites dans un fichier AVANT toute réécriture — création
  atomique `O_EXCL` en mode 0600 (PII dedans), `fsync` avant le premier UPDATE,
  fichier supprimé si son écriture échoue à mi-course. Chemin ABSOLU exigé,
  REFUSÉ sous la racine du dépôt (la sauvegarde ne doit jamais pouvoir être
  committée), jamais écrasé.
- RE-VALIDATION : un CV dont la version coercée resterait non conforme au
  schéma canonique est SIGNALÉ (avec sa raison) et laissé tel quel — jamais
  d'écriture d'un contenu à moitié nettoyé.
- Une seule transaction : tout est réécrit, ou rien (commit en fin de `_main`).
- ROLLBACK : `--restore <sauvegarde.json>` réécrit les valeurs d'origine depuis
  la sauvegarde (testé). Après un échec AVANT commit, la base est intacte mais
  la sauvegarde existe : la renommer (ou la passer à --restore) avant de
  relancer.

Exécution (la sauvegarde va HORS du dépôt ; exporter DATABASE_URL sans le
passer en ligne de commande, ex. `export DATABASE_URL=$(gcloud secrets versions
access latest --secret=DATABASE_URL)`) :

    python -m scripts.backfill_nonconformant_cvs /chemin/hors-repo/backup-cvs.json
    python -m scripts.backfill_nonconformant_cvs --restore /chemin/backup-cvs.json
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.models import GeneratedCV
from app.services.cv_content_coercion import (
    CVContentCoercionError,
    coerce_cv_content,
    is_cv_content_conformant,
)

# Racine du dépôt (ce fichier vit dans backend/scripts/) : la sauvegarde, qui
# contient des données personnelles en clair, n'a pas le droit d'y atterrir.
_REPO_ROOT = Path(__file__).resolve().parents[2]


class BackupExistsError(Exception):
    """Levée si le fichier de sauvegarde existe déjà (jamais écrasé)."""


def _check_backup_path(backup_path: Path) -> Path:
    """Chemin ABSOLU, hors du dépôt — sinon on refuse avant toute écriture."""
    if not backup_path.is_absolute():
        raise ValueError(f"Chemin de sauvegarde ABSOLU requis : {backup_path}")
    resolved = backup_path.resolve()
    if resolved.is_relative_to(_REPO_ROOT):
        raise ValueError(
            f"Sauvegarde refusée SOUS la racine du dépôt (PII, risque de commit) : {resolved}"
        )
    return resolved


def _write_backup(backup_path: Path, rows: list[dict]) -> None:
    """Écrit la sauvegarde : création atomique O_EXCL en 0600, fsync, et
    suppression du fichier si l'écriture échoue à mi-course (un fichier tronqué
    ne doit ni servir de rollback ni bloquer la reprise)."""
    try:
        fd = os.open(backup_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError as exc:
        raise BackupExistsError(
            f"Sauvegarde déjà présente, non écrasée : {backup_path} "
            "(la renommer — ou la restaurer — avant de relancer)"
        ) from exc
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "purpose": "rollback backfill CV non conformes (PAH-M0)",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "count": len(rows),
                    "rows": rows,
                },
                f,
                ensure_ascii=False,
                indent=2,
            )
            f.flush()
            os.fsync(f.fileno())
    except BaseException:
        backup_path.unlink(missing_ok=True)
        raise


async def backfill_nonconformant(session: AsyncSession, backup_path: Path) -> dict:
    """Réécrit les CV non conformes en version coercée, après sauvegarde.

    Les lignes sont verrouillées (`FOR UPDATE`) le temps de la transaction. Ne
    committe pas : l'appelant décide (une seule transaction). Retourne un
    rapport {total, conformant, updated, skipped: [{id, reason}], warnings}.
    """
    backup_path = _check_backup_path(Path(backup_path))

    result = await session.execute(select(GeneratedCV).with_for_update())
    cvs = result.scalars().all()

    nonconformant = [
        cv for cv in cvs if not is_cv_content_conformant(cv.cv_data_json)[0]
    ]

    report: dict = {
        "total": len(cvs),
        "conformant": len(cvs) - len(nonconformant),
        "updated": 0,
        "skipped": [],
        "warnings": {},
    }
    if not nonconformant:
        return report

    # SAUVEGARDE AVANT TOUTE ÉCRITURE — les valeurs sont celles des lignes
    # verrouillées : c'est exactement ce que les UPDATE vont remplacer.
    _write_backup(
        backup_path,
        [{"id": str(cv.id), "cv_data_json": cv.cv_data_json} for cv in nonconformant],
    )

    for cv in nonconformant:
        try:
            coerced, warnings = coerce_cv_content(cv.cv_data_json)
        except CVContentCoercionError:
            report["skipped"].append(
                {"id": str(cv.id), "reason": "non-coercible (sortie inexploitable)"}
            )
            continue
        # Re-validation : on n'écrit QUE du conforme (canonique ET valide au
        # schéma) — sinon on signale la raison et on laisse la ligne intacte.
        ok, reason = is_cv_content_conformant(coerced)
        if not ok:
            report["skipped"].append({"id": str(cv.id), "reason": reason})
            continue
        cv.cv_data_json = coerced
        report["updated"] += 1
        if warnings:
            report["warnings"][str(cv.id)] = warnings

    await session.flush()
    return report


async def restore_from_backup(session: AsyncSession, backup_path: Path) -> dict:
    """Rollback : réécrit les `cv_data_json` d'origine depuis la sauvegarde.

    Ne committe pas (même contrat que le backfill). Retourne
    {restored, missing} — `missing` liste les ids disparus de la base.
    """
    payload = json.loads(Path(backup_path).read_text(encoding="utf-8"))
    restored = 0
    missing: list[str] = []
    for row in payload["rows"]:
        cv = await session.get(GeneratedCV, uuid.UUID(row["id"]), with_for_update=True)
        if cv is None:
            missing.append(row["id"])
            continue
        cv.cv_data_json = row["cv_data_json"]
        restored += 1
    await session.flush()
    return {"restored": restored, "missing": missing}


def _print_backfill_report(report: dict, backup_path: Path) -> None:
    print("Backfill des CV non conformes (sauvegarde avant écriture) :")
    print(f"  total            : {report['total']}")
    print(f"  déjà conformes   : {report['conformant']}")
    print(f"  réécrits         : {report['updated']}")
    print(
        f"  signalés (restent non conformes, laissés intacts) : {len(report['skipped'])}"
    )
    for item in report["skipped"]:
        print(f"    - {item['id']} : {item['reason']}")
    for cv_id, warnings in report["warnings"].items():
        for w in warnings:
            print(f"  perte signalée {cv_id} : {w}")
    if report["updated"] or report["skipped"]:
        print(f"  sauvegarde : {backup_path}")
    else:
        print("  rien à faire : aucune ligne non conforme, aucune sauvegarde créée.")


async def _main() -> None:
    if not os.environ.get("DATABASE_URL"):
        raise SystemExit("DATABASE_URL requis (l'exporter, pas en ligne de commande).")
    args = sys.argv[1:]
    restore = "--restore" in args
    paths = [a for a in args if a != "--restore"]
    if len(paths) != 1:
        raise SystemExit(
            "Usage : python -m scripts.backfill_nonconformant_cvs [--restore] <sauvegarde.json>"
        )
    backup_path = Path(paths[0])

    engine = create_async_engine(os.environ["DATABASE_URL"])
    try:
        async with AsyncSession(engine) as session:
            if restore:
                report = await restore_from_backup(session, backup_path)
            else:
                report = await backfill_nonconformant(session, backup_path)
            await session.commit()
    except (SQLAlchemyError, OSError) as exc:
        # Jamais la trace brute : elle peut porter des éléments de connexion.
        raise SystemExit(
            f"Échec ({type(exc).__name__}) — rien n'est committé. "
            "Vérifier DATABASE_URL et la connectivité, puis relancer."
        ) from None
    finally:
        await engine.dispose()

    if restore:
        print(f"Restauration depuis {backup_path} :")
        print(f"  restaurés : {report['restored']}")
        if report["missing"]:
            print(f"  introuvables en base : {', '.join(report['missing'])}")
    else:
        _print_backfill_report(report, backup_path)


if __name__ == "__main__":
    asyncio.run(_main())
