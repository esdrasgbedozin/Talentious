"""
M5-T09/T10/T16 — Endpoint POST /cv/{cv_id}/ats-score.

Cable moteur deterministe + analyse d'offre (cache) + persistance. Verifie :
ownership (404 anti-IDOR), « exactement un de offer_text/job_offer_id » (422),
502 si l'agent tombe, troncature du detail sans Pass (T10), cache (l'agent
n'est appele qu'au miss, T16), et reutilisation par job_offer_id.
"""

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status

from app.models import AtsScore, CareerPass, GeneratedCV, JobOffer, PassType
from app.services.analyzer_client import AnalysisResult, analyzer_client
from app.services.job_offers import normalize_offer_text, offer_text_hash


async def _make_cv(db, user, summary="Python backend engineer"):
    cv = GeneratedCV(
        user_id=user.id,
        cv_name="CV de test",
        template_id="modern_sobre",
        cv_data_json={"summary": summary},
    )
    db.add(cv)
    await db.flush()
    return cv


_KEYWORDS = [
    {
        "name": "Python",
        "category": "hard_skill",
        "importance": "Critical",
        "aliases": [],
    },
    {"name": "Rust", "category": "hard_skill", "importance": "Critical", "aliases": []},
]


def _fake_analyzer(keywords=None, calls=None):
    async def _call(text):
        if calls is not None:
            calls.append(text)
        return AnalysisResult(
            hard_skills=[],
            soft_skills=[],
            seniority_level="Senior",
            key_responsibilities=[],
            tone="neutre",
            keywords=keywords if keywords is not None else _KEYWORDS,
        )

    return _call


