"""
Tests for email verification (M7-T02).

Registration sends a verification link; the /auth/verify-email endpoint flips the
user's email_verified flag from a valid token. Emails are never actually sent in
tests — email_service.send_verification_email is monkeypatched to capture calls.
"""

from urllib.parse import parse_qs, urlparse

import pytest

from app.services import email_service
from app.services.auth import create_access_token, create_email_token


@pytest.fixture
def captured_emails(monkeypatch):
    """Capture verification emails instead of sending them."""
    sent = []

    async def _fake(*, to, verify_url):
        sent.append({"to": to, "verify_url": verify_url})

    monkeypatch.setattr(email_service, "send_verification_email", _fake)
    return sent


def _token_from(url: str) -> str:
    return parse_qs(urlparse(url).query)["token"][0]


@pytest.mark.asyncio
class TestEmailVerification:
    async def test_registration_sends_verification_email(self, client, captured_emails):
        response = await client.post(
            "/auth/register",
            json={"email": "newuser@example.com", "password": "TestPassword123!"},
        )
        assert response.status_code == 201
        assert response.json()["email_verified"] is False
        assert len(captured_emails) == 1
        assert captured_emails[0]["to"] == "newuser@example.com"
        assert "token=" in captured_emails[0]["verify_url"]

    async def test_verify_email_flips_flag(self, client, captured_emails):
        await client.post(
            "/auth/register",
            json={"email": "verify@example.com", "password": "TestPassword123!"},
        )
        token = _token_from(captured_emails[0]["verify_url"])

        response = await client.post("/auth/verify-email", json={"token": token})
        assert response.status_code == 200
        assert response.json()["email_verified"] is True

    async def test_verify_email_is_idempotent(self, client, captured_emails):
        await client.post(
            "/auth/register",
            json={"email": "twice@example.com", "password": "TestPassword123!"},
        )
        token = _token_from(captured_emails[0]["verify_url"])

        first = await client.post("/auth/verify-email", json={"token": token})
        second = await client.post("/auth/verify-email", json={"token": token})
        assert first.status_code == 200
        assert second.status_code == 200
        assert second.json()["email_verified"] is True

    async def test_invalid_token_is_400(self, client):
        response = await client.post(
            "/auth/verify-email", json={"token": "not-a-real-token"}
        )
        assert response.status_code == 400

    async def test_wrong_purpose_token_is_rejected(self, client, test_user):
        # An access token (no email_verify purpose) must not verify an email.
        access = create_access_token(data={"sub": str(test_user.id)})
        response = await client.post("/auth/verify-email", json={"token": access})
        assert response.status_code == 400

    async def test_token_for_unknown_user_is_400(self, client):
        ghost = create_email_token(
            "00000000-0000-0000-0000-000000000000", "email_verify"
        )
        response = await client.post("/auth/verify-email", json={"token": ghost})
        assert response.status_code == 400

    async def test_me_exposes_email_verified(self, client, auth_headers, test_user):
        # La fixture standard est vérifiée (le login l'exige désormais).
        response = await client.get("/auth/me", headers=auth_headers)
        assert response.status_code == 200
        assert response.json()["email_verified"] is True

    async def test_resend_verification_legacy_session(
        self, client, test_db, captured_emails
    ):
        """Session héritée : un non-vérifié détenant encore un access token
        (émis avant le durcissement du login) peut redemander l'email."""
        from app.models.user import User, UserRole
        from app.services.auth import create_access_token, hash_password

        user = User(
            email="legacy@example.com",
            hashed_password=hash_password("TestPassword123!"),
            role=UserRole.USER,
            email_verified=False,
        )
        test_db.add(user)
        await test_db.commit()

        token = create_access_token(data={"sub": str(user.id)})
        response = await client.post(
            "/auth/resend-verification",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 204
        assert len(captured_emails) == 1
        assert captured_emails[0]["to"] == "legacy@example.com"

    async def test_resend_noop_when_verified(
        self, client, auth_headers, test_user, test_db, captured_emails
    ):
        test_user.email_verified = True
        await test_db.commit()
        response = await client.post("/auth/resend-verification", headers=auth_headers)
        assert response.status_code == 204
        assert captured_emails == []
