"""
Tests POST /auth/google (M8-T03) — Sign in with Google.

Le vérificateur de jeton Google est mocké (app.services.google_auth) : on
teste les politiques de compte — création sans mot de passe, liaison par
email vérifié, refus du login classique sur un compte Google-only, refus
des jetons invalides ou d'emails non vérifiés côté Google.
"""

import pytest
from sqlalchemy import select

from app.models import User
from app.services import google_auth


def _claims(**overrides):
    base = {
        "sub": "google-sub-123",
        "email": "nouveau@gmail.com",
        "email_verified": True,
        "given_name": "Nadia",
    }
    base.update(overrides)
    return base


@pytest.fixture
def google_ok(monkeypatch):
    """Mock du vérificateur : jeton toujours valide, claims contrôlables."""
    state = {"claims": _claims()}

    def _fake(credential):
        return state["claims"]

    monkeypatch.setattr(google_auth, "verify_credential", _fake)
    return state


@pytest.fixture
def google_invalid(monkeypatch):
    def _fake(credential):
        raise ValueError("Invalid token")

    monkeypatch.setattr(google_auth, "verify_credential", _fake)


@pytest.mark.asyncio
class TestGoogleAuth:
    async def test_creates_passwordless_verified_account(
        self, client, google_ok, test_db
    ):
        r = await client.post("/auth/google", json={"credential": "fake-jwt"})
        assert r.status_code == 200
        body = r.json()
        assert body["access_token"]
        # Cookie de rafraîchissement posé, comme au login classique.
        assert "talentious_refresh" in r.headers.get("set-cookie", "")

        result = await test_db.execute(
            select(User).where(User.email == "nouveau@gmail.com")
        )
        user = result.scalar_one()
        assert user.google_id == "google-sub-123"
        assert user.email_verified is True  # garanti par Google, pas d'email envoyé
        assert user.hashed_password is None

    async def test_links_existing_password_account(
        self, client, google_ok, test_user, test_db
    ):
        google_ok["claims"] = _claims(email=test_user.email, sub="sub-du-testuser")
        r = await client.post("/auth/google", json={"credential": "fake-jwt"})
        assert r.status_code == 200

        await test_db.refresh(test_user)
        assert test_user.google_id == "sub-du-testuser"
        assert test_user.hashed_password is not None  # le mot de passe survit

    async def test_marks_unverified_account_verified(self, client, google_ok, test_db):
        # Compte classique jamais confirmé : Google prouve la propriété de
        # l'adresse — la liaison le débloque (et neutralise le squat).
        from app.services.auth import hash_password

        squatted = User(
            email="pasencore@gmail.com",
            hashed_password=hash_password("Xx123456!"),
            email_verified=False,
        )
        test_db.add(squatted)
        await test_db.commit()

        google_ok["claims"] = _claims(email="pasencore@gmail.com", sub="sub-owner")
        r = await client.post("/auth/google", json={"credential": "fake-jwt"})
        assert r.status_code == 200

        await test_db.refresh(squatted)
        assert squatted.email_verified is True
        assert squatted.google_id == "sub-owner"

    async def test_password_login_rejected_for_google_only_account(
        self, client, google_ok
    ):
        await client.post("/auth/google", json={"credential": "fake-jwt"})
        r = await client.post(
            "/auth/login",
            data={"username": "nouveau@gmail.com", "password": "nimporte"},
        )
        assert r.status_code == 401
        assert "Google" in r.json()["detail"]

    async def test_invalid_google_token_is_401(self, client, google_invalid):
        r = await client.post("/auth/google", json={"credential": "corrompu"})
        assert r.status_code == 401

    async def test_google_unverified_email_is_401(self, client, google_ok):
        google_ok["claims"] = _claims(email_verified=False)
        r = await client.post("/auth/google", json={"credential": "fake-jwt"})
        assert r.status_code == 401

    async def test_me_exposes_has_password(self, client, google_ok, auth_headers):
        # Compte classique : has_password true.
        r = await client.get("/auth/me", headers=auth_headers)
        assert r.json()["has_password"] is True

        # Compte Google-only : has_password false.
        r = await client.post("/auth/google", json={"credential": "fake-jwt"})
        token = r.json()["access_token"]
        r = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.json()["has_password"] is False
