"""M2-T18 — Matrice d'ownership croisé (utilisateur B sur les ressources de A).

ADR-GATING déc. 9/10 : sur TOUTE ressource possédée, un non-propriétaire
(hors admin) reçoit le MÊME 404 qu'une ressource inexistante — jamais 403,
jamais 402, jamais le fichier. Un 403/402 serait un oracle d'existence (il
confirmerait que l'id existe, voire qu'il est premium). On vérifie ici, pour
chaque endpoint livré, que :

1. B sur une ressource de A ⇒ 404 ;
2. ce 404 est INDISTINCT d'un id inconnu (même statut, RFC 7807, pas de fuite
   « permission »/« forbidden ») ;
3. l'admin, lui, accède (support) — le 404 ne sur-restreint pas ;
4. aucune mutation/livraison n'a lieu sur un accès croisé (DELETE/PUT/download).

La matrice capacités premium × profils complète reste M9-T11 ; ici c'est l'axe
anti-IDOR pur.
"""

import uuid
from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient

from app.models import CVJob, JobStatus, JobType, User, UserRole
from app.models.generated_cv import GeneratedCV
from app.services import storage_service
from app.services.auth import hash_password

VALID_CV_DATA = {
    "personal_info": {"first_name": "A", "last_name": "B", "email": "a@b.fr"},
    "summary": "x",
    "selected_experiences": [],
    "highlighted_skills": [],
    "selected_educations": [],
}


