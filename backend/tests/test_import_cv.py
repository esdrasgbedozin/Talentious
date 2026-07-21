"""
Tests POST /profile/import-cv (M8-T01c) — orchestration backend de l'import PDF.

L'agent parser est mocké (parser_client.extract_profile) : on teste l'auth, les
limites (type/taille), le passage du brouillon + warnings, la re-validation
stricte contre le ProfileData canonique généré, le rate-limit dédié et le 502
quand l'agent est indisponible. RIEN n'est persisté par cet endpoint.
"""

import pytest
from fastapi import HTTPException, status
from sqlalchemy import select

from app.core.rate_limit import limiter as _limiter
from app.models import UserProfile
from app.services import parser_client as parser_client_module

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


@pytest.fixture
def agent_mock(monkeypatch):
    """Mocke l'appel agent ; enregistre les invocations."""
    calls = []

    async def _fake(file):
        calls.append(file.filename)
        return {"profile_data": _draft(), "warnings": ["Aucune formation détectée"]}

    monkeypatch.setattr(parser_client_module.parser_client, "extract_profile", _fake)
    return calls


def _upload(name="cv.pdf", content=PDF_MAGIC, mime="application/pdf"):
    return {"file": (name, content, mime)}


@pytest.mark.asyncio
class TestImportCv:
    async def test_requires_auth(self, client):
        r = await client.post("/profile/import-cv", files=_upload())
        assert r.status_code == 401

    async def test_happy_path_returns_draft_and_warnings(
        self, client, auth_headers, agent_mock, test_db, test_user
    ):
        r = await client.post(
            "/profile/import-cv", headers=auth_headers, files=_upload()
        )
        assert r.status_code == 200
        body = r.json()
        assert body["profile_data"]["personal_info"]["first_name"] == "Jean"
        assert body["profile_data"]["experiences"][0]["company"] == "ACME"
        assert "Aucune formation détectée" in body["warnings"]
        assert agent_mock == ["cv.pdf"]

        # RIEN n'est persisté : le profil en base reste celui de la fixture.
        profile = await test_db.get(UserProfile, test_user.id)
        assert profile.profile_data["personal_info"]["first_name"] == "Test"

    async def test_rejects_non_pdf(self, client, auth_headers, agent_mock):
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

    async def test_invalid_draft_from_agent_is_502(
        self, client, auth_headers, monkeypatch
    ):
        """Un brouillon hors contrat (défense en profondeur) ne sort JAMAIS :
        la re-validation Pydantic côté backend le bloque."""

        async def _fake(file):
            return {
                "profile_data": {"experiences": "pas une liste"},
                "warnings": [],
            }

        monkeypatch.setattr(
            parser_client_module.parser_client, "extract_profile", _fake
        )
        r = await client.post(
            "/profile/import-cv", headers=auth_headers, files=_upload()
        )
        assert r.status_code == 502

    async def test_agent_down_is_502(self, client, auth_headers, monkeypatch):
        async def _fake(file):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Parser service is unavailable",
            )

        monkeypatch.setattr(
            parser_client_module.parser_client, "extract_profile", _fake
        )
        r = await client.post(
            "/profile/import-cv", headers=auth_headers, files=_upload()
        )
        assert r.status_code in (502, 503)

    async def test_agent_400_passthrough(self, client, auth_headers, monkeypatch):
        """Les erreurs métier de l'agent (PDF scanné → 422) remontent au client."""

        async def _fake(file):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="PDF contains only scanned images",
            )

        monkeypatch.setattr(
            parser_client_module.parser_client, "extract_profile", _fake
        )
        r = await client.post(
            "/profile/import-cv", headers=auth_headers, files=_upload()
        )
        assert r.status_code == 422

    async def test_rate_limited_after_5(self, client, auth_headers, agent_mock):
        _limiter.enabled = True
        _limiter.reset()
        try:
            statuses = []
            for _ in range(6):
                r = await client.post(
                    "/profile/import-cv", headers=auth_headers, files=_upload()
                )
                statuses.append(r.status_code)
            assert statuses[:5] == [200] * 5
            assert statuses[5] == 429
        finally:
            _limiter.enabled = False
            _limiter.reset()
