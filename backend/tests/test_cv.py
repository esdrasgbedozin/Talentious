"""
Tests for the asynchronous CV generation pipeline (routes/cv.py + services/cv_worker.py).

These cover the M1 milestone: no NameError regression, async job model (202 + polling),
idempotency, RFC 7807 errors, and the worker passing the canonical {hard, soft} skills
structure to the writer agent WITHOUT any runtime transformation.
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from sqlalchemy import select

from app.models import CVJob, GeneratedCV, JobStatus, UserProfile

VALID_OFFER = (
    "We are hiring a senior backend engineer with strong Python and FastAPI skills. "
    * 2
)


# ----------------------------------------------------------------------------
# POST /cv/generate — access control & validation
# ----------------------------------------------------------------------------


class TestGenerateAccess:
    async def test_generate_without_career_pass_returns_402(self, client, auth_headers):
        """A non-admin user without an active CareerPass is blocked (RFC 7807 402)."""
        response = await client.post(
            "/cv/generate",
            headers=auth_headers,
            json={"cv_name": "My CV", "offer_text": VALID_OFFER},
        )
        assert response.status_code == 402
        assert response.headers["content-type"].startswith("application/problem+json")
        body = response.json()
        assert body["status"] == 402
        assert "detail" in body

    async def test_generate_requires_auth(self, client):
        response = await client.post(
            "/cv/generate", json={"cv_name": "X", "offer_text": VALID_OFFER}
        )
        assert response.status_code == 401

    async def test_offer_text_too_short_is_422(self, client, admin_headers):
        response = await client.post(
            "/cv/generate",
            headers=admin_headers,
            json={"cv_name": "My CV", "offer_text": "too short"},
        )
        assert response.status_code == 422

    async def test_offer_text_too_long_is_422(self, client, admin_headers):
        response = await client.post(
            "/cv/generate",
            headers=admin_headers,
            json={"cv_name": "My CV", "offer_text": "x" * 200_001},
        )
        assert response.status_code == 422


# ----------------------------------------------------------------------------
# POST /cv/generate — async job creation (regression: no NameError timezone)
# ----------------------------------------------------------------------------


class TestGenerateAsync:
    async def test_admin_generate_returns_202_and_queues_job(
        self, client, admin_headers, admin_user, test_db, monkeypatch
    ):
        """Admin bypasses the pass; a job is queued and 202 is returned with a Location."""
        # Do not run the real pipeline in this route-level test.
        monkeypatch.setattr("app.routes.cv.run_cv_generation", AsyncMock())

        response = await client.post(
            "/cv/generate",
            headers=admin_headers,
            json={"cv_name": "Backend role", "offer_text": VALID_OFFER},
        )

        assert response.status_code == 202
        body = response.json()
        assert body["status"] == "queued"
        job_id = body["job_id"]
        assert response.headers["location"] == f"/cv/jobs/{job_id}"

        # The job was persisted in queued state.
        result = await test_db.execute(
            select(CVJob).where(CVJob.user_id == admin_user.id)
        )
        job = result.scalars().first()
        assert job is not None
        assert job.status == JobStatus.QUEUED

    async def test_generate_is_idempotent_returns_409_when_active_job_exists(
        self, client, admin_headers, admin_user, test_db, monkeypatch
    ):
        monkeypatch.setattr("app.routes.cv.run_cv_generation", AsyncMock())

        # Seed an already-running job for the admin.
        existing = CVJob(
            user_id=admin_user.id, cv_name="in progress", status=JobStatus.RUNNING
        )
        test_db.add(existing)
        await test_db.commit()

        response = await client.post(
            "/cv/generate",
            headers=admin_headers,
            json={"cv_name": "second", "offer_text": VALID_OFFER},
        )
        assert response.status_code == 409
        assert response.headers["content-type"].startswith("application/problem+json")


# ----------------------------------------------------------------------------
# GET /cv/jobs/{id}
# ----------------------------------------------------------------------------


class TestJobStatus:
    async def test_get_job_status(self, client, admin_headers, admin_user, test_db):
        job = CVJob(
            user_id=admin_user.id,
            cv_name="job",
            status=JobStatus.SUCCEEDED,
            progress_pct=100,
        )
        test_db.add(job)
        await test_db.commit()
        await test_db.refresh(job)

        response = await client.get(f"/cv/jobs/{job.id}", headers=admin_headers)
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "succeeded"
        assert body["progress_pct"] == 100

    async def test_get_unknown_job_is_404(self, client, admin_headers):
        response = await client.get(
            "/cv/jobs/00000000-0000-0000-0000-000000000000", headers=admin_headers
        )
        assert response.status_code == 404
        # RFC 7807 shape
        assert response.headers["content-type"].startswith("application/problem+json")
        body = response.json()
        assert body["status"] == 404
        assert "detail" in body

    async def test_cannot_read_another_users_job(
        self, client, auth_headers, admin_user, test_db
    ):
        """A non-owner, non-admin user gets 403 on someone else's job (IDOR guard)."""
        job = CVJob(user_id=admin_user.id, cv_name="admin job", status=JobStatus.QUEUED)
        test_db.add(job)
        await test_db.commit()
        await test_db.refresh(job)

        # auth_headers is the standard (non-admin) test_user, not the owner.
        response = await client.get(f"/cv/jobs/{job.id}", headers=auth_headers)
        assert response.status_code == 403


