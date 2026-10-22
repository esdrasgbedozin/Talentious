"""
Backfill des CV V1 stockés non conformes vers le schéma canonique sûr (PAH-M0).

Décision fondateur du 2026-10-22 (PAH-M0) : la population prod chiffrée par
M0-T05 (5 CV non conformes sur 6) est réécrite EN BASE via la coercition
canonique `coerce_cv_content` (M0-T04), plutôt que de porter une coercition au
rendu à vie. Ce backfill débloque la suppression du pont legacy
`toCanonicalCVData` côté front (T08c).

Le run prod du 2026-10-22 (v1 du script) a été ANNULÉ par --restore : coercer
sans traduire SUPPRIMAIT les clés legacy V1 (`credential_url`, sections
`experiences`/`educations`/…). Depuis, le flux est : CANONICALISATION
(`canonicalize_legacy`, port du pont front `toCanonicalCVData`) PUIS coercition,
et le rapport liste les pertes réelles par CV (`dropped`, chemins seulement).
Un `--dry-run` calcule tout sans rien écrire — à lancer d'abord en prod.

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

    python -m scripts.backfill_nonconformant_cvs --dry-run /chemin/hors-repo/backup-cvs.json
    python -m scripts.backfill_nonconformant_cvs /chemin/hors-repo/backup-cvs.json
    python -m scripts.backfill_nonconformant_cvs --restore /chemin/backup-cvs.json
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
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


# ===========================================================================
# Canonicalisation des formes legacy V1 — port Python du pont front
# `toCanonicalCVData` (frontend/src/lib/cv.ts), AMÉLIORÉ : le pont fait un
# passthrough strict dès que `selected_experiences` existe, ce qui laissait
# `credential_url` (ancien nom de `url`) et les URL sans schéma invisibles au
# rendu. Ici on traduit TOUT avant la coercition — la coercition seule
# SUPPRIME les clés legacy au lieu de les traduire (constat du run prod du
# 2026-10-22, annulé par --restore). Pur dict→dict, aucune dépendance.
# ===========================================================================

_SCHEME_RE = re.compile(r"^https?://", re.IGNORECASE)
_MONTH_RE = re.compile(r"^(\d{4}-(?:0[1-9]|1[0-2]))(?:-\d{2})?$")
# Une valeur ne mérite le préfixe https:// que si elle RESSEMBLE à un hôte
# (`linkedin.com/…`) : préfixer `mailto:…`, `javascript:…` ou « N/A » les
# « légitimerait » en URL poubelle au lieu de laisser la coercition les nuller
# (et le rapport les signaler) — revues sécurité + qualité v2.
_HOST_RE = re.compile(r"^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(/|$)")


def _https(v: object) -> object:
    """Préfixe https:// sur une URL nue d'allure hôte (`linkedin.com/in/x`) —
    même réparation que le pont front ; tout le reste passe tel quel (la
    coercition tranchera, le rapport signalera)."""
    if not isinstance(v, str):
        return v
    s = v.strip()
    if not s or _SCHEME_RE.match(s) or not _HOST_RE.match(s):
        return v
    return f"https://{s}"


def _month(v: object) -> object:
    """Tronque une date AAAA-MM-JJ en AAAA-MM (formes V1) ; sinon inchangé."""
    if isinstance(v, str):
        m = _MONTH_RE.match(v.strip())
        if m:
            return m.group(1)
    return v


def _fold_achievements(description: object, achievements: object) -> object:
    """Replie `achievements` (non modélisé) en puces dans la description,
    comme le pont front. Sans achievements : description inchangée."""
    items = (
        [a for a in achievements if isinstance(a, str) and a.strip()]
        if isinstance(achievements, list)
        else []
    )
    if not items:
        return description
    bullets = "\n".join(f"• {a}" for a in items)
    desc = description if isinstance(description, str) and description else ""
    return f"{desc}\n{bullets}" if desc else bullets


def _pick_section(
    raw: dict, canonical_key: str, legacy_key: str, notes: list[str]
) -> list:
    """Choisit la section : canonique prioritaire (parité avec le passthrough du
    pont front, qui ignore la forme legacy dès que la canonique existe) ; toute
    forme legacy écartée ou inattendue est NOTÉE, jamais perdue en silence."""
    canonical = raw.get(canonical_key)
    legacy = raw.get(legacy_key)
    use_canonical = isinstance(canonical, list) and bool(canonical)
    if isinstance(legacy, list):
        if legacy and use_canonical:
            notes.append(
                f"{legacy_key} (section legacy écartée : {canonical_key} prioritaire)"
            )
    elif legacy is not None:
        notes.append(f"{legacy_key} (forme inattendue écartée)")
        legacy = None
    if use_canonical:
        return canonical
    if isinstance(legacy, list) and legacy:
        return legacy
    return canonical if isinstance(canonical, list) else []


def canonicalize_legacy(raw: dict) -> tuple[dict, list[str]]:
    """Traduit les formes legacy V1 vers les clés canoniques, SANS coercer
    (types/longueurs/validité restent le travail de `coerce_cv_content`).
    Identité (et zéro note) sur un contenu déjà canonique — testé.

    Retourne (contenu, notes) : les notes signalent tout ce que la traduction
    elle-même écarte ou écrase (section legacy ignorée au profit de la
    canonique, `url` écrasé par `credential_url`, formes inattendues…) — le
    diff `dropped_paths`, calculé APRÈS, ne peut pas les voir."""
    notes: list[str] = []
    out = dict(raw)

    pi = raw.get("personal_info")
    if isinstance(pi, dict):
        pi = dict(pi)
        if "linkedin" in pi:
            pi["linkedin"] = _https(pi["linkedin"])
        out["personal_info"] = pi

    # Chaque item est copié PUIS surchargé : les clés non modélisées (`field`,
    # `grade`, `role`, `expiration_date`…) sont CONSERVÉES ici — c'est la
    # coercition qui les supprimera, et le rapport `dropped` (calculé entre la
    # version canonicalisée et la version écrite) les listera au bon chemin.
    # Les clés CONSOMMÉES par une traduction (`achievements` → description,
    # `credential_url` → url…) sont retirées : un renommage n'est pas une perte.
    exps = []
    for i, e in enumerate(
        _pick_section(raw, "selected_experiences", "experiences", notes)
    ):
        if not isinstance(e, dict):
            notes.append(f"selected_experiences[{i}] (élément non-objet écarté)")
            continue
        new = dict(e)
        achievements = new.pop("achievements", None)
        if achievements is not None and not isinstance(achievements, list):
            notes.append(
                f"selected_experiences[{i}].achievements (forme inattendue écartée)"
            )
        elif isinstance(achievements, list) and any(
            not (isinstance(a, str) and a.strip()) for a in achievements
        ):
            notes.append(
                f"selected_experiences[{i}].achievements (éléments non-texte écartés)"
            )
        is_current = new.pop("is_current", None) is True or e.get("end_date") in (
            None,
            "",
        )
        new["id"] = e.get("id") or f"exp-{i + 1}"
        new["start_date"] = _month(e.get("start_date"))
        new["end_date"] = None if is_current else _month(e.get("end_date"))
        new["description"] = _fold_achievements(e.get("description"), achievements)
        hs = e.get("highlighted_skills")
        new["highlighted_skills"] = hs if isinstance(hs, list) else []
        exps.append(new)
    out["selected_experiences"] = exps
    out.pop("experiences", None)

    edus = []
    for i, e in enumerate(
        _pick_section(raw, "selected_educations", "educations", notes)
    ):
        if not isinstance(e, dict):
            notes.append(f"selected_educations[{i}] (élément non-objet écarté)")
            continue
        new = dict(e)
        new["id"] = e.get("id") or f"edu-{i + 1}"
        new["end_date"] = _month(e.get("end_date"))
        edus.append(new)
    out["selected_educations"] = edus
    out.pop("educations", None)

    projs = []
    for i, p in enumerate(_pick_section(raw, "selected_projects", "projects", notes)):
        if not isinstance(p, dict):
            notes.append(f"selected_projects[{i}] (élément non-objet écarté)")
            continue
        new = dict(p)
        new["id"] = p.get("id") or f"proj-{i + 1}"
        new["url"] = _https(p.get("url"))
        end = new.pop("end_date", None)  # forme V1 de `completion_date`
        comp = p.get("completion_date")
        if comp and end not in (None, "") and end != comp:
            notes.append(
                f"selected_projects[{i}].end_date (écarté : completion_date présent)"
            )
        new["completion_date"] = _month(comp or end)
        tech = new.pop("technologies", None)  # forme V1 de `relevant_skills`
        rs = p.get("relevant_skills")
        if isinstance(rs, list) and rs:
            if isinstance(tech, list) and tech and tech != rs:
                notes.append(
                    f"selected_projects[{i}].technologies"
                    " (écarté : relevant_skills prioritaire)"
                )
        else:
            new["relevant_skills"] = tech if isinstance(tech, list) else []
        projs.append(new)
    out["selected_projects"] = projs
    out.pop("projects", None)

    certs = []
    for i, c in enumerate(
        _pick_section(raw, "selected_certifications", "certifications", notes)
    ):
        if not isinstance(c, dict):
            notes.append(f"selected_certifications[{i}] (élément non-objet écarté)")
            continue
        new = dict(c)
        new["id"] = c.get("id") or f"cert-{i + 1}"
        new["issue_date"] = _month(c.get("issue_date"))
        # Ancien nom `credential_url` (V1) prioritaire : c'est lui qui porte la
        # valeur sur les documents legacy. S'il écrase un `url` différent déjà
        # présent, c'est une perte : notée.
        cred = new.pop("credential_url", None)
        url_orig = c.get("url")
        if isinstance(cred, str) and cred.strip():
            if (
                isinstance(url_orig, str)
                and url_orig.strip()
                and url_orig.strip() != cred.strip()
            ):
                notes.append(
                    f"selected_certifications[{i}].url (écrasé par credential_url)"
                )
            source = cred
        else:
            source = url_orig
        new["url"] = _https(source)
        certs.append(new)
    out["selected_certifications"] = certs
    out.pop("certifications", None)

    hs = raw.get("highlighted_skills")
    skills = raw.get("skills")
    if isinstance(hs, list) and hs:
        if isinstance(skills, dict) and (skills.get("hard") or skills.get("soft")):
            notes.append("skills (écarté : highlighted_skills prioritaire)")
        elif skills is not None and not isinstance(skills, dict):
            notes.append("skills (forme inattendue écartée)")
    elif isinstance(skills, dict):
        hard = skills.get("hard")
        soft = skills.get("soft")
        hs = [
            {"name": n, "category": "hard_skill"}
            for n in (hard if isinstance(hard, list) else [])
            if isinstance(n, str) and n.strip()
        ] + [
            {"name": n, "category": "soft_skill"}
            for n in (soft if isinstance(soft, list) else [])
            if isinstance(n, str) and n.strip()
        ]
    else:
        if skills is not None:
            notes.append("skills (forme inattendue écartée)")
        if not isinstance(hs, list):
            hs = []
    out["highlighted_skills"] = hs
    out.pop("skills", None)

    # `languages` et toute autre clé hors schéma restent dans `out` : la
    # coercition les supprimera et la perte apparaîtra dans le rapport (dropped).
    return out, notes


# Les noms de clés viennent d'un JSON NON fiable (sorties LLM V1 brutes) et le
# rapport est affiché dans le terminal de l'opérateur : on assainit chaque
# segment (séquences ANSI, sauts de ligne → « ? ») et on le borne (revue
# sécurité v2). `\w` reste unicode : les clés accentuées légitimes sont lisibles.
_KEY_SANITIZE_RE = re.compile(r"[^\w.\- ]")


def _safe_key(k: object) -> str:
    return _KEY_SANITIZE_RE.sub("?", str(k))[:40]


def _join(path: str, key: object) -> str:
    return f"{path}.{_safe_key(key)}" if path else _safe_key(key)


def dropped_paths(original: object, final: object, path: str = "") -> list[str]:
    """Chemins de contenu PERDU entre la version canonicalisée et la version
    écrite : clés supprimées, valeurs invalidées ou tronquées, enums remplacés,
    listes raccourcies. N'émet JAMAIS une valeur (PII) — uniquement des chemins
    assainis, triés (sortie déterministe entre dry-run et run réel)."""
    out: list[str] = []
    if isinstance(original, dict) and isinstance(final, dict):
        for k in sorted(original.keys() - final.keys(), key=str):
            out.append(f"{_join(path, k)} (supprimé)")
        for k in sorted(original.keys() & final.keys(), key=str):
            out.extend(dropped_paths(original[k], final[k], _join(path, k)))
    elif isinstance(original, list) and isinstance(final, list):
        if len(final) != len(original):
            # Longueurs différentes : PAS de descente par index — l'appariement
            # par position produirait des faux positifs/négatifs (revue v2).
            out.append(f"{path} (liste {len(original)} → {len(final)} éléments)")
        else:
            for i, (a, b) in enumerate(zip(original, final)):
                out.extend(dropped_paths(a, b, f"{path}[{i}]"))
    elif isinstance(original, str):
        stripped = original.strip()
        if isinstance(final, str):
            if final != stripped:
                if stripped.startswith(final) and len(final) < len(stripped):
                    out.append(f"{path} (tronqué)")
                else:
                    out.append(f"{path} (valeur remplacée)")
        elif final in (None, "", []) and stripped:
            out.append(f"{path} (invalidé)")
    elif original not in (None, "", []) and final in (None, "", []):
        out.append(f"{path} (invalidé)")
    return out


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


async def backfill_nonconformant(
    session: AsyncSession, backup_path: Path, dry_run: bool = False
) -> dict:
    """Réécrit les CV non conformes : canonicalisation des formes legacy PUIS
    coercition, après sauvegarde.

    Les lignes sont verrouillées (`FOR UPDATE`) le temps de la transaction. Ne
    committe pas : l'appelant décide (une seule transaction). En `dry_run`, le
    rapport complet est calculé (y compris `dropped`) mais RIEN n'est écrit —
    ni sauvegarde, ni base. Retourne {total, conformant, updated,
    skipped: [{id, reason}], warnings, dropped, dry_run}.
    """
    backup_path = _check_backup_path(Path(backup_path))
    # Un dry-run « propre » suivi d'un run réel qui bute sur la sauvegarde
    # serait trompeur : on refuse dès le dry-run (le run réel garde O_EXCL).
    if dry_run and backup_path.exists():
        raise BackupExistsError(
            f"Sauvegarde déjà présente, non écrasée : {backup_path} "
            "(la renommer — ou la restaurer — avant de relancer)"
        )

    # FOR UPDATE seulement quand on écrit : un dry-run ne doit pas verrouiller
    # la table de l'app live le temps d'une simulation (revue sécurité v2).
    stmt = select(GeneratedCV)
    if not dry_run:
        stmt = stmt.with_for_update()
    result = await session.execute(stmt)
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
        "dropped": {},
        "dry_run": dry_run,
    }
    if not nonconformant:
        return report

    # SAUVEGARDE AVANT TOUTE ÉCRITURE — les valeurs sont celles des lignes
    # verrouillées : c'est exactement ce que les UPDATE vont remplacer.
    if not dry_run:
        _write_backup(
            backup_path,
            [
                {"id": str(cv.id), "cv_data_json": cv.cv_data_json}
                for cv in nonconformant
            ],
        )

    for cv in nonconformant:
        original = cv.cv_data_json
        try:
            # Traduction des formes legacy AVANT la coercition : la coercition
            # seule supprimerait les clés V1 au lieu de les traduire.
            if isinstance(original, dict):
                canonicalized, notes = canonicalize_legacy(original)
            else:
                canonicalized, notes = original, []
            coerced, warnings = coerce_cv_content(canonicalized)
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
        if not dry_run:
            cv.cv_data_json = coerced
        report["updated"] += 1
        if warnings:
            report["warnings"][str(cv.id)] = warnings
        # Pertes réelles = notes de la canonicalisation (ce qu'elle écarte
        # elle-même) + diff canonicalisé -> écrit (ce que la coercition retire).
        # Les renommages ne sont pas des pertes. Chemins seulement, plafonnés.
        lost = notes + dropped_paths(canonicalized, coerced)
        if len(lost) > 50:
            lost = lost[:50] + [f"… +{len(lost) - 50} autres"]
        if lost:
            report["dropped"][str(cv.id)] = lost

    if not dry_run:
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
    if report["dry_run"]:
        print(
            "DRY-RUN — rapport calculé, RIEN n'a été écrit (ni base, ni sauvegarde) :"
        )
    else:
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
    if report["dropped"]:
        print("  pertes structurelles (contenu non modélisé par le canonique) :")
        for cv_id, paths in report["dropped"].items():
            for p in paths:
                print(f"    - {cv_id} : {p}")
    if report["dry_run"]:
        return
    if report["updated"] or report["skipped"]:
        print(f"  sauvegarde : {backup_path}")
    else:
        print("  rien à faire : aucune ligne non conforme, aucune sauvegarde créée.")


async def _main() -> None:
    if not os.environ.get("DATABASE_URL"):
        raise SystemExit("DATABASE_URL requis (l'exporter, pas en ligne de commande).")
    args = sys.argv[1:]
    restore = "--restore" in args
    dry_run = "--dry-run" in args
    paths = [a for a in args if a not in ("--restore", "--dry-run")]
    if len(paths) != 1 or (restore and dry_run):
        raise SystemExit(
            "Usage : python -m scripts.backfill_nonconformant_cvs"
            " [--dry-run | --restore] <sauvegarde.json>"
        )
    backup_path = Path(paths[0])

    engine = create_async_engine(os.environ["DATABASE_URL"])
    try:
        async with AsyncSession(engine) as session:
            if restore:
                report = await restore_from_backup(session, backup_path)
            else:
                report = await backfill_nonconformant(
                    session, backup_path, dry_run=dry_run
                )
            if dry_run:
                # L'invariant « rien n'est écrit » ne dépend ainsi d'aucun
                # garde interne : la transaction est annulée quoi qu'il arrive.
                await session.rollback()
            else:
                await session.commit()
    except (BackupExistsError, ValueError) as exc:
        # Nos propres refus : message sûr par construction, affiché tel quel.
        raise SystemExit(str(exc)) from None
    except Exception as exc:  # noqa: BLE001
        # Jamais la trace brute : elle peut porter des éléments de connexion
        # ou du contenu CV. Nom de la classe seulement.
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
