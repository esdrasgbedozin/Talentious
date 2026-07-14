"""
Tests for RGPD Art. 17 account erasure — DELETE /users/me.

The endpoint permanently and irreversibly erases the authenticated user and all
their personal data. These tests assert the hard delete cascades to every related
table (real Postgres ON DELETE CASCADE runs in the test DB), that the endpoint is
authenticated-only, that the caller's token is de-facto invalidated afterwards,
and that Stripe customer deletion is best-effort (only when a customer exists).
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from app.models import (
    CareerPass,
    CVJob,
    GeneratedCV,
    JobStatus,
    PassType,
    User,
    UserProfile,
)
from app.models.user import UserRole
from app.services.auth import hash_password


async def _count(db, model) -> int:
    result = await db.execute(select(func.count()).select_from(model))
    return result.scalar_one()


@pytest.mark.asyncio
class TestDeleteAccount:
    async def test_requires_authentication(self, client):
        """No bearer token → 401, no erasure."""
        response = await client.delete("/users/me")
        assert response.status_code == 401

    async def test_deletes_user_and_cascades_all_data(
        self, client, auth_headers, test_user, test_db
    ):
        """Erasing the user purges profile, CVs, jobs and passes (DB cascade)."""
        test_db.add(
            GeneratedCV(
                user_id=test_user.id,
                cv_name="Mon CV",
                template_id="default",
                cv_data_json={},
            )
        )
        test_db.add(
            CVJob(user_id=test_user.id, cv_name="Mon CV", status=JobStatus.SUCCEEDED)
        )
        test_db.add(
            CareerPass(
                user_id=test_user.id,
                pass_type=PassType.PASS_30_DAYS,
                valid_until=datetime.now(timezone.utc) + timedelta(days=30),
            )
        )
        await test_db.commit()

        response = await client.delete("/users/me", headers=auth_headers)

        assert response.status_code == 204
        assert response.content == b""
        assert await _count(test_db, User) == 0
        assert await _count(test_db, UserProfile) == 0
        assert await _count(test_db, GeneratedCV) == 0
        assert await _count(test_db, CVJob) == 0
        assert await _count(test_db, CareerPass) == 0

    async def test_token_is_invalid_after_deletion(
        self, client, auth_headers, test_user
    ):
        """Once the account is gone, the same JWT no longer authenticates."""
        deleted = await client.delete("/users/me", headers=auth_headers)
        assert deleted.status_code == 204

        me = await client.get("/auth/me", headers=auth_headers)
        assert me.status_code == 401

    async def test_stripe_not_called_when_no_customer(
        self, client, auth_headers, test_user, monkeypatch
    ):
        """A user without a Stripe customer id must not trigger any Stripe call."""
        called = {"hit": False}

        def _fake_delete(customer_id):  # pragma: no cover - must not run
            called["hit"] = True

        monkeypatch.setattr("app.services.billing.delete_customer", _fake_delete)

        response = await client.delete("/users/me", headers=auth_headers)

        assert response.status_code == 204
        assert called["hit"] is False

    async def test_stripe_customer_deleted_when_present(
        self, client, test_db, monkeypatch
    ):
        """A user with a Stripe customer id gets that customer deleted (best-effort)."""
        user = User(
            email="paid@example.com",
            hashed_password=hash_password("TestPassword123!"),
            role=UserRole.USER,
            stripe_customer_id="cus_test_123",
        )
        test_db.add(user)
        await test_db.flush()
        test_db.add(UserProfile(user_id=user.id, profile_data={}))
        await test_db.commit()

        login = await client.post(
            "/auth/login",
            data={"username": "paid@example.com", "password": "TestPassword123!"},
        )
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        captured = {}

        def _fake_delete(customer_id):
            captured["customer_id"] = customer_id

        monkeypatch.setattr("app.services.billing.delete_customer", _fake_delete)

        response = await client.delete("/users/me", headers=headers)

        assert response.status_code == 204
        assert captured.get("customer_id") == "cus_test_123"

    async def test_stripe_failure_does_not_block_erasure(
        self, client, test_db, monkeypatch
    ):
        """If Stripe deletion raises, the account is still erased (user entitled)."""
        user = User(
            email="paid2@example.com",
            hashed_password=hash_password("TestPassword123!"),
            role=UserRole.USER,
            stripe_customer_id="cus_test_456",
        )
        test_db.add(user)
        await test_db.flush()
        test_db.add(UserProfile(user_id=user.id, profile_data={}))
        await test_db.commit()

        login = await client.post(
            "/auth/login",
            data={"username": "paid2@example.com", "password": "TestPassword123!"},
        )
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

        def _boom(customer_id):
            raise RuntimeError("Stripe down")

        monkeypatch.setattr("app.services.billing.delete_customer", _boom)

        response = await client.delete("/users/me", headers=headers)

        assert response.status_code == 204
        assert await _count(test_db, User) == 0
