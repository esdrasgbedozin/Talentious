"""
Tests for the full transactional-email set (M7-T04) and email-endpoint rate
limiting (M7-T06).

Every email function is monkeypatched — nothing is ever sent. Each business
event must trigger exactly its email: first verification → welcome; Stripe
checkout webhook → purchase confirmation; account erasure → RGPD acknowledgement;
password reset → security notice.
"""

from urllib.parse import parse_qs, urlparse

import pytest

from app.core.rate_limit import limiter as _limiter
from app.services import billing, email_service


def _token_from(url: str) -> str:
    return parse_qs(urlparse(url).query)["token"][0]


def _completed_event(user_id: str, payment_id: str = "pi_email_1"):
    return {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_email_1",
                "client_reference_id": user_id,
                "payment_intent": payment_id,
                "metadata": {"user_id": user_id, "pass_type": "PASS_30_DAYS"},
            }
        },
    }


@pytest.fixture
def outbox(monkeypatch):
    """Capture every transactional email as (kind, kwargs) tuples."""
    sent = []

    def _capture(kind):
        async def _fake(**kwargs):
            sent.append((kind, kwargs))

        return _fake

    monkeypatch.setattr(
        email_service, "send_verification_email", _capture("verification")
    )
    monkeypatch.setattr(email_service, "send_welcome_email", _capture("welcome"))
    monkeypatch.setattr(email_service, "send_pass_purchase_email", _capture("purchase"))
    monkeypatch.setattr(
        email_service, "send_account_deleted_email", _capture("deleted")
    )
    monkeypatch.setattr(
        email_service, "send_password_changed_email", _capture("password_changed")
    )
    monkeypatch.setattr(email_service, "send_password_reset_email", _capture("reset"))
    return sent


def _kinds(outbox):
    return [k for k, _ in outbox]


@pytest.mark.asyncio
class TestTransactionalEmails:
    async def test_welcome_sent_on_first_verification_only(self, client, outbox):
        await client.post(
            "/auth/register",
            json={"email": "welcome@example.com", "password": "TestPassword123!"},
        )
        token = _token_from(outbox[0][1]["verify_url"])

        await client.post("/auth/verify-email", json={"token": token})
        assert _kinds(outbox) == ["verification", "welcome"]
        assert outbox[1][1]["to"] == "welcome@example.com"

        # Re-verifying (idempotent) must NOT send a second welcome.
        await client.post("/auth/verify-email", json={"token": token})
        assert _kinds(outbox) == ["verification", "welcome"]

    async def test_purchase_email_on_checkout_webhook(
        self, client, test_user, outbox, monkeypatch
    ):
        event = _completed_event(str(test_user.id))
        monkeypatch.setattr(billing, "construct_event", lambda payload, sig: event)

        r = await client.post(
            "/billing/webhook", content=b"{}", headers={"Stripe-Signature": "x"}
        )
        assert r.status_code == 200
        assert _kinds(outbox) == ["purchase"]
        assert outbox[0][1]["to"] == test_user.email
        assert "30 jours" in outbox[0][1]["pass_label"]

    async def test_no_purchase_email_on_duplicate_webhook(
        self, client, test_user, outbox, monkeypatch
    ):
        event = _completed_event(str(test_user.id), payment_id="pi_dup_email")
        monkeypatch.setattr(billing, "construct_event", lambda payload, sig: event)

        for _ in range(2):
            await client.post(
                "/billing/webhook", content=b"{}", headers={"Stripe-Signature": "x"}
            )
        # One pass granted → exactly one confirmation email.
        assert _kinds(outbox) == ["purchase"]

    async def test_deletion_acknowledgement_email(
        self, client, auth_headers, test_user, outbox
    ):
        r = await client.delete("/users/me", headers=auth_headers)
        assert r.status_code == 204
        assert _kinds(outbox) == ["deleted"]
        assert outbox[0][1]["to"] == test_user.email

    async def test_password_changed_email_after_reset(self, client, test_user, outbox):
        await client.post("/auth/password/forgot", json={"email": test_user.email})
        token = _token_from(outbox[0][1]["reset_url"])

        r = await client.post(
            "/auth/password/reset",
            json={"token": token, "new_password": "NewPassword456!"},
        )
        assert r.status_code == 204
        assert _kinds(outbox) == ["reset", "password_changed"]
        assert outbox[1][1]["to"] == test_user.email


@pytest.mark.asyncio
class TestEmailRateLimit:
    async def test_forgot_password_is_rate_limited(self, client, outbox):
        """Beyond the email rate limit, forgot-password returns 429 problem+json."""
        _limiter.enabled = True
        _limiter.reset()
        try:
            statuses = []
            for _ in range(4):  # limit is 3/minute
                r = await client.post(
                    "/auth/password/forgot", json={"email": "ghost@example.com"}
                )
                statuses.append(r.status_code)
            assert statuses[:3] == [204, 204, 204]
            assert statuses[3] == 429
        finally:
            _limiter.enabled = False
            _limiter.reset()

    async def test_resend_verification_is_rate_limited(
        self, client, auth_headers, test_user, outbox
    ):
        _limiter.enabled = True
        _limiter.reset()
        try:
            statuses = []
            for _ in range(4):
                r = await client.post("/auth/resend-verification", headers=auth_headers)
                statuses.append(r.status_code)
            assert statuses[:3] == [204, 204, 204]
            assert statuses[3] == 429
        finally:
            _limiter.enabled = False
            _limiter.reset()
