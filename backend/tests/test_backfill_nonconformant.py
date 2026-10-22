"""
Test du backfill des CV V1 non conformes (décision PAH-M0 du 2026-10-22 : backfill
en base plutôt que coercition au rendu — population prod chiffrée à 5/6 par M0-T05).

Garanties vérifiées ici (durcies en revue) :
- seuls les CV NON conformes sont réécrits (le conforme ressort octet pour octet) ;
- la réécriture passe par `coerce_cv_content` (M0-T04) et le résultat est re-validé :
  un CV qui resterait non conforme après coercition (invalide au schéma, ou
  non-coercible) est SIGNALÉ avec sa raison, jamais écrit ;
- la sauvegarde (id + `cv_data_json` d'origine INTACT) est écrite AVANT toute
  réécriture, en mode 0600 (elle contient des PII), jamais écrasée, jamais dans
  le dépôt, toujours via un chemin absolu ;
- les pertes réelles de la coercition (ex. expérience sans date valide) remontent
  dans `warnings` ;
- le backfill est idempotent : un second passage ne réécrit rien et ne crée pas
  de sauvegarde ;
- `--restore` (rollback) réécrit les valeurs d'origine depuis la sauvegarde.

Nécessite Postgres (fixture `test_db`), comme test_count_nonconformant.
"""

import json
import stat
from pathlib import Path

import pytest

from app.models import GeneratedCV
from app.services.cv_content_coercion import is_cv_content_conformant
from scripts.backfill_nonconformant_cvs import (
    BackupExistsError,
    backfill_nonconformant,
    restore_from_backup,
)

FIXTURES_DIR = Path(__file__).resolve().parents[2] / "fixtures" / "cv-reference"


def _complete() -> dict:
    return json.loads((FIXTURES_DIR / "complete.json").read_text(encoding="utf-8"))


async def _add_cv(test_db, user_id, cv_data_json):
    cv = GeneratedCV(
        user_id=user_id,
        cv_name="x",
        template_id="modern_v1",
        job_offer_context="ctx",
        cv_data_json=cv_data_json,
    )
    test_db.add(cv)
    await test_db.flush()
    return cv


