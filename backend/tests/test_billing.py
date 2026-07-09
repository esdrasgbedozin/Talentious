"""
Tests for the Stripe billing integration (routes/billing.py + services/billing.py).

Stripe is always MOCKED — the suite never performs a network call. We test our own
logic: checkout session creation, signature-verified webhook fulfilment (idempotent),
and the active-pass status endpoint.
"""

from datetime import datetime, timezone

import pytest
import stripe
from sqlalchemy import select

from app.models import CareerPass, PassType
from app.services import billing


# ----------------------------------------------------------------------------
# POST /billing/checkout-session
# ----------------------------------------------------------------------------


class TestCheckoutSession:
    async def test_creates_session(self, client, auth_headers, monkeypatch):
        monkeypatch.setattr(
            billing,
            "create_checkout_session",
            lambda **kw: ("https://checkout.stripe.com/pay/cs_test_1", "cs_test_1"),
        )
        r = await client.post(
            "/billing/checkout-session",
            headers=auth_headers,
            json={"pass_type": "PASS_30_DAYS"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["checkout_url"].startswith("https://checkout.stripe.com/")
        assert body["session_id"] == "cs_test_1"

    async def test_invalid_pass_type_is_422(self, client, auth_headers):
        r = await client.post(
            "/billing/checkout-session",
            headers=auth_headers,
            json={"pass_type": "PASS_7_DAYS"},
        )
        assert r.status_code == 422

    async def test_requires_auth(self, client):
        r = await client.post(
            "/billing/checkout-session", json={"pass_type": "PASS_30_DAYS"}
        )
        assert r.status_code == 401

    async def test_unconfigured_price_is_503(self, client, auth_headers):
        """No Stripe price configured (default) → 503, not a 500 leak."""
        r = await client.post(
            "/billing/checkout-session",
            headers=auth_headers,
            json={"pass_type": "PASS_30_DAYS"},
        )
        assert r.status_code == 503
        assert r.headers["content-type"].startswith("application/problem+json")


# ----------------------------------------------------------------------------
# POST /billing/webhook
# ----------------------------------------------------------------------------


def _completed_event(user_id: str, payment_id: str = "pi_test_1"):
    return {
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "id": "cs_test_1",
                "client_reference_id": user_id,
                "payment_intent": payment_id,
                "metadata": {"user_id": user_id, "pass_type": "PASS_30_DAYS"},
            }
        },
    }


class TestWebhook:
    async def test_completed_checkout_creates_pass(
        self, client, test_user, test_db, monkeypatch
    ):
        event = _completed_event(str(test_user.id))
        monkeypatch.setattr(billing, "construct_event", lambda payload, sig: event)

        r = await client.post(
            "/billing/webhook",
            content=b"{}",
            headers={"Stripe-Signature": "whatever"},
        )
        assert r.status_code == 200

        result = await test_db.execute(
            select(CareerPass).where(CareerPass.user_id == test_user.id)
        )
        cp = result.scalars().first()
        assert cp is not None
        assert cp.pass_type == PassType.PASS_30_DAYS
        assert cp.stripe_payment_id == "pi_test_1"
        assert cp.valid_until > datetime.now(timezone.utc)

    async def test_bad_signature_is_400(self, client, monkeypatch):
        def _raise(payload, sig):
            raise stripe.SignatureVerificationError("bad sig", "sig-header")

        monkeypatch.setattr(billing, "construct_event", _raise)
        r = await client.post(
            "/billing/webhook", content=b"{}", headers={"Stripe-Signature": "x"}
        )
        assert r.status_code == 400
        assert r.headers["content-type"].startswith("application/problem+json")

    async def test_webhook_is_idempotent(self, client, test_user, test_db, monkeypatch):
        event = _completed_event(str(test_user.id), payment_id="pi_dup")
        monkeypatch.setattr(billing, "construct_event", lambda payload, sig: event)

        for _ in range(2):
            r = await client.post(
                "/billing/webhook", content=b"{}", headers={"Stripe-Signature": "x"}
            )
            assert r.status_code == 200

        result = await test_db.execute(
            select(CareerPass).where(CareerPass.stripe_payment_id == "pi_dup")
        )
        assert len(result.scalars().all()) == 1


# ----------------------------------------------------------------------------
# GET /billing/status
# ----------------------------------------------------------------------------


class TestBillingStatus:
    async def test_no_pass(self, client, auth_headers):
        r = await client.get("/billing/status", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["has_active_pass"] is False

    async def test_active_pass(self, client, auth_headers, test_user, test_db):
        test_db.add(
            CareerPass(
                user_id=test_user.id,
                stripe_payment_id="pi_active",
                pass_type=PassType.PASS_30_DAYS,
                valid_until=billing.valid_until_for("PASS_30_DAYS"),
            )
        )
        await test_db.commit()
        r = await client.get("/billing/status", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["has_active_pass"] is True
