"""
Tests « Mon compte » (chantier 2 retours testeurs) :

- POST /auth/password/change : ré-authentification par mot de passe actuel,
  changement effectif, révocation de toutes les sessions, notification email.
- POST /auth/email/change + /auth/email/confirm : le lien part vers la NOUVELLE
  adresse, le compte ne change qu'à la confirmation, l'ancienne adresse est
  notifiée, les collisions sont refusées.
- GET /auth/me expose display_name (prénom du profil) — la navbar l'affiche.
"""

from urllib.parse import parse_qs, urlparse

import pytest

from app.config import settings
from app.services import email_service

COOKIE = settings.refresh_cookie_name


@pytest.fixture
def outbox(monkeypatch):
    """Capture tous les emails du chantier (aucun envoi réel)."""
    sent = []

    def _cap(kind):
        async def _fake(**kwargs):
            sent.append((kind, kwargs))

        return _fake

    monkeypatch.setattr(
        email_service, "send_password_changed_email", _cap("password_changed")
    )
    monkeypatch.setattr(email_service, "send_email_change_email", _cap("email_change"))
    monkeypatch.setattr(
        email_service, "send_email_changed_notice", _cap("email_changed_notice")
    )
    return sent


def _token_from(url: str) -> str:
    return parse_qs(urlparse(url).query)["token"][0]


@pytest.mark.asyncio
class TestChangePassword:
    async def test_requires_auth(self, client):
        r = await client.post(
            "/auth/password/change",
            json={"current_password": "x", "new_password": "NewPass123!"},
        )
        assert r.status_code == 401

    async def test_wrong_current_password_is_401(self, client, auth_headers, outbox):
        r = await client.post(
            "/auth/password/change",
            headers=auth_headers,
            json={"current_password": "WrongPass!", "new_password": "NewPass123!"},
        )
        assert r.status_code == 401
        assert outbox == []

    async def test_change_password_full_flow(
        self, client, auth_headers, test_user, outbox
    ):
        # une session refresh existe (login de la fixture auth_headers)
        r = await client.post(
            "/auth/password/change",
            headers=auth_headers,
            json={
                "current_password": "TestPassword123!",
                "new_password": "BrandNew456!",
            },
        )
        assert r.status_code == 204

        # ancien mdp KO, nouveau OK
        old = await client.post(
            "/auth/login",
            data={"username": test_user.email, "password": "TestPassword123!"},
        )
        assert old.status_code == 401
        new = await client.post(
            "/auth/login",
            data={"username": test_user.email, "password": "BrandNew456!"},
        )
        assert new.status_code == 200

        # notification envoyée
        assert ("password_changed", {"to": test_user.email}) in [
            (k, {"to": v.get("to")}) for k, v in outbox
        ]

    async def test_change_password_revokes_sessions(
        self, client, auth_headers, test_user, outbox
    ):
        login = await client.post(
            "/auth/login",
            data={"username": test_user.email, "password": "TestPassword123!"},
        )
        old_refresh = login.cookies.get(COOKIE)

        await client.post(
            "/auth/password/change",
            headers=auth_headers,
            json={
                "current_password": "TestPassword123!",
                "new_password": "BrandNew456!",
            },
        )

        client.cookies.clear()
        after = await client.post("/auth/refresh", cookies={COOKIE: old_refresh})
        assert after.status_code == 401

    async def test_short_new_password_is_422(self, client, auth_headers):
        r = await client.post(
            "/auth/password/change",
            headers=auth_headers,
            json={"current_password": "TestPassword123!", "new_password": "short"},
        )
        assert r.status_code == 422


@pytest.mark.asyncio
class TestChangeEmail:
    async def test_request_sends_link_to_new_address(
        self, client, auth_headers, test_user, outbox
    ):
        r = await client.post(
            "/auth/email/change",
            headers=auth_headers,
            json={
                "new_email": "nouveau@example.com",
                "current_password": "TestPassword123!",
            },
        )
        assert r.status_code == 204
        kinds = [k for k, _ in outbox]
        assert kinds == ["email_change"]
        assert outbox[0][1]["to"] == "nouveau@example.com"
        # l'adresse du compte n'a PAS encore changé
        me = await client.get("/auth/me", headers=auth_headers)
        assert me.json()["email"] == test_user.email

    async def test_wrong_password_is_401(self, client, auth_headers, outbox):
        r = await client.post(
            "/auth/email/change",
            headers=auth_headers,
            json={"new_email": "nouveau@example.com", "current_password": "Wrong!"},
        )
        assert r.status_code == 401
        assert outbox == []

    async def test_same_email_is_400(self, client, auth_headers, test_user, outbox):
        r = await client.post(
            "/auth/email/change",
            headers=auth_headers,
            json={
                "new_email": test_user.email,
                "current_password": "TestPassword123!",
            },
        )
        assert r.status_code == 400

    async def test_taken_email_is_400(self, client, auth_headers, admin_user, outbox):
        r = await client.post(
            "/auth/email/change",
            headers=auth_headers,
            json={
                "new_email": admin_user.email,
                "current_password": "TestPassword123!",
            },
        )
        assert r.status_code == 400

    async def test_confirm_applies_change_and_notifies_old(
        self, client, auth_headers, test_user, outbox
    ):
        old_email = test_user.email
        await client.post(
            "/auth/email/change",
            headers=auth_headers,
            json={
                "new_email": "nouvelle-adresse@example.com",
                "current_password": "TestPassword123!",
            },
        )
        token = _token_from(outbox[0][1]["confirm_url"])

        r = await client.post("/auth/email/confirm", json={"token": token})
        assert r.status_code == 200
        assert r.json()["email"] == "nouvelle-adresse@example.com"

        # login : nouvelle adresse OK, ancienne KO
        new = await client.post(
            "/auth/login",
            data={
                "username": "nouvelle-adresse@example.com",
                "password": "TestPassword123!",
            },
        )
        assert new.status_code == 200
        old = await client.post(
            "/auth/login",
            data={"username": old_email, "password": "TestPassword123!"},
        )
        assert old.status_code == 401

        # l'ancienne adresse a reçu la notification de sécurité
        notices = [v for k, v in outbox if k == "email_changed_notice"]
        assert notices and notices[0]["to"] == old_email

    async def test_confirm_invalid_token_is_400(self, client):
        r = await client.post("/auth/email/confirm", json={"token": "garbage"})
        assert r.status_code == 400


@pytest.mark.asyncio
class TestDisplayName:
    async def test_me_exposes_profile_first_name(self, client, auth_headers):
        # la fixture test_user a un profil avec first_name="Test"
        r = await client.get("/auth/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["display_name"] == "Test"
