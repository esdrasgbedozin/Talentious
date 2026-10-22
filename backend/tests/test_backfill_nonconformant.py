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
    canonicalize_legacy,
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

    async def test_dry_run_reports_everything_but_writes_nothing(
        self, test_db, test_user, tmp_path
    ):
        backup = tmp_path / "dry.json"
        data = _complete()
        data["optimization_notes"] = "interne"
        cv = await _add_cv(test_db, test_user.id, data)
        await test_db.commit()

        report = await backfill_nonconformant(test_db, backup, dry_run=True)
        await test_db.commit()

        assert report["dry_run"] is True
        assert report["updated"] == 1  # ce QUI SERAIT réécrit
        # RIEN n'a été écrit : ni la base, ni la sauvegarde.
        assert not backup.exists()
        await test_db.refresh(cv)
        assert cv.cv_data_json["optimization_notes"] == "interne"

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


class TestBackfillLegacyCanonicalization:
    """Le backfill TRADUIT les formes legacy V1 avant coercition (port du pont
    front `toCanonicalCVData`, amélioré) : la coercition seule les SUPPRIMERAIT
    (constat du run prod du 2026-10-22, annulé par --restore)."""

    async def test_raw_v1_cv_is_translated_not_emptied(
        self, test_db, test_user, tmp_path
    ):
        raw_v1 = {
            "personal_info": {
                "first_name": "Jean",
                "last_name": "Martin",
                "email": "jean.martin@example.com",
                "linkedin": "linkedin.com/in/jean-martin",  # sans schéma
            },
            "summary": "Développeur backend.",
            "experiences": [
                {
                    "id": "e1",
                    "title": "Développeur",
                    "company": "Acme",
                    "location": "Paris",
                    "start_date": "2020-01-15",  # jour -> tronqué AAAA-MM
                    "end_date": "",
                    "is_current": True,
                    "description": "Backend Python.",
                    "achievements": ["Migration réussie", "Perf x2"],
                }
            ],
            "educations": [
                {
                    "id": "d1",
                    "degree": "Master",
                    "institution": "Université X",
                    "field": "Informatique",  # non modélisé -> perdu, rapporté
                    "end_date": "2019-06",
                    "description": "",
                }
            ],
            "skills": {"hard": ["Python"], "soft": ["Travail d'équipe"]},
            "languages": [{"name": "Anglais", "level": "C1"}],  # non modélisé
            "projects": [
                {
                    "id": "p1",
                    "name": "Outil interne",
                    "description": "CLI.",
                    "url": "github.com/jean/outil",  # sans schéma
                    "end_date": "2021-03",
                    "technologies": ["Python"],
                }
            ],
            "certifications": [
                {
                    "id": "c1",
                    "name": "Cert Python",
                    "issuer": "PSF",
                    "issue_date": "2022-05",
                    "credential_url": "verif.example.com/c1",  # ancien nom + sans schéma
                }
            ],
        }
        cv = await _add_cv(test_db, test_user.id, raw_v1)
        await test_db.commit()

        report = await backfill_nonconformant(test_db, tmp_path / "b.json")
        await test_db.commit()

        assert report["updated"] == 1
        assert report["skipped"] == []
        await test_db.refresh(cv)
        stored = cv.cv_data_json

        # Le contenu est TRADUIT, pas vidé.
        exp = stored["selected_experiences"][0]
        assert exp["title"] == "Développeur"
        assert exp["start_date"] == "2020-01"
        assert exp["end_date"] is None  # poste en cours
        assert exp["description"] == "Backend Python.\n• Migration réussie\n• Perf x2"
        assert (
            stored["personal_info"]["linkedin"] == "https://linkedin.com/in/jean-martin"
        )
        edu = stored["selected_educations"][0]
        assert edu["degree"] == "Master" and edu["institution"] == "Université X"
        proj = stored["selected_projects"][0]
        assert proj["url"] == "https://github.com/jean/outil"
        assert proj["completion_date"] == "2021-03"
        assert proj["relevant_skills"] == ["Python"]
        cert = stored["selected_certifications"][0]
        assert cert["url"] == "https://verif.example.com/c1"
        names = {(s["name"], s["category"]) for s in stored["highlighted_skills"]}
        assert names == {("Python", "hard_skill"), ("Travail d'équipe", "soft_skill")}

        # Le résultat est conforme (plus besoin du pont pour ce CV).
        ok, reason = is_cv_content_conformant(stored)
        assert ok, reason

        # Les pertes RÉELLES (non modélisées par le canonique) sont rapportées.
        dropped = "\n".join(report["dropped"][str(cv.id)])
        assert "languages" in dropped
        assert "field" in dropped

    async def test_near_canonical_cv_recovers_credential_url_and_linkedin(
        self, test_db, test_user, tmp_path
    ):
        # Le cas des 4 CV prod : sections canoniques, mais `credential_url` (ancien
        # nom) et linkedin/url sans schéma — invisibles au rendu aujourd'hui, le
        # backfill les RÉCUPÈRE au lieu de les supprimer.
        data = _complete()
        cert = dict(data["selected_certifications"][0])
        cert["credential_url"] = "verif.example.com/123"
        del cert["url"]
        data["selected_certifications"] = [cert]
        data["personal_info"] = {
            **data["personal_info"],
            "linkedin": "linkedin.com/in/camille",
        }
        cv = await _add_cv(test_db, test_user.id, data)
        await test_db.commit()

        report = await backfill_nonconformant(test_db, tmp_path / "b.json")
        await test_db.commit()

        assert report["updated"] == 1
        await test_db.refresh(cv)
        stored = cv.cv_data_json
        assert (
            stored["selected_certifications"][0]["url"]
            == "https://verif.example.com/123"
        )
        assert stored["personal_info"]["linkedin"] == "https://linkedin.com/in/camille"
        # Le reste du CV canonique est inchangé (dents : pas de sur-traduction).
        assert stored["selected_experiences"] == data["selected_experiences"]
        assert stored["summary"] == data["summary"]
        ok, reason = is_cv_content_conformant(stored)
        assert ok, reason

    def test_canonicalize_is_identity_on_fully_canonical_content(self):
        # Un contenu déjà canonique traverse la canonicalisation À L'IDENTIQUE,
        # sans note de perte (aucune sur-traduction qui casserait l'égalité
        # round-trip du décompte).
        data = _complete()
        out, notes = canonicalize_legacy(data)
        assert out == data
        assert notes == []

    def test_https_only_prefixes_hostlike_values(self):
        # `mailto:`/`javascript:`/« N/A » ne doivent PAS être « légitimés » en
        # https://… : laissés tels quels, la coercition les nulle et le rapport
        # les signale (revues sécurité + qualité v2).
        base = {
            "selected_certifications": [
                {"id": "c1", "name": "n", "issuer": "i", "issue_date": "2020-01"}
            ]
        }
        for hostile in ("mailto:a@b.c", "javascript:alert(1)", "N/A", "none"):
            data = {**base}
            data["selected_certifications"] = [
                {**base["selected_certifications"][0], "credential_url": hostile}
            ]
            out, _ = canonicalize_legacy(data)
            assert out["selected_certifications"][0]["url"] == hostile
        # …mais un hôte nu est bien réparé.
        data = {**base}
        data["selected_certifications"] = [
            {
                **base["selected_certifications"][0],
                "credential_url": "verif.example.com/c1",
            }
        ]
        out, _ = canonicalize_legacy(data)
        assert (
            out["selected_certifications"][0]["url"] == "https://verif.example.com/c1"
        )


