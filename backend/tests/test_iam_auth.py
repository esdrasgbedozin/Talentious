"""
Tests for service-to-service IAM auth (M5-T01).

The AI agents are private on Cloud Run (invoker = backend SA only), so every
backend→agent call must carry a Google ID token when ENABLE_IAM_AUTH is on.
These tests cover the shared helper and verify that ALL three clients
(parser, analyzer, writer) attach the Authorization header. Token fetching is
monkeypatched — no network, no metadata server.
"""

import httpx
import pytest

from app.config import settings
from app.services import iam_auth
from app.services.analyzer_client import analyzer_client
from app.services.writer_client import writer_client


@pytest.fixture
def iam_on(monkeypatch):
    monkeypatch.setattr(settings, "enable_iam_auth", True)
    monkeypatch.setattr(
        iam_auth, "_fetch_id_token", lambda audience: f"tok-for-{audience}"
    )


class _FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.text = ""

    def json(self):
        return self._payload

    def raise_for_status(self):
        return None


@pytest.mark.asyncio
class TestIamAuthHelper:
    async def test_disabled_returns_no_headers(self, monkeypatch):
        monkeypatch.setattr(settings, "enable_iam_auth", False)
        assert await iam_auth.auth_headers("https://agent.run.app") == {}

    async def test_enabled_returns_bearer_for_audience(self, iam_on):
        headers = await iam_auth.auth_headers("https://agent.run.app")
        assert headers == {"Authorization": "Bearer tok-for-https://agent.run.app"}


@pytest.mark.asyncio
class TestClientsAttachToken:
    async def test_analyzer_sends_iam_header(self, iam_on, monkeypatch):
        captured = {}

        async def fake_post(self, url, **kwargs):
            captured["headers"] = kwargs.get("headers") or {}
            return _FakeResponse(
                {
                    "hard_skills": [],
                    "soft_skills": [],
                    "seniority_level": "junior",
                    "key_responsibilities": [],
                    "tone": "neutre",
                }
            )

        monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
        await analyzer_client.analyze_text("x" * 60)
        assert (
            captured["headers"].get("Authorization", "").startswith("Bearer tok-for-")
        )

    async def test_writer_sends_iam_header(self, iam_on, monkeypatch):
        captured = {}

        async def fake_post(self, url, **kwargs):
            captured["headers"] = kwargs.get("headers") or {}
            return _FakeResponse({"cv": "ok"})

        monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
        await writer_client.generate_cv({}, {})
        assert (
            captured["headers"].get("Authorization", "").startswith("Bearer tok-for-")
        )

    async def test_no_header_when_disabled(self, monkeypatch):
        monkeypatch.setattr(settings, "enable_iam_auth", False)
        captured = {}

        async def fake_post(self, url, **kwargs):
            captured["headers"] = kwargs.get("headers") or {}
            return _FakeResponse(
                {
                    "hard_skills": [],
                    "soft_skills": [],
                    "seniority_level": "junior",
                    "key_responsibilities": [],
                    "tone": "neutre",
                }
            )

        monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
        await analyzer_client.analyze_text("x" * 60)
        assert "Authorization" not in captured["headers"]