class TestBackfillNonconformant:
    async def test_updates_nonconformant_writes_backup_and_spares_conformant(
        self, test_db, test_user, tmp_path
    ):
        backup = tmp_path / "backup.json"
        conformant = await _add_cv(test_db, test_user.id, _complete())
        internal_data = _complete()
        internal_data["optimization_notes"] = "stratégie interne"
        internal = await _add_cv(test_db, test_user.id, internal_data)
        # CV V1 brut partiel : coercible, mais invalide même après coercition
        # (personal_info.email vide ≠ EmailStr requis) → signalé, jamais écrit.
        raw = await _add_cv(test_db, test_user.id, {"summary": "CV V1 brut partiel"})
        # Non-objet : non-coercible (CVContentCoercionError) → signalé aussi.
        broken = await _add_cv(test_db, test_user.id, ["pas", "un", "objet"])
        await test_db.commit()

        report = await backfill_nonconformant(test_db, backup)
        await test_db.commit()

        assert report["total"] == 4
        assert report["conformant"] == 1
        assert report["updated"] == 1
        skipped = {item["id"]: item["reason"] for item in report["skipped"]}
        assert set(skipped) == {str(raw.id), str(broken.id)}
        assert skipped[str(broken.id)] == "non-coercible (sortie inexploitable)"

        # Le CV au champ interne est réécrit canonique ET conforme.
        await test_db.refresh(internal)
        assert "optimization_notes" not in internal.cv_data_json
        ok, reason = is_cv_content_conformant(internal.cv_data_json)
        assert ok, reason

        # Dents du test : le conforme n'est PAS touché (octet pour octet) et les
        # signalés ne sont PAS réécrits (resteraient dangereux à moitié nettoyés).
        await test_db.refresh(conformant)
        assert conformant.cv_data_json == _complete()
        await test_db.refresh(raw)
        assert raw.cv_data_json == {"summary": "CV V1 brut partiel"}
        await test_db.refresh(broken)
        assert broken.cv_data_json == ["pas", "un", "objet"]

        # Sauvegarde : TOUS les non conformes d'origine, valeurs INTACTES —
        # c'est le chemin de rollback (les signalés y figurent par symétrie).
        saved = json.loads(backup.read_text(encoding="utf-8"))
        assert saved["count"] == 3
        assert saved["created_at"]
        rows = {r["id"]: r["cv_data_json"] for r in saved["rows"]}
        assert set(rows) == {str(internal.id), str(raw.id), str(broken.id)}
        assert rows[str(internal.id)]["optimization_notes"] == "stratégie interne"
        # PII en clair : la sauvegarde doit être en 0600 DÈS sa création.
        assert stat.S_IMODE(backup.stat().st_mode) == 0o600

    async def test_coercion_data_loss_is_reported_as_warning(
        self, test_db, test_user, tmp_path
    ):
        # Expérience sans start_date valide : la coercition l'ÉCARTE — cette
        # perte réelle doit remonter dans le rapport, pas disparaître en silence.
        data = _complete()
        data["optimization_notes"] = "interne"  # rend le CV non conforme
        data["selected_experiences"] = list(data["selected_experiences"]) + [
            {
                "id": "exp-99",
                "title": "Poste fantôme",
                "company": "Acme",
                "start_date": "n/a",
            }
        ]
        cv = await _add_cv(test_db, test_user.id, data)
        await test_db.commit()

        report = await backfill_nonconformant(test_db, tmp_path / "b.json")
        await test_db.commit()

        assert report["updated"] == 1
        assert report["warnings"] == {
            str(cv.id): ["Expérience ignorée : date de début manquante ou invalide"]
        }

    async def test_refuses_to_overwrite_existing_backup(
        self, test_db, test_user, tmp_path
    ):
        backup = tmp_path / "backup.json"
        backup.write_text("sauvegarde précédente", encoding="utf-8")
        data = _complete()
        data["optimization_notes"] = "interne"
        cv = await _add_cv(test_db, test_user.id, data)
        await test_db.commit()

        with pytest.raises(BackupExistsError):
            await backfill_nonconformant(test_db, backup)

        # Rien n'a été réécrit ni écrasé.
        assert backup.read_text(encoding="utf-8") == "sauvegarde précédente"
        await test_db.refresh(cv)
        assert cv.cv_data_json["optimization_notes"] == "interne"

    async def test_refuses_relative_path_and_repo_internal_path(
        self, test_db, test_user
    ):
        data = _complete()
        data["optimization_notes"] = "interne"
        await _add_cv(test_db, test_user.id, data)
        await test_db.commit()

        with pytest.raises(ValueError, match="ABSOLU"):
            await backfill_nonconformant(test_db, Path("backup.json"))
        # La sauvegarde contient des PII : jamais sous la racine du dépôt.
        repo_root = Path(__file__).resolve().parents[2]
        with pytest.raises(ValueError, match="racine du dépôt"):
            await backfill_nonconformant(test_db, repo_root / "backup.json")

    async def test_second_run_is_a_noop_and_writes_no_backup(
        self, test_db, test_user, tmp_path
    ):
        data = _complete()
        data["optimization_notes"] = "interne"
        await _add_cv(test_db, test_user.id, data)
        await test_db.commit()

        first = await backfill_nonconformant(test_db, tmp_path / "b1.json")
        await test_db.commit()
        assert first["updated"] == 1

        second = await backfill_nonconformant(test_db, tmp_path / "b2.json")
        await test_db.commit()
        assert second["updated"] == 0
        assert second["skipped"] == []
        assert second["conformant"] == second["total"] == 1
        # Rien à sauvegarder => AUCUN fichier créé (pas de sauvegarde vide trompeuse).
        assert not (tmp_path / "b2.json").exists()

    async def test_restore_puts_original_values_back(
        self, test_db, test_user, tmp_path
    ):
        backup = tmp_path / "backup.json"
        data = _complete()
        data["optimization_notes"] = "stratégie interne"
        cv = await _add_cv(test_db, test_user.id, data)
        await test_db.commit()

        report = await backfill_nonconformant(test_db, backup)
        await test_db.commit()
        assert report["updated"] == 1
        await test_db.refresh(cv)
        assert "optimization_notes" not in cv.cv_data_json

        # Rollback : la valeur d'origine revient À L'IDENTIQUE.
        restore = await restore_from_backup(test_db, backup)
        await test_db.commit()
        assert restore == {"restored": 1, "missing": []}
        await test_db.refresh(cv)
        assert cv.cv_data_json == data

    async def test_restore_reports_missing_rows(self, test_db, test_user, tmp_path):
        backup = tmp_path / "backup.json"
        data = _complete()
        data["optimization_notes"] = "interne"
        cv = await _add_cv(test_db, test_user.id, data)
        await test_db.commit()
        await backfill_nonconformant(test_db, backup)
        await test_db.commit()

        await test_db.delete(await test_db.get(GeneratedCV, cv.id))
        await test_db.commit()

        restore = await restore_from_backup(test_db, backup)
        await test_db.commit()
        assert restore == {"restored": 0, "missing": [str(cv.id)]}