class TestDroppedReportFidelity:
    """Le rapport `dropped` est le garde-fou sur lequel le fondateur valide le
    run prod (dry-run) : il doit signaler TOUTES les pertes, sans faux positifs,
    et rester sûr à afficher (clés hostiles)."""

    async def _run(self, test_db, test_user, tmp_path, data):
        cv = await _add_cv(test_db, test_user.id, data)
        await test_db.commit()
        report = await backfill_nonconformant(test_db, tmp_path / "b.json")
        await test_db.commit()
        return cv, report

    async def test_both_forms_present_prefers_canonical_and_reports_discarded(
        self, test_db, test_user, tmp_path
    ):
        data = _complete()
        data["optimization_notes"] = "interne"  # non conforme
        data["experiences"] = [
            {"title": "Ancien poste", "company": "Acme", "start_date": "2019-01"}
        ]
        cv, report = await self._run(test_db, test_user, tmp_path, data)

        assert report["updated"] == 1
        await test_db.refresh(cv)
        # La forme canonique gagne (parité avec le passthrough du pont front)…
        assert cv.cv_data_json["selected_experiences"] == data["selected_experiences"]
        # …et la section legacy écartée est RAPPORTÉE, pas perdue en silence.
        dropped = "\n".join(report["dropped"][str(cv.id)])
        assert "experiences" in dropped and "écartée" in dropped

    async def test_truncation_and_whitespace_are_reported_correctly(
        self, test_db, test_user, tmp_path
    ):
        data = _complete()
        data["optimization_notes"] = "interne"
        data["summary"] = "x" * 3000  # plafond coercition : 2000 -> tronqué
        data["personal_info"] = {**data["personal_info"], "linkedin": "   "}
        cv, report = await self._run(test_db, test_user, tmp_path, data)

        dropped = "\n".join(report["dropped"][str(cv.id)])
        # La troncature est une perte réelle : signalée.
        assert "summary (tronqué)" in dropped
        # Une chaîne blanche n'est PAS une perte (déjà vide une fois nettoyée).
        assert "linkedin" not in dropped

    async def test_list_shrink_reports_length_without_index_false_positives(
        self, test_db, test_user, tmp_path
    ):
        data = _complete()
        data["optimization_notes"] = "interne"
        exp = data["selected_experiences"][0]
        # 3 expériences, la 2e sans titre NI société : écartée par la coercition.
        data["selected_experiences"] = [
            exp,
            {**exp, "id": "exp-2", "title": "", "company": ""},
            {**exp, "id": "exp-3"},
        ]
        cv, report = await self._run(test_db, test_user, tmp_path, data)

        paths = report["dropped"][str(cv.id)]
        assert any("selected_experiences (liste 3 → 2" in p for p in paths)
        # Pas de descente par index sur une liste raccourcie : aucun faux
        # « invalidé » né du décalage (revue qualité v2, point 3).
        assert not any("selected_experiences[" in p for p in paths)

    async def test_hostile_key_names_are_sanitized_in_report(
        self, test_db, test_user, tmp_path
    ):
        data = _complete()
        data["\x1b[2J\némission forgée"] = "x"  # clé hostile : ANSI + saut de ligne
        cv, report = await self._run(test_db, test_user, tmp_path, data)

        paths = report["dropped"][str(cv.id)]
        joined = "".join(paths)
        assert "\x1b" not in joined and "\n" not in joined
        # La clé hostile reste signalée (assainie), pas passée sous silence.
        assert any("supprimé" in p for p in paths)

    async def test_dry_run_refuses_existing_backup_path(
        self, test_db, test_user, tmp_path
    ):
        backup = tmp_path / "b.json"
        backup.write_text("déjà là", encoding="utf-8")
        data = _complete()
        data["optimization_notes"] = "interne"
        await _add_cv(test_db, test_user.id, data)
        await test_db.commit()
        # Un dry-run « propre » suivi d'un run réel qui échoue sur la sauvegarde
        # serait trompeur : le dry-run refuse aussi (revue qualité v2).
        with pytest.raises(BackupExistsError):
            await backfill_nonconformant(test_db, backup, dry_run=True)
