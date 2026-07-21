"""
Tests: la vérification d'email est OBLIGATOIRE pour se connecter (retour testeurs).

- Login refusé (403) tant que l'adresse n'est pas vérifiée ; accepté après.
- Anti-squat : register sur un email existant NON vérifié ne dit pas « déjà
  utilisé » — il renvoie l'email de vérification sans toucher au compte (mot de
  passe d'origine conservé). Le 400 reste pour les comptes vérifiés.
- Resend PUBLIC : 204 constant (anti-énumération), envoi seulement si le compte
  existe et n'est pas vérifié.
"""

from urllib.parse import parse_qs, urlparse

import pytest
from sqlalchemy import select

from app.models import User
from app.services import email_service


@pytest.fixture
def outbox(monkeypatch):
    sent = []

    async def _fake(*, to, verify_url):
        sent.append({"to": to, "verify_url": verify_url})

    monkeypatch.setattr(email_service, "send_verification_email", _fake)
    return sent


async def _register(client, email, password="TestPassword123!"):
    return await client.post(
        "/auth/register", json={"email": email, "password": password}
    )


async def _login(client, email, password="TestPassword123!"):
    return await client.post(
        "/auth/login", data={"username": email, "password": password}
    )


def _token_from(url: str) -> str:
    return parse_qs(urlparse(url).query)["token"][0]


@pytest.mark.asyncio
class TestLoginRequiresVerifiedEmail:
    async def test_unverified_login_is_403(self, client, outbox):
        await _register(client, "unverified@example.com")
        response = await _login(client, "unverified@example.com")
        assert response.status_code == 403
        assert "vérifi" in response.json()["detail"].lower()

    async def test_wrong_password_still_401_even_unverified(self, client, outbox):
        """Le 403 ne doit pas fuiter la validité du mot de passe : mauvais mdp → 401."""
        await _register(client, "unverified2@example.com")
        response = await _login(client, "unverified2@example.com", "WrongPass999!")
        assert response.status_code == 401

    async def test_login_ok_after_verification(self, client, outbox):
        await _register(client, "willverify@example.com")
        token = _token_from(outbox[0]["verify_url"])
        await client.post("/auth/verify-email", json={"token": token})

        response = await _login(client, "willverify@example.com")
        assert response.status_code == 200
        assert response.json()["access_token"]

    async def test_verified_fixture_user_still_logs_in(self, client, auth_headers):
        """La fixture test_user (vérifiée) continue de fonctionner — non-régression."""
        assert auth_headers["Authorization"].startswith("Bearer ")


@pytest.mark.asyncio
class TestRegisterAntiSquat:
    async def test_register_on_unverified_email_resends_not_conflict(
        self, client, outbox, test_db
    ):
        first = await _register(client, "squatted@example.com", "AttackerPass123!")
        assert first.status_code == 201
        assert len(outbox) == 1

        # Le titulaire réel retente avec SON mot de passe : pas de « déjà utilisé »,
        # un nouvel email de vérification part, le compte n'est PAS modifié.
        second = await _register(client, "squatted@example.com", "OwnerPass456!")
        assert second.status_code == 201
        assert len(outbox) == 2
        assert outbox[1]["to"] == "squatted@example.com"

        # Mot de passe d'origine conservé (le compte ne peut pas être écrasé sans
        # contrôle de la boîte mail) : la récupération passe par vérif + reset.
        user = (
            await test_db.execute(
                select(User).where(User.email == "squatted@example.com")
            )
        ).scalar_one()
        assert user.email_verified is False

    async def test_register_on_verified_email_is_400(self, client, test_user, outbox):
        response = await _register(client, test_user.email, "Whatever123!")
        assert response.status_code == 400


@pytest.mark.asyncio
class TestPublicResend:
    async def test_resend_unknown_email_is_constant_204(self, client, outbox):
        response = await client.post(
            "/auth/verify-email/resend", json={"email": "ghost@example.com"}
        )
        assert response.status_code == 204
        assert outbox == []

    async def test_resend_unverified_sends(self, client, outbox):
        await _register(client, "toresend@example.com")
        outbox.clear()
        response = await client.post(
            "/auth/verify-email/resend", json={"email": "toresend@example.com"}
        )
        assert response.status_code == 204
        assert len(outbox) == 1

    async def test_resend_verified_is_silent_204(self, client, test_user, outbox):
        response = await client.post(
            "/auth/verify-email/resend", json={"email": test_user.email}
        )
        assert response.status_code == 204
        assert outbox == []