class TestAtsScoreEndpoint:
    async def test_offer_text_admin_detail_complet(
        self, client, admin_headers, admin_user, test_db, monkeypatch
    ):
        cv = await _make_cv(test_db, admin_user)
        monkeypatch.setattr(analyzer_client, "analyze_text", _fake_analyzer())
        r = await client.post(
            f"/cv/{cv.id}/ats-score",
            json={"offer_text": "o" * 60},
            headers=admin_headers,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["score"] == 50  # 1 hard-Critical matche sur 2
        assert body["detail_truncated"] is False
        assert [k["name"] for k in body["matched_keywords"]] == ["Python"]
        assert [k["name"] for k in body["missing_keywords"]] == ["Rust"]
        assert body["missing_keywords_count"] == 1
        assert body["cv_id"] == str(cv.id)
        # Persistance : une ligne ats_scores creee.
        row = (
            await test_db.execute(
                AtsScore.__table__.select().where(AtsScore.cv_variant_id == cv.id)
            )
        ).first()
        assert row is not None

    async def test_sans_pass_detail_tronque(
        self, client, auth_headers, test_user, test_db, monkeypatch
    ):
        cv = await _make_cv(test_db, test_user)
        monkeypatch.setattr(analyzer_client, "analyze_text", _fake_analyzer())
        r = await client.post(
            f"/cv/{cv.id}/ats-score",
            json={"offer_text": "o" * 60},
            headers=auth_headers,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["score"] == 50  # le SCORE reste complet
        assert body["detail_truncated"] is True
        assert body["matched_keywords"] == []
        assert body["missing_keywords"] == []
        assert body["missing_keywords_count"] == 1  # decompte conserve (teaser)

    async def test_exactement_un_champ_requis(
        self, client, auth_headers, test_user, test_db, monkeypatch
    ):
        cv = await _make_cv(test_db, test_user)
        monkeypatch.setattr(analyzer_client, "analyze_text", _fake_analyzer())
        # Les deux
        r = await client.post(
            f"/cv/{cv.id}/ats-score",
            json={"offer_text": "o" * 60, "job_offer_id": str(cv.id)},
            headers=auth_headers,
        )
        assert r.status_code == 422
        # Aucun
        r2 = await client.post(f"/cv/{cv.id}/ats-score", json={}, headers=auth_headers)
        assert r2.status_code == 422

    async def test_cv_non_possede_404(
        self, client, auth_headers, test_user, test_db, monkeypatch
    ):
        import uuid

        monkeypatch.setattr(analyzer_client, "analyze_text", _fake_analyzer())
        r = await client.post(
            f"/cv/{uuid.uuid4()}/ats-score",
            json={"offer_text": "o" * 60},
            headers=auth_headers,
        )
        assert r.status_code == 404

    async def test_job_offer_id_inconnu_404(
        self, client, auth_headers, test_user, test_db, monkeypatch
    ):
        import uuid

        cv = await _make_cv(test_db, test_user)
        monkeypatch.setattr(analyzer_client, "analyze_text", _fake_analyzer())
        r = await client.post(
            f"/cv/{cv.id}/ats-score",
            json={"job_offer_id": str(uuid.uuid4())},
            headers=auth_headers,
        )
        assert r.status_code == 404

    async def test_agent_en_panne_502(
        self, client, admin_headers, admin_user, test_db, monkeypatch
    ):
        cv = await _make_cv(test_db, admin_user)

        async def _boom(text):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="down"
            )

        monkeypatch.setattr(analyzer_client, "analyze_text", _boom)
        r = await client.post(
            f"/cv/{cv.id}/ats-score",
            json={"offer_text": "o" * 60},
            headers=admin_headers,
        )
        assert r.status_code == 502

    async def test_cache_et_reutilisation_par_job_offer_id(
        self, client, admin_headers, admin_user, test_db, monkeypatch
    ):
        cv = await _make_cv(test_db, admin_user)
        calls: list[str] = []
        monkeypatch.setattr(
            analyzer_client, "analyze_text", _fake_analyzer(calls=calls)
        )
        # 1er appel : offre creee + analysee (agent appele une fois).
        r1 = await client.post(
            f"/cv/{cv.id}/ats-score",
            json={"offer_text": "o" * 60},
            headers=admin_headers,
        )
        assert r1.status_code == 200
        offer_id = r1.json()["job_offer_id"]
        assert len(calls) == 1
        # 2e appel par job_offer_id : analyse en cache, agent PAS rappele (T16).
        r2 = await client.post(
            f"/cv/{cv.id}/ats-score",
            json={"job_offer_id": offer_id},
            headers=admin_headers,
        )
        assert r2.status_code == 200
        assert r2.json()["job_offer_id"] == offer_id
        assert len(calls) == 1  # toujours un seul appel reel a l'agent


async def _give_active_pass(db, user, *, days=10):
    db.add(
        CareerPass(
            user_id=user.id,
            pass_type=PassType.PASS_30_DAYS,
            valid_until=datetime.now(timezone.utc) + timedelta(days=days),
        )
    )
    await db.flush()


class TestAtsScoreEndpointMore:
    async def test_cache_hit_sur_offer_text(
        self, client, admin_headers, admin_user, test_db, monkeypatch
    ):
        # Invariant FinOps (T16) de bout en bout : coller DEUX fois le meme texte
        # n'appelle l'agent qu'une fois, et renvoie la meme offre.
        cv = await _make_cv(test_db, admin_user)
        calls: list[str] = []
        monkeypatch.setattr(
            analyzer_client, "analyze_text", _fake_analyzer(calls=calls)
        )
        payload = {"offer_text": "Ingenieur backend Python " + "x" * 40}
        r1 = await client.post(
            f"/cv/{cv.id}/ats-score", json=payload, headers=admin_headers
        )
        r2 = await client.post(
            f"/cv/{cv.id}/ats-score", json=payload, headers=admin_headers
        )
        assert r1.status_code == 200 and r2.status_code == 200
        assert len(calls) == 1  # un seul appel reel a l'agent
        assert r1.json()["job_offer_id"] == r2.json()["job_offer_id"]

    async def test_pass_actif_detail_complet(
        self, client, auth_headers, test_user, test_db, monkeypatch
    ):
        cv = await _make_cv(test_db, test_user)
        await _give_active_pass(test_db, test_user)
        monkeypatch.setattr(analyzer_client, "analyze_text", _fake_analyzer())
        r = await client.post(
            f"/cv/{cv.id}/ats-score",
            json={"offer_text": "o" * 60},
            headers=auth_headers,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["detail_truncated"] is False
        assert [k["name"] for k in body["matched_keywords"]] == ["Python"]

    async def test_pass_expire_detail_tronque(
        self, client, auth_headers, test_user, test_db, monkeypatch
    ):
        cv = await _make_cv(test_db, test_user)
        await _give_active_pass(test_db, test_user, days=-1)  # expire
        monkeypatch.setattr(analyzer_client, "analyze_text", _fake_analyzer())
        r = await client.post(
            f"/cv/{cv.id}/ats-score",
            json={"offer_text": "o" * 60},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["detail_truncated"] is True

    async def test_zero_motcle_score_zero(
        self, client, admin_headers, admin_user, test_db, monkeypatch
    ):
        cv = await _make_cv(test_db, admin_user)
        monkeypatch.setattr(
            analyzer_client, "analyze_text", _fake_analyzer(keywords=[])
        )
        r = await client.post(
            f"/cv/{cv.id}/ats-score",
            json={"offer_text": "o" * 60},
            headers=admin_headers,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["score"] == 0
        assert body["missing_keywords_count"] == 0

    async def test_cache_corrompu_ignore_sans_500(
        self, client, admin_headers, admin_user, test_db, monkeypatch
    ):
        # Offre pre-analysee avec un keyword CORROMPU (categorie hors enum) + un
        # valide : l'entree invalide est ignoree, pas de 500.
        cv = await _make_cv(test_db, admin_user, summary="Python backend")
        text = "Offre pre-analysee " + "y" * 40
        offer = JobOffer(
            user_id=admin_user.id,
            raw_text=text,
            text_hash=offer_text_hash(normalize_offer_text(text)),
            analysis_json={
                "keywords": [
                    {"name": "X", "category": "categorie_invalide"},
                    {
                        "name": "Python",
                        "category": "hard_skill",
                        "importance": "Critical",
                        "aliases": [],
                    },
                ]
            },
        )
        test_db.add(offer)
        await test_db.flush()
        r = await client.post(
            f"/cv/{cv.id}/ats-score",
            json={"job_offer_id": str(offer.id)},
            headers=admin_headers,
        )
        assert r.status_code == 200
        assert [k["name"] for k in r.json()["matched_keywords"]] == ["Python"]

    async def test_upsert_idempotent_et_recalcul(
        self, client, admin_headers, admin_user, test_db, monkeypatch
    ):
        cv = await _make_cv(test_db, admin_user, summary="Python backend")
        monkeypatch.setattr(analyzer_client, "analyze_text", _fake_analyzer())
        payload = {"offer_text": "o" * 60}
        r1 = await client.post(
            f"/cv/{cv.id}/ats-score", json=payload, headers=admin_headers
        )
        assert r1.json()["score"] == 50  # Python matche, Rust non

        # Le CV gagne « Rust » : recalcul attendu a 100, TOUJOURS une seule ligne.
        cv.cv_data_json = {"summary": "Python Rust expert"}
        test_db.add(cv)
        await test_db.flush()
        r2 = await client.post(
            f"/cv/{cv.id}/ats-score", json=payload, headers=admin_headers
        )
        assert r2.json()["score"] == 100

        rows = (
            await test_db.execute(
                AtsScore.__table__.select().where(AtsScore.cv_variant_id == cv.id)
            )
        ).fetchall()
        assert len(rows) == 1  # upsert : pas de doublon
        assert rows[0].score == 100

    async def test_admin_ne_score_pas_le_cv_dautrui_404(
        self, client, admin_headers, admin_user, test_user, test_db, monkeypatch
    ):
        # Fail-closed : meme un admin ne peut pas ECRIRE un score sur le CV d'un
        # autre utilisateur (contrairement au bypass lecture de get_owned_cv).
        cv_autrui = await _make_cv(test_db, test_user)
        monkeypatch.setattr(analyzer_client, "analyze_text", _fake_analyzer())
        r = await client.post(
            f"/cv/{cv_autrui.id}/ats-score",
            json={"offer_text": "o" * 60},
            headers=admin_headers,
        )
        assert r.status_code == 404

    async def test_sans_auth_401(self, client, test_db):
        import uuid

        r = await client.post(
            f"/cv/{uuid.uuid4()}/ats-score", json={"offer_text": "o" * 60}
        )
        assert r.status_code == 401
