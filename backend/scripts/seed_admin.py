"""
Seed an admin account for local development and testing.

Admins bypass the CareerPass check, so this unblocks end-to-end CV generation
locally without a Stripe payment. Idempotent: re-running updates nothing if the
admin already exists.

Usage:
    ADMIN_EMAIL=founder@talentious.fr ADMIN_PASSWORD='change-me' \
        python -m scripts.seed_admin

Environment variables:
    ADMIN_EMAIL     (default: admin@talentious.fr)
    ADMIN_PASSWORD  (default: adminpassword — CHANGE for anything shared)
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import CareerPass, PassType, User, UserRole
from app.schemas.profile import PersonalInfo, ProfileData, Skills
from app.models.user_profile import UserProfile
from app.services.auth import hash_password

DEFAULT_ADMIN_PASSWORD = "adminpassword"
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@talentious.fr")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", DEFAULT_ADMIN_PASSWORD)


async def seed_admin() -> None:
    if AsyncSessionLocal is None:
        raise RuntimeError("Database engine not initialized (async URL required).")

    # Never create an admin with the well-known default password outside local dev.
    if (
        os.getenv("ENVIRONMENT", "development").lower() != "development"
        and ADMIN_PASSWORD == DEFAULT_ADMIN_PASSWORD
    ):
        raise SystemExit(
            "[seed_admin] Refusing to seed admin with the default password outside "
            "development. Set ADMIN_PASSWORD to a strong secret."
        )

    async with AsyncSessionLocal() as db:
        existing = await db.execute(select(User).where(User.email == ADMIN_EMAIL))
        if existing.scalars().first() is not None:
            print(f"[seed_admin] Admin '{ADMIN_EMAIL}' already exists — nothing to do.")
            return

        admin = User(
            email=ADMIN_EMAIL,
            hashed_password=hash_password(ADMIN_PASSWORD),
            role=UserRole.ADMIN,
            email_verified=True,  # le login exige désormais une adresse vérifiée
        )
        db.add(admin)
        await db.flush()

        profile_data = ProfileData(
            personal_info=PersonalInfo(
                first_name="Admin", last_name="Talentious", email=ADMIN_EMAIL
            ),
            summary="Founder / admin account for local testing.",
            experiences=[],
            educations=[],
            skills=Skills(hard=[], soft=[]),
            projects=[],
            certifications=[],
        )
        db.add(
            UserProfile(
                user_id=admin.id, profile_data=profile_data.model_dump(mode="json")
            )
        )

        # A long-lived pass so any pass-gated code paths also work under this account.
        db.add(
            CareerPass(
                user_id=admin.id,
                stripe_payment_id=None,  # admin-granted, no Stripe payment
                pass_type=PassType.PASS_90_DAYS,
                valid_until=datetime.now(timezone.utc) + timedelta(days=365),
            )
        )

        await db.commit()
        print(f"[seed_admin] Created admin '{ADMIN_EMAIL}' with a 365-day pass.")


if __name__ == "__main__":
    asyncio.run(seed_admin())
