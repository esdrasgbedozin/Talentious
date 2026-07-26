"""
Tests GET /admin/users (M8-T02) — vue d'administration des comptes.

Lecture seule, réservée au rôle admin (403 sinon). Vérifie le contenu
(email vérifié, pass actif + échéance, nombre de CV, nom issu du profil),
le tri (inscriptions récentes d'abord) et la pagination limit/offset.
"""

from datetime import datetime, timedelta, timezone

import pytest

from app.models import CareerPass, GeneratedCV, PassType


@pytest.mark.asyncio
class TestAdminUsers:
    async def test_requires_auth(self, client):
        r = await client.get("/admin/users")
        assert r.status_code == 401

    async def test_forbidden_for_regular_user(self, client, auth_headers):
        r = await client.get("/admin/users", headers=auth_headers)
        assert r.status_code == 403

    async def test_lists_users_with_state(
        self, client, admin_headers, admin_user, test_user, test_db
    ):
        # Le test_user reçoit un pass actif et un CV généré.
        test_db.add(
            CareerPass(
                user_id=test_user.id,
                pass_type=PassType.PASS_30_DAYS,
                valid_until=datetime.now(timezone.utc) + timedelta(days=10),
            )
        )
        test_db.add(
            GeneratedCV(
                user_id=test_user.id,
                cv_name="CV test",
                template_id="moderne",
                cv_data_json={},
            )
        )
        await test_db.commit()

        r = await client.get("/admin/users", headers=admin_headers)
        assert r.status_code == 200
        body = r.json()
        assert body["total"] == 2
        by_email = {u["email"]: u for u in body["users"]}

        tu = by_email["testuser@example.com"]
        assert tu["full_name"] == "Test User"
        assert tu["role"] == "user"
        assert tu["email_verified"] is True
        assert tu["has_active_pass"] is True
        assert tu["pass_valid_until"] is not None
        assert tu["cv_count"] == 1

        adm = by_email["admin@example.com"]
        assert adm["role"] == "admin"
        assert adm["has_active_pass"] is False
        assert adm["pass_valid_until"] is None
        assert adm["cv_count"] == 0

    async def test_expired_pass_is_not_active(
        self, client, admin_headers, test_user, test_db
    ):
        test_db.add(
            CareerPass(
                user_id=test_user.id,
                pass_type=PassType.PASS_30_DAYS,
                valid_until=datetime.now(timezone.utc) - timedelta(days=1),
            )
        )
        await test_db.commit()

        r = await client.get("/admin/users", headers=admin_headers)
        tu = next(u for u in r.json()["users"] if u["email"] == "testuser@example.com")
        assert tu["has_active_pass"] is False
        assert tu["pass_valid_until"] is None

    async def test_sorted_most_recent_first_and_paginated(
        self, client, admin_headers, admin_user, test_user
    ):
        r = await client.get("/admin/users?limit=1&offset=0", headers=admin_headers)
        body = r.json()
        assert body["total"] == 2
        assert len(body["users"]) == 1
        first = body["users"][0]

        r2 = await client.get("/admin/users?limit=1&offset=1", headers=admin_headers)
        second = r2.json()["users"][0]
        assert first["email"] != second["email"]
        # Tri : inscriptions récentes d'abord.
        assert first["created_at"] >= second["created_at"]

    async def test_limit_is_bounded(self, client, admin_headers):
        r = await client.get("/admin/users?limit=999", headers=admin_headers)
        assert r.status_code == 422  # au-delà du max contractuel (200)
