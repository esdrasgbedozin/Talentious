"""
Stripe billing service.

One integration, two modes: with `sk_test_...` keys (+ Stripe CLI) it runs in test
mode; with `sk_live_...` keys it takes real payments — same code (see ADR-MODEL).
The route layer stays thin; this module owns the Stripe calls so they are easy to
mock in tests (no network in the test suite).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

import stripe

from app.config import settings
from app.models import PassType

# Configure the SDK once from settings (None in tests → stripe calls are mocked).
stripe.api_key = settings.stripe_secret_key


@dataclass(frozen=True)
class PassSpec:
    price_id: Optional[str]
    duration_days: int
    model_pass_type: PassType


# Maps the API pass_type (contract enum, e.g. "PASS_30_DAYS") to its Stripe price,
# validity window, and the DB enum member.
PASS_SPECS: dict[str, PassSpec] = {
    "PASS_30_DAYS": PassSpec(settings.stripe_price_30_days, 30, PassType.PASS_30_DAYS),
    "PASS_90_DAYS": PassSpec(settings.stripe_price_90_days, 90, PassType.PASS_90_DAYS),
}


class BillingConfigError(RuntimeError):
    """Raised when Stripe is not configured for the requested pass."""


def get_pass_spec(pass_type: str) -> PassSpec:
    spec = PASS_SPECS.get(pass_type)
    if spec is None:
        raise BillingConfigError(f"Unknown pass type: {pass_type}")
    if not spec.price_id:
        raise BillingConfigError(f"No Stripe price configured for {pass_type}")
    return spec


def create_checkout_session(
    *,
    user_id: UUID,
    user_email: str,
    pass_type: str,
    success_url: str,
    cancel_url: str,
) -> tuple[str, str]:
    """Create a Stripe Checkout Session; returns (checkout_url, session_id)."""
    spec = get_pass_spec(pass_type)
    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[{"price": spec.price_id, "quantity": 1}],
        client_reference_id=str(user_id),
        customer_email=user_email,
        metadata={"user_id": str(user_id), "pass_type": pass_type},
        success_url=success_url,
        cancel_url=cancel_url,
    )
    return session.url, session.id


def construct_event(payload: bytes, signature: str):
    """Verify the Stripe webhook signature and return the event (raises on failure)."""
    return stripe.Webhook.construct_event(
        payload, signature, settings.stripe_webhook_secret
    )


def valid_until_for(pass_type: str, *, now: Optional[datetime] = None) -> datetime:
    spec = PASS_SPECS[pass_type]
    base = now or datetime.now(timezone.utc)
    return base + timedelta(days=spec.duration_days)
