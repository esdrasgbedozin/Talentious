"""
Billing routes — Stripe Checkout + webhook (creates a CareerPass on payment).

- POST /billing/checkout-session  (JWT) : start a Checkout, return the redirect URL.
- POST /billing/webhook           (public, Stripe-signature verified) : fulfill payment.
- GET  /billing/status            (JWT) : does the user have an active pass?

The webhook is the source of truth: the CareerPass is created only when Stripe
confirms `checkout.session.completed`, never from the client.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import CareerPass, PassType, User
from app.services import billing
from app.services.dependencies import get_current_active_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/billing", tags=["Billing"])


class CheckoutSessionRequest(BaseModel):
    pass_type: str = Field(..., description="PASS_30_DAYS or PASS_90_DAYS")
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


class CheckoutSessionResponse(BaseModel):
    checkout_url: str
    session_id: str


class BillingStatusResponse(BaseModel):
    has_active_pass: bool
    valid_until: Optional[datetime] = None


@router.post("/checkout-session", response_model=CheckoutSessionResponse)
async def create_checkout_session(
    request: CheckoutSessionRequest,
    current_user: User = Depends(get_current_active_user),
):
    """Create a Stripe Checkout Session for a CareerPass purchase."""
    if request.pass_type not in billing.PASS_SPECS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid pass_type. Expected PASS_30_DAYS or PASS_90_DAYS.",
        )

    success_url = request.success_url or f"{settings.app_base_url}/billing/success"
    cancel_url = request.cancel_url or f"{settings.app_base_url}/billing/cancelled"

    try:
        url, session_id = billing.create_checkout_session(
            user_id=current_user.id,
            user_email=current_user.email,
            pass_type=request.pass_type,
            success_url=success_url,
            cancel_url=cancel_url,
        )
    except billing.BillingConfigError as exc:
        logger.error("Billing not configured: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment is temporarily unavailable.",
        )
    except stripe.StripeError as exc:
        logger.error("Stripe checkout error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The payment provider is temporarily unavailable.",
        )

    return CheckoutSessionResponse(checkout_url=url, session_id=session_id)


@router.post("/webhook", status_code=status.HTTP_200_OK)
async def stripe_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle Stripe events. Public endpoint, authenticated by HMAC signature."""
    payload = await request.body()
    signature = request.headers.get("Stripe-Signature", "")

    try:
        event = billing.construct_event(payload, signature)
    except (stripe.SignatureVerificationError, ValueError) as exc:
        logger.warning("Rejected Stripe webhook (bad signature/payload): %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid webhook signature.",
        )

    if event["type"] == "checkout.session.completed":
        await _fulfill_checkout(event["data"]["object"], db)

    # Always 200 for handled/ignored events so Stripe stops retrying.
    return {"received": True}


async def _fulfill_checkout(session: dict, db: AsyncSession) -> None:
    """Create the CareerPass for a completed checkout (idempotent)."""
    user_id = session.get("client_reference_id") or (session.get("metadata") or {}).get(
        "user_id"
    )
    pass_type = (session.get("metadata") or {}).get("pass_type")
    payment_id = session.get("payment_intent") or session.get("id")

    if not user_id or pass_type not in billing.PASS_SPECS:
        logger.error(
            "Checkout completed with missing/invalid metadata: %s", session.get("id")
        )
        return

    career_pass = CareerPass(
        user_id=UUID(str(user_id)),
        stripe_payment_id=payment_id,
        pass_type=billing.PASS_SPECS[pass_type].model_pass_type,
        valid_until=billing.valid_until_for(pass_type),
    )
    db.add(career_pass)
    try:
        await db.commit()
        logger.info("CareerPass created for user %s (%s)", user_id, pass_type)
    except IntegrityError:
        # Duplicate payment_id → webhook already processed. Idempotent no-op.
        await db.rollback()
        logger.info("Duplicate webhook for payment %s ignored.", payment_id)


@router.get("/status", response_model=BillingStatusResponse)
async def billing_status(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Whether the user currently holds an active CareerPass."""
    result = await db.execute(
        select(CareerPass)
        .where(CareerPass.user_id == current_user.id)
        .where(CareerPass.valid_until > datetime.now(timezone.utc))
        .order_by(CareerPass.valid_until.desc())
    )
    active = result.scalars().first()
    return BillingStatusResponse(
        has_active_pass=active is not None,
        valid_until=active.valid_until if active else None,
    )
