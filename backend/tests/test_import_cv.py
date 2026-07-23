"""
Tests de l'import PDF ASYNCHRONE (M8-T01, revu après l'incident du 2026-07-23 :
la façade CDN coupe à 60 s, l'extraction Gemini peut durer plus — l'import est
donc un job : POST /profile/import-cv → 202 + job_id, puis polling sur
GET /profile/import-cv/jobs/{job_id}).

L'agent parser est mocké (parser_client.extract_profile). On teste l'auth, les
pré-contrôles (type/taille), le cycle 202 → succeeded/failed, l'isolation par
utilisateur, l'expiration TTL, le 409 mono-job et le rate-limit. Le job vit en
mémoire : RIEN n'est persisté par cet import.
"""

import uuid
from datetime import timedelta

import pytest
from fastapi import HTTPException, status

from app.core.rate_limit import limiter as _limiter
from app.models import UserProfile
from app.services import parser_client as parser_client_module
from app.services.import_jobs import import_job_store

PDF_MAGIC = b"%PDF-1.4 fake content"


def _draft(**overrides):
    base = {
        "personal_info": {
            "first_name": "Jean",
            "last_name": "Martin",
            "email": "j@m.fr",
            "phone": None,
            "linkedin": None,
            "address": None,
            "city": None,
            "postal_code": None,
            "country": None,
        },
        "summary": "Dev backend.",
        "experiences": [
            {
                "id": "imp-exp-1",
                "title": "Dev",
                "company": "ACME",
                "location": None,
                "start_date": "2022-03",
                "end_date": None,
                "is_current": True,
                "description": "Python.",
                "achievements": ["Latence -40%"],
            }
        ],
        "educations": [],
        "skills": {"hard": ["Python"], "soft": []},
        "languages": [],
        "projects": [],
        "certifications": [],
    }
    base.update(overrides)
    return base


@pytest.fixture(autouse=True)
def clean_store():
    """Le store est un singleton process : on l'isole entre les tests."""
    import_job_store.reset()
    yield
    import_job_store.reset()


@pytest.fixture
def agent_mock(monkeypatch):
    """Mocke l'appel agent ; enregistre les invocations (filename)."""
    calls = []

    async def _fake(content, filename, content_type="application/pdf"):
        calls.append(filename)
        return {"profile_data": _draft(), "warnings": ["Aucune formation détectée"]}

    monkeypatch.setattr(parser_client_module.parser_client, "extract_profile", _fake)
    return calls


def _upload(name="cv.pdf", content=PDF_MAGIC, mime="application/pdf"):
    return {"file": (name, content, mime)}


async def _start(client, auth_headers):
    return await client.post(
        "/profile/import-cv", headers=auth_headers, files=_upload()
    )


@pytest.mark.asyncio
class TestImportCvStart:
    async def test_requires_auth(self, client):
        r = await client.post("/profile/import-cv", files=_upload())
        assert r.status_code == 401
        r = await client.get(f"/profile/import-cv/jobs/{uuid.uuid4()}")
        assert r.status_code == 401

    async def test_accepts_job_with_location_header(
        self, client, auth_headers, agent_mock
    ):
        r = await _start(client, auth_headers)
        assert r.status_code == 202
        body = r.json()
        assert body["status"] == "running"
        assert body["job_id"]
        assert r.headers["Location"].endswith(
            f"/profile/import-cv/jobs/{body['job_id']}"
        )

    async def test_rejects_non_pdf_without_job(self, client, auth_headers, agent_mock):
        r = await client.post(
            "/profile/import-cv",
            headers=auth_headers,
            files=_upload(name="cv.docx", mime="application/msword"),
        )
        assert r.status_code == 400
        assert agent_mock == []  # l'agent n'est jamais appelé

    async def test_rejects_oversized_file(self, client, auth_headers, agent_mock):
        big = b"%PDF" + b"0" * (10 * 1024 * 1024 + 1)
        r = await client.post(
            "/profile/import-cv", headers=auth_headers, files=_upload(content=big)
        )
        assert r.status_code == 400
        assert agent_mock == []

    async def test_conflict_when_import_already_running(
        self, client, auth_headers, agent_mock, test_user
    ):
        import_job_store.create(test_user.id)
        r = await _start(client, auth_headers)
        assert r.status_code == 409

    async def test_rate_limited_after_5(self, client, auth_headers, agent_mock):
        _limiter.enabled = True
        _limiter.reset()
        try:
            statuses = []
            for _ in range(6):
                import_job_store.reset()  # sinon 409 mono-job avant le 429
                r = await _start(client, auth_headers)
                statuses.append(r.status_code)
            assert statuses[:5] == [202] * 5
            assert statuses[5] == 429
        finally:
            _limiter.enabled = False
            _limiter.reset()