class TestCVOwnership:
    async def _make_cv(self, test_db, owner_id):
        cv = GeneratedCV(
            user_id=owner_id,
            cv_name="owned",
            template_id="modern_v1",
            job_offer_context="ctx",
            cv_data_json={"summary": "x"},
        )
        test_db.add(cv)
        await test_db.commit()
        await test_db.refresh(cv)
        return cv

    async def test_cannot_get_update_delete_another_users_cv(
        self, client, auth_headers, admin_user, test_db
    ):
        cv = await self._make_cv(test_db, admin_user.id)
        # auth_headers = non-admin test_user (not the owner)
        assert (
            await client.get(f"/cv/{cv.id}", headers=auth_headers)
        ).status_code == 403
        assert (
            await client.put(
                f"/cv/{cv.id}", headers=auth_headers, json={"cv_name": "hacked"}
            )
        ).status_code == 403
        assert (
            await client.delete(f"/cv/{cv.id}", headers=auth_headers)
        ).status_code == 403


# ----------------------------------------------------------------------------
# Worker unit tests (services/cv_worker.run_cv_generation)
# ----------------------------------------------------------------------------


def _fake_analysis():
    analysis = MagicMock()
    analysis.to_dict.return_value = {
        "hard_skills": [{"name": "Python"}],
        "soft_skills": [{"name": "Communication"}],
        "seniority_level": "senior",
        "key_responsibilities": ["Build APIs"],
        "tone": "professional",
    }
    return analysis


class TestWorker:
    async def test_worker_success_creates_cv_and_passes_skills_untransformed(
        self, session_factory, test_db, test_user, monkeypatch
    ):
        from app.services import cv_worker

        # Give the user real skills to prove they are passed through as {hard, soft}.
        result = await test_db.execute(
            select(UserProfile).where(UserProfile.user_id == test_user.id)
        )
        profile = result.scalars().first()
        data = dict(profile.profile_data)
        data["skills"] = {"hard": ["Python", "FastAPI"], "soft": ["Teamwork"]}
        profile.profile_data = data
        await test_db.commit()

        job = CVJob(user_id=test_user.id, cv_name="CV", status=JobStatus.QUEUED)
        test_db.add(job)
        await test_db.commit()
        await test_db.refresh(job)

        captured = {}

        async def fake_generate_cv(*, user_profile, offer_analysis):
            captured["user_profile"] = user_profile
            return {"cv_data": {"summary": "optimized"}}

        monkeypatch.setattr(
            cv_worker.analyzer_client,
            "analyze_text",
            AsyncMock(return_value=_fake_analysis()),
        )
        monkeypatch.setattr(cv_worker.writer_client, "generate_cv", fake_generate_cv)

        await cv_worker.run_cv_generation(
            session_factory, job.id, test_user.id, "CV", VALID_OFFER
        )

        # Skills reached the writer as the canonical {hard, soft} dict — NOT a list.
        assert captured["user_profile"]["skills"] == {
            "hard": ["Python", "FastAPI"],
            "soft": ["Teamwork"],
        }

        # Job succeeded and a CV was persisted and linked.
        async with session_factory() as check:
            refreshed = await check.get(CVJob, job.id)
            assert refreshed.status == JobStatus.SUCCEEDED
            assert refreshed.progress_pct == 100
            assert refreshed.cv_id is not None
            cv = await check.get(GeneratedCV, refreshed.cv_id)
            assert cv is not None
            assert cv.cv_data_json == {"summary": "optimized"}

    async def test_worker_failure_marks_job_failed(
        self, session_factory, test_db, test_user, monkeypatch
    ):
        from app.services import cv_worker

        job = CVJob(user_id=test_user.id, cv_name="CV", status=JobStatus.QUEUED)
        test_db.add(job)
        await test_db.commit()
        await test_db.refresh(job)

        monkeypatch.setattr(
            cv_worker.analyzer_client,
            "analyze_text",
            AsyncMock(side_effect=RuntimeError("analyzer down")),
        )

        await cv_worker.run_cv_generation(
            session_factory, job.id, test_user.id, "CV", VALID_OFFER
        )

        async with session_factory() as check:
            refreshed = await check.get(CVJob, job.id)
            assert refreshed.status == JobStatus.FAILED
            assert refreshed.error_message is not None
            # The raw exception text must NOT leak into the client-facing message.
            assert "analyzer down" not in refreshed.error_message

    async def test_worker_missing_profile_marks_job_failed_safely(
        self, session_factory, test_db, monkeypatch
    ):
        """A user without a profile: job fails with a safe, non-leaking message."""
        from app.models.user import User, UserRole
        from app.services import cv_worker
        from app.services.auth import hash_password

        # A bare user with NO profile.
        user = User(
            email="noprofile@example.com",
            hashed_password=hash_password("Pw123456!"),
            role=UserRole.USER,
        )
        test_db.add(user)
        await test_db.flush()
        job = CVJob(user_id=user.id, cv_name="CV", status=JobStatus.QUEUED)
        test_db.add(job)
        await test_db.commit()
        await test_db.refresh(job)
        uid = user.id

        await cv_worker.run_cv_generation(
            session_factory, job.id, uid, "CV", VALID_OFFER
        )

        async with session_factory() as check:
            refreshed = await check.get(CVJob, job.id)
            assert refreshed.status == JobStatus.FAILED
            assert "Profil utilisateur introuvable" in refreshed.error_message
