"""
Tests for DB-backed rotating refresh tokens.

Covers: login issues an httpOnly refresh cookie; /auth/refresh exchanges it for a
new access token and rotates the cookie; a rotated (reused) token is rejected and
burns the whole family; logout revokes the token; and account erasure cascades the
refresh tokens away.
"""

import pytest
from sqlalchemy import func, select

from app.config import settings
from app.models import RefreshToken, User

COOKIE = settings.refresh_cookie_name


async def _login(client, email="testuser@example.com", password="TestPassword123!"):
    return await client.post(
        "/auth/login", data={"username": email, "password": password}
    )


async def _count(db, model) -> int:
    result = await db.execute(select(func.count()).select_from(model))
    return result.scalar_one()


@pytest.mark.asyncio
class TestRefreshTokens:
    async def test_login_sets_refresh_cookie(self, client, test_user):
        response = await _login(client)
        assert response.status_code == 200
        assert response.cookies.get(COOKIE)  # httpOnly cookie present
        assert response.json()["access_token"]

    async def test_login_persists_hashed_token_not_raw(
        self, client, test_user, test_db
    ):
        response = await _login(client)
        raw = response.cookies.get(COOKIE)
        # The raw token must never be stored verbatim.
        row = (await test_db.execute(select(RefreshToken))).scalars().first()
        assert row is not None
        assert row.token_hash != raw
        assert len(row.token_hash) == 64  # sha256 hex

    async def test_refresh_returns_new_access_token(self, client, test_user):
        login = await _login(client)
        raw1 = login.cookies.get(COOKIE)

        client.cookies.clear()
        refreshed = await client.post("/auth/refresh", cookies={COOKIE: raw1})

        assert refreshed.status_code == 200
        assert refreshed.json()["access_token"]
        raw2 = refreshed.cookies.get(COOKIE)
        assert raw2 and raw2 != raw1  # rotated

    async def test_missing_cookie_is_401(self, client, test_user):
        client.cookies.clear()
        response = await client.post("/auth/refresh")
        assert response.status_code == 401

    async def test_reused_token_is_rejected_and_burns_family(self, client, test_user):
        login = await _login(client)
        raw1 = login.cookies.get(COOKIE)

        client.cookies.clear()
        rotated = await client.post("/auth/refresh", cookies={COOKIE: raw1})
        raw2 = rotated.cookies.get(COOKIE)

        # Reusing the now-rotated raw1 → 401 (theft signal).
        reuse = await client.post("/auth/refresh", cookies={COOKIE: raw1})
        assert reuse.status_code == 401

        # ... and the whole family is burned: raw2 no longer works either.
        after = await client.post("/auth/refresh", cookies={COOKIE: raw2})
        assert after.status_code == 401

    async def test_logout_revokes_refresh_token(self, client, test_user):
        login = await _login(client)
        raw1 = login.cookies.get(COOKIE)

        client.cookies.clear()
        logout = await client.post("/auth/logout", cookies={COOKIE: raw1})
        assert logout.status_code == 204

        after = await client.post("/auth/refresh", cookies={COOKIE: raw1})
        assert after.status_code == 401

    async def test_logout_without_cookie_is_noop_204(self, client):
        client.cookies.clear()
        response = await client.post("/auth/logout")
        assert response.status_code == 204

    async def test_account_deletion_cascades_refresh_tokens(
        self, client, auth_headers, test_user, test_db
    ):
        await _login(client)  # create a refresh token row
        assert await _count(test_db, RefreshToken) >= 1

        deleted = await client.delete("/users/me", headers=auth_headers)
        assert deleted.status_code == 204
        assert await _count(test_db, RefreshToken) == 0
        assert await _count(test_db, User) == 0