@pytest.mark.asyncio
class TestImportCvJobStatus:
    async def test_happy_path_succeeded_with_draft_and_nothing_persisted(
        self, client, auth_headers, agent_mock, test_db, test_user
    ):
        r = await _start(client, auth_headers)
        job_id = r.json()["job_id"]
        assert agent_mock == ["cv.pdf"]  # la tâche de fond a tourné

        r = await client.get(f"/profile/import-cv/jobs/{job_id}", headers=auth_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "succeeded"
        assert body["profile_data"]["personal_info"]["first_name"] == "Jean"
        assert body["profile_data"]["experiences"][0]["company"] == "ACME"
        assert "Aucune formation détectée" in body["warnings"]

        # RIEN n'est persisté : le profil en base reste celui de la fixture.
        profile = await test_db.get(UserProfile, test_user.id)
        assert profile.profile_data["personal_info"]["first_name"] == "Test"

    async def test_invalid_draft_from_agent_fails_job(
        self, client, auth_headers, monkeypatch
    ):
        """Un brouillon hors contrat (défense en profondeur) ne sort JAMAIS :
        la re-validation Pydantic le bloque et le job échoue proprement."""

        async def _fake(content, filename, content_type="application/pdf"):
            return {"profile_data": {"experiences": "pas une liste"}, "warnings": []}

        monkeypatch.setattr(
            parser_client_module.parser_client, "extract_profile", _fake
        )
        r = await _start(client, auth_headers)
        job_id = r.json()["job_id"]

        r = await client.get(f"/profile/import-cv/jobs/{job_id}", headers=auth_headers)
        body = r.json()
        assert body["status"] == "failed"
        assert body["error_message"]
        assert "profile_data" not in body or body.get("profile_data") is None

    async def test_agent_error_detail_reaches_error_message(
        self, client, auth_headers, monkeypatch
    ):
        """Les erreurs métier de l'agent (PDF scanné → 422) remontent dans
        error_message, affichable tel quel."""

        async def _fake(content, filename, content_type="application/pdf"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="PDF contains only scanned images",
            )

        monkeypatch.setattr(
            parser_client_module.parser_client, "extract_profile", _fake
        )
        r = await _start(client, auth_headers)
        job_id = r.json()["job_id"]

        r = await client.get(f"/profile/import-cv/jobs/{job_id}", headers=auth_headers)
        body = r.json()
        assert body["status"] == "failed"
        assert body["error_message"] == "PDF contains only scanned images"

    async def test_unexpected_crash_fails_job_generic(
        self, client, auth_headers, monkeypatch
    ):
        async def _fake(content, filename, content_type="application/pdf"):
            raise RuntimeError("boom interne à ne pas exposer")

        monkeypatch.setattr(
            parser_client_module.parser_client, "extract_profile", _fake
        )
        r = await _start(client, auth_headers)
        job_id = r.json()["job_id"]

        r = await client.get(f"/profile/import-cv/jobs/{job_id}", headers=auth_headers)
        body = r.json()
        assert body["status"] == "failed"
        assert "boom" not in body["error_message"]  # pas d'internals exposés

    async def test_unknown_job_is_404(self, client, auth_headers):
        r = await client.get(
            f"/profile/import-cv/jobs/{uuid.uuid4()}", headers=auth_headers
        )
        assert r.status_code == 404

    async def test_other_users_job_is_404(self, client, auth_headers):
        other_job = import_job_store.create(uuid.uuid4())
        r = await client.get(
            f"/profile/import-cv/jobs/{other_job.id}", headers=auth_headers
        )
        assert r.status_code == 404

    async def test_expired_job_is_404(self, client, auth_headers, test_user):
        job = import_job_store.create(test_user.id)
        job.created_at -= timedelta(minutes=16)  # TTL = 15 min
        r = await client.get(f"/profile/import-cv/jobs/{job.id}", headers=auth_headers)
        assert r.status_code == 404
