"""
Tests for the forgot / reset password flow (M7-T03).

/auth/password/forgot is enumeration-safe (always 204) and emails a single-use
link only when the account exists. /auth/password/reset consumes the token once,
changes the password, and revokes all existing sessions.
"""

from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import pytest

from app.config import settings
from app.models import PasswordResetToken
from app.services import email_service
from app.services.password_reset import hash_token

COOKIE = settings.refresh_cookie_name


@pytest.fixture
def captured_resets(monkeypatch):
    sent = []

    async def _fake(*, to, reset_url):
        sent.append({"to": to, "reset_url": reset_url})

    monkeypatch.setattr(email_service, "send_password_reset_email", _fake)
    return sent


def _token_from(url: str) -> str:
    return parse_qs(urlparse(url).query)["token"][0]


async def _forgot(client, email):
    return await client.post("/auth/password/forgot", json={"email": email})


@pytest.mark.asyncio
class TestPasswordReset:
    async def test_forgot_sends_link_for_existing_user(
        self, client, test_user, captured_resets
    ):
        response = await _forgot(client, test_user.email)
        assert response.status_code == 204
        assert len(captured_resets) == 1
        assert captured_resets[0]["to"] == test_user.email
        assert "token=" in captured_resets[0]["reset_url"]

    async def test_forgot_is_enumeration_safe(self, client, captured_resets):
        response = await _forgot(client, "nobody@example.com")
        assert response.status_code == 204  # same response as an existing account
        assert captured_resets == []  # but no email actually sent

    async def test_reset_changes_password(self, client, test_user, captured_resets):
        await _forgot(client, test_user.email)
        token = _token_from(captured_resets[0]["reset_url"])

        reset = await client.post(
            "/auth/password/reset",
            json={"token": token, "new_password": "NewPassword456!"},
        )
        assert reset.status_code == 204

        # Old password no longer works; new one does.
        old = await client.post(
            "/auth/login",
            data={"username": test_user.email, "password": "TestPassword123!"},
        )
        assert old.status_code == 401
        new = await client.post(
            "/auth/login",
            data={"username": test_user.email, "password": "NewPassword456!"},
        )
        assert new.status_code == 200

    async def test_token_is_single_use(self, client, test_user, captured_resets):
        await _forgot(client, test_user.email)
        token = _token_from(captured_resets[0]["reset_url"])

        first = await client.post(
            "/auth/password/reset",
            json={"token": token, "new_password": "NewPassword456!"},
        )
        second = await client.post(
            "/auth/password/reset",
            json={"token": token, "new_password": "AnotherPass789!"},
        )
        assert first.status_code == 204
        assert second.status_code == 400

    async def test_invalid_token_is_400(self, client):
        response = await client.post(
            "/auth/password/reset",
            json={"token": "not-real", "new_password": "NewPassword456!"},
        )
        assert response.status_code == 400

    async def test_expired_token_is_400(self, client, test_user, test_db):
        raw = "expired-raw-token-value"
        test_db.add(
            PasswordResetToken(
                user_id=test_user.id,
                token_hash=hash_token(raw),
                expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
            )
        )
        await test_db.commit()

        response = await client.post(
            "/auth/password/reset",
            json={"token": raw, "new_password": "NewPassword456!"},
        )
        assert response.status_code == 400

    async def test_reset_revokes_existing_sessions(
        self, client, test_user, captured_resets
    ):
        # Establish a session (refresh cookie), then reset the password.
        login = await client.post(
            "/auth/login",
            data={"username": test_user.email, "password": "TestPassword123!"},
        )
        old_refresh = login.cookies.get(COOKIE)

        await _forgot(client, test_user.email)
        token = _token_from(captured_resets[0]["reset_url"])
        await client.post(
            "/auth/password/reset",
            json={"token": token, "new_password": "NewPassword456!"},
        )

        client.cookies.clear()
        after = await client.post("/auth/refresh", cookies={COOKIE: old_refresh})
        assert after.status_code == 401  # old session revoked by the reset

    async def test_short_password_is_rejected(self, client, test_user, captured_resets):
        await _forgot(client, test_user.email)
        token = _token_from(captured_resets[0]["reset_url"])
        response = await client.post(
            "/auth/password/reset",
            json={"token": token, "new_password": "short"},
        )
        assert response.status_code == 422  # min_length=8 validation