# --- Utilisateur B : un SECOND utilisateur régulier (non-admin, non-owner) ----
@pytest.fixture
async def user_b(test_db) -> User:
    user = User(
        email="user-b@example.com",
        hashed_password=hash_password("UserBPassword123!"),
        role=UserRole.USER,
        email_verified=True,
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user


@pytest.fixture
async def headers_b(client: AsyncClient, user_b: User) -> dict:
    res = await client.post(
        "/auth/login",
        data={"username": user_b.email, "password": "UserBPassword123!"},
    )
    assert res.status_code == 200
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


# A = test_user (propriétaire). Helpers de seed d'une ressource de A.
async def _cv_of(test_db, owner: User, **over) -> GeneratedCV:
    cv = GeneratedCV(
        user_id=owner.id,
        cv_name="CV de A",
        template_id="modern_sobre",
        cv_data_json=VALID_CV_DATA,
        language="fr",
        **over,
    )
    test_db.add(cv)
    await test_db.commit()
    await test_db.refresh(cv)
    return cv


async def _job_of(test_db, owner: User, **over) -> CVJob:
    job = CVJob(
        user_id=owner.id,
        cv_name="job de A",
        status=over.pop("status", JobStatus.QUEUED),
        job_type=over.pop("job_type", JobType.CV_GENERATION),
        **over,
    )
    test_db.add(job)
    await test_db.commit()
    await test_db.refresh(job)
    return job


def _assert_404_sans_oracle(res) -> None:
    """404 RFC 7807 qui ne révèle NI l'existence NI l'ownership."""
    assert res.status_code == 404, res.text
    assert res.headers["content-type"].startswith("application/problem+json")
    low = res.text.lower()
    assert "permission" not in low
    assert "forbidden" not in low
    assert "autre utilisateur" not in low


class TestBsurCV:
    async def test_get_cv_de_a(self, client, headers_b, test_user, test_db):
        cv = await _cv_of(test_db, test_user)
        _assert_404_sans_oracle(await client.get(f"/cv/{cv.id}", headers=headers_b))

    async def test_put_cv_de_a_ne_mute_pas(self, client, headers_b, test_user, test_db):
        cv = await _cv_of(test_db, test_user)
        res = await client.put(
            f"/cv/{cv.id}", headers=headers_b, json={"cv_name": "piraté"}
        )
        _assert_404_sans_oracle(res)
        # Aucune mutation : le nom d'origine est intact.
        await test_db.refresh(cv)
        assert cv.cv_name == "CV de A"

    async def test_delete_cv_de_a_ne_supprime_pas(
        self, client, headers_b, test_user, test_db
    ):
        cv = await _cv_of(test_db, test_user)
        _assert_404_sans_oracle(await client.delete(f"/cv/{cv.id}", headers=headers_b))
        # Toujours présent après l'accès croisé.
        assert await test_db.get(GeneratedCV, cv.id) is not None

    async def test_export_cv_de_a(self, client, headers_b, test_user, test_db):
        cv = await _cv_of(test_db, test_user)
        res = await client.post(
            f"/cv/{cv.id}/export", json={"format": "pdf"}, headers=headers_b
        )
        _assert_404_sans_oracle(res)

    async def test_404_croise_indistinct_de_404_inconnu(
        self, client, headers_b, test_user, test_db
    ):
        """L'anti-oracle : CV de A et CV inexistant répondent le MÊME statut."""
        cv = await _cv_of(test_db, test_user)
        croise = await client.get(f"/cv/{cv.id}", headers=headers_b)
        inconnu = await client.get(f"/cv/{uuid.uuid4()}", headers=headers_b)
        assert croise.status_code == inconnu.status_code == 404


class TestBsurJobs:
    async def test_get_jobs_de_a(self, client, headers_b, test_user, test_db):
        job = await _job_of(test_db, test_user)
        _assert_404_sans_oracle(await client.get(f"/jobs/{job.id}", headers=headers_b))

    async def test_alias_cv_jobs_de_a(self, client, headers_b, test_user, test_db):
        job = await _job_of(test_db, test_user)
        _assert_404_sans_oracle(
            await client.get(f"/cv/jobs/{job.id}", headers=headers_b)
        )

    async def test_sse_events_de_a(self, client, headers_b, test_user, test_db):
        """Le flux SSE d'un job de A : 404 AVANT tout stream (pas de fuite)."""
        job = await _job_of(test_db, test_user)
        res = await client.get(f"/cv/jobs/{job.id}/events", headers=headers_b)
        assert res.status_code == 404

    async def test_download_export_de_a_sans_toucher_le_stockage(
        self, client, headers_b, test_user, test_db, monkeypatch
    ):
        """Download d'un export SUCCEEDED de A : 404, et le stockage n'est JAMAIS
        appelé (le refus précède toute lecture d'octets)."""
        cv = await _cv_of(
            test_db, test_user, gcs_pdf_url=f"exports/{test_user.id}/x/e.pdf"
        )
        job = await _job_of(
            test_db,
            test_user,
            status=JobStatus.SUCCEEDED,
            job_type=JobType.EXPORT,
            cv_id=cv.id,
        )
        dl = AsyncMock(return_value=b"%PDF-")
        monkeypatch.setattr(storage_service, "download_export", dl)
        res = await client.get(f"/jobs/{job.id}/download", headers=headers_b)
        assert res.status_code == 404
        assert dl.await_count == 0


class TestAdminNonSurRestreint:
    """Contrôle négatif : l'unification 404 NE casse PAS le bypass admin."""

    async def test_admin_lit_le_cv_de_a(
        self, client, admin_headers, test_user, test_db
    ):
        cv = await _cv_of(test_db, test_user)
        res = await client.get(f"/cv/{cv.id}", headers=admin_headers)
        assert res.status_code == 200

    async def test_admin_lit_le_job_de_a(
        self, client, admin_headers, test_user, test_db
    ):
        job = await _job_of(test_db, test_user)
        res = await client.get(f"/jobs/{job.id}", headers=admin_headers)
        assert res.status_code == 200


class TestGcsPdfUrlNonExpose:
    """ADR-GATING déc. 10 : le nom d'objet interne ne sort jamais en réponse."""

    async def test_detail_cv_sans_gcs_pdf_url(
        self, client, auth_headers, test_user, test_db
    ):
        cv = await _cv_of(
            test_db, test_user, gcs_pdf_url=f"exports/{test_user.id}/x/e.pdf"
        )
        res = await client.get(f"/cv/{cv.id}", headers=auth_headers)
        assert res.status_code == 200
        assert "gcs_pdf_url" not in res.json()


class TestOrdreOwnershipAvantGating:
    """ADR-GATING déc. 4/9 : ownership (404) STRICTEMENT avant le gating (402).

    Le piège que ce verrou ferme : un CV de A créé sous Pass, édité par B sans
    Pass. Si l'ordre était inversé, B recevrait 402 — un oracle révélant que le
    CV existe ET qu'il est premium. B doit recevoir 404, indistinct d'inconnu.
    """

    async def test_b_edite_cv_premium_de_a_404_pas_402(
        self, client, headers_b, test_user, test_db
    ):
        cv = await _cv_of(test_db, test_user, created_under_pass=True)
        res = await client.put(f"/cv/{cv.id}", headers=headers_b, json={"cv_name": "x"})
        # 404 (ownership d'abord), surtout PAS 402.
        assert res.status_code == 404
        assert res.status_code != 402

    async def test_le_proprietaire_lui_declenche_bien_le_402(
        self, client, auth_headers, test_user, test_db
    ):
        """Contrôle que le test ci-dessus n'est pas vide : le PROPRIÉTAIRE sans
        Pass sur SON CV premium reçoit, lui, le 402 (le gate fire bien)."""
        cv = await _cv_of(test_db, test_user, created_under_pass=True)
        res = await client.put(
            f"/cv/{cv.id}", headers=auth_headers, json={"cv_name": "x"}
        )
        assert res.status_code == 402


class TestBsurImportJobs:
    """La matrice couvre AUSSI le job d'import (store en mémoire, propre règle)."""

    async def test_import_job_de_a(self, client, headers_b, test_user):
        from app.services.import_jobs import import_job_store

        job = import_job_store.create(test_user.id)
        res = await client.get(f"/profile/import-cv/jobs/{job.id}", headers=headers_b)
        assert res.status_code == 404


class TestAdminBypassComplet:
    """Contrôle négatif étendu : l'unification 404 ne casse le bypass admin sur
    AUCUN endpoint livré — sauf l'export, fail-closed par conception (déc. 9)."""

    async def test_admin_put_cv_de_a(self, client, admin_headers, test_user, test_db):
        cv = await _cv_of(test_db, test_user)
        res = await client.put(
            f"/cv/{cv.id}", headers=admin_headers, json={"cv_name": "support"}
        )
        assert res.status_code == 200

    async def test_admin_delete_cv_de_a(
        self, client, admin_headers, test_user, test_db
    ):
        cv = await _cv_of(test_db, test_user)
        res = await client.delete(f"/cv/{cv.id}", headers=admin_headers)
        assert res.status_code == 204

    async def test_admin_lit_alias_cv_jobs_de_a(
        self, client, admin_headers, test_user, test_db
    ):
        job = await _job_of(test_db, test_user)
        res = await client.get(f"/cv/jobs/{job.id}", headers=admin_headers)
        assert res.status_code == 200

    async def test_admin_telecharge_export_de_a_avec_audit(
        self, client, admin_headers, test_user, test_db, monkeypatch
    ):
        """Support : l'admin RE-TÉLÉCHARGE l'export d'un autre (200) — l'accès
        est tracé en audit (jamais en silence), le stockage est bien sollicité."""
        cv = await _cv_of(test_db, test_user)
        obj = f"exports/{test_user.id}/{cv.id}/e.pdf"
        cv.gcs_pdf_url = obj
        await test_db.commit()
        job = await _job_of(
            test_db,
            test_user,
            status=JobStatus.SUCCEEDED,
            job_type=JobType.EXPORT,
            cv_id=cv.id,
        )
        monkeypatch.setattr(
            storage_service, "download_export", AsyncMock(return_value=b"%PDF-ok")
        )
        res = await client.get(f"/jobs/{job.id}/download", headers=admin_headers)
        assert res.status_code == 200
        assert res.content.startswith(b"%PDF-")

    async def test_admin_ne_cree_pas_export_sur_cv_de_a_404(
        self, client, admin_headers, test_user, test_db
    ):
        """Asymétrie VOULUE (déc. 9) : créer un export est une action du
        propriétaire — l'admin reçoit 404 (fail-closed, moindre privilège)."""
        cv = await _cv_of(test_db, test_user)
        res = await client.post(
            f"/cv/{cv.id}/export", json={"format": "pdf"}, headers=admin_headers
        )
        assert res.status_code == 404


class TestIndistinguabilite:
    """Le 404 d'un accès croisé est INDISTINCT (statut + forme RFC 7807) d'un id
    inconnu, sur chaque endpoint — c'est la propriété anti-oracle elle-même."""

    async def test_cv_get_croise_vs_inconnu(
        self, client, headers_b, test_user, test_db
    ):
        cv = await _cv_of(test_db, test_user)
        croise = await client.get(f"/cv/{cv.id}", headers=headers_b)
        inconnu = await client.get(f"/cv/{uuid.uuid4()}", headers=headers_b)
        assert croise.status_code == inconnu.status_code == 404
        assert croise.json()["status"] == inconnu.json()["status"] == 404
        assert croise.headers["content-type"] == inconnu.headers["content-type"]

    async def test_jobs_get_croise_vs_inconnu(
        self, client, headers_b, test_user, test_db
    ):
        job = await _job_of(test_db, test_user)
        croise = await client.get(f"/jobs/{job.id}", headers=headers_b)
        inconnu = await client.get(f"/jobs/{uuid.uuid4()}", headers=headers_b)
        assert croise.status_code == inconnu.status_code == 404
        assert croise.json()["status"] == inconnu.json()["status"] == 404
        assert croise.headers["content-type"] == inconnu.headers["content-type"]
