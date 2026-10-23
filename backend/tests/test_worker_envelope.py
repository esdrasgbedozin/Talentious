"""
M1-T13 — Le worker persiste l'enveloppe de la Variante.

Critère du ticket : le CV généré porte `theme_json` et `language`.

Les trois pièges tracés en roadmap sont couverts :
(a) thème custom ⇒ provenance NULL — l'ORM AVALE même un None explicite sur
    une colonne à server_default (découverte M1-T11) : le worker doit passer
    `sqlalchemy.null()`, prouvé ici en SQL direct ;
(b) l'isolation utilisateur des FK (`offer_id`/`parent_variant_id`) n'est pas
    concernée : le worker de génération n'écrit PAS ces liens (M4-T03) ;
(c) le ticket de contraction des server_default est à ouvrir après livraison.

Sémantique de `created_under_pass` (arbitrée du contrat `is_editable` :
« true si le Pass est actif ou si le document est ENTIÈREMENT GRATUIT ») :
le flag est VRAI si la génération a consommé une capacité premium (template
premium, thème custom/preset premium, langue EN) — PAS simplement si un Pass
était actif : un porteur de Pass qui génère un document 100 % gratuit garde
un document éditable à vie (esprit D1 anti-ressentiment).
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

from sqlalchemy import text

from app.models import CVJob, CVTemplate, JobStatus
from app.models.career_pass import CareerPass, PassType
from app.services import cv_worker
from app.models.generated_cv import DocumentLanguage
from app.services.cv_worker import CVEnvelope
from tests.test_cv_themes import _ANTHRACITE_TOKENS

VALID_OFFER = (
    "We are hiring a senior backend engineer with strong Python and FastAPI skills. "
    * 2
)

_CUSTOM_TOKENS = {
    "color_accent": "#2B6CB0",
    "color_text": "#1A202C",
    "color_muted": "#4A5568",
    "color_background": "#FFFFFF",
    "font_heading": "Lora",
    "font_body": "Source Sans 3",
}

_WRITER_OUTPUT = {
    "cv_data": {
        "personal_info": {
            "first_name": "Alice",
            "last_name": "Martin",
            "email": "alice.martin@example.com",
        },
        "summary": "optimized",
        "selected_experiences": [
            {
                "id": "exp-1",
                "title": "Ingénieure",
                "company": "Acme",
                "start_date": "2020-01",
                "description": "Backend",
                "highlighted_skills": ["Python"],
            }
        ],
        "highlighted_skills": [],
        "selected_educations": [],
    }
}


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


def _mock_agents(monkeypatch):
    monkeypatch.setattr(
        cv_worker.analyzer_client,
        "analyze_text",
        AsyncMock(return_value=_fake_analysis()),
    )
    monkeypatch.setattr(
        cv_worker.writer_client,
        "generate_cv",
        AsyncMock(return_value=_WRITER_OUTPUT),
    )


async def _run_job(session_factory, test_db, user, envelope) -> dict:
    job = CVJob(user_id=user.id, cv_name="CV", status=JobStatus.QUEUED)
    test_db.add(job)
    await test_db.commit()
    await test_db.refresh(job)

    await cv_worker.run_cv_generation(
        session_factory, job.id, user.id, "CV", VALID_OFFER, envelope
    )

    row = (
        await test_db.execute(
            text(
                "SELECT template_id, theme_json, theme_preset_id, language, "
                "created_under_pass FROM generated_cvs "
                "WHERE user_id = :uid ORDER BY created_at DESC LIMIT 1"
            ),
            {"uid": user.id},
        )
    ).fetchone()
    assert row is not None, "le worker n'a pas créé de CV"
    return {
        "template_id": row[0],
        "theme_json": row[1],
        "theme_preset_id": row[2],
        "language": row[3],
        "created_under_pass": row[4],
    }


class TestWorkerPersisteLEnveloppe:
    async def test_enveloppe_premium_custom_provenance_null(
        self, session_factory, test_db, test_user, monkeypatch
    ):
        """CRITÈRE + piège (a) : thème custom ⇒ theme_json porté TEL QUEL et
        provenance NULL en SQL direct — pas 'anthracite' par server_default
        (le worker passe sqlalchemy.null())."""
        _mock_agents(monkeypatch)
        test_db.add(
            CVTemplate(
                id="corporate_strict",
                name="Corporate strict",
                sector="corporate",
                is_free=False,
                description="Corporate.",
                preview_url="https://talentious.app/templates/corporate_strict.png",
                default_theme_id=None,
            )
        )
        await test_db.commit()

        row = await _run_job(
            session_factory,
            test_db,
            test_user,
            CVEnvelope(
                template_id="corporate_strict",
                theme_json=_CUSTOM_TOKENS,
                theme_preset_id=None,
                language=DocumentLanguage.EN,
                created_under_pass=True,
            ),
        )
        assert row["template_id"] == "corporate_strict"
        assert row["theme_json"] == _CUSTOM_TOKENS
        assert row["theme_preset_id"] is None  # piège (a) — null() forcé
        assert row["language"] == "en"
        assert row["created_under_pass"] is True

    async def test_enveloppe_gratuite_par_defaut(
        self, session_factory, test_db, test_user, monkeypatch
    ):
        _mock_agents(monkeypatch)
        row = await _run_job(
            session_factory,
            test_db,
            test_user,
            CVEnvelope(
                template_id="modern_sobre",
                theme_json=_ANTHRACITE_TOKENS,
                theme_preset_id="anthracite",
                language=DocumentLanguage.FR,
                created_under_pass=False,
            ),
        )
        assert row["template_id"] == "modern_sobre"
        assert row["theme_json"] == _ANTHRACITE_TOKENS
        assert row["theme_preset_id"] == "anthracite"
        assert row["language"] == "fr"
        assert row["created_under_pass"] is False


class TestRouteVersWorker:
    """Bout en bout : la route transmet l'enveloppe VALIDÉE au worker (le
    chaînon attendu par la revue M1-T12 pt 3) — agents mockés, worker RÉEL,
    BackgroundTasks exécutées par le cycle ASGI du client de test."""

    async def test_generation_premium_porte_son_enveloppe(
        self, client, auth_headers, test_db, test_user, monkeypatch
    ):
        _mock_agents(monkeypatch)
        test_db.add(
            CareerPass(
                user_id=test_user.id,
                pass_type=PassType.PASS_30_DAYS,
                valid_until=datetime.now(timezone.utc) + timedelta(days=10),
            )
        )
        await test_db.commit()

        response = await client.post(
            "/cv/generate",
            headers=auth_headers,
            json={
                "cv_name": "Premium",
                "offer_text": VALID_OFFER,
                "theme": {"id": None, "name": "Le mien", "tokens": _CUSTOM_TOKENS},
                "target_language": "fr",
            },
        )
        assert response.status_code == 202

        row = (
            await test_db.execute(
                text(
                    "SELECT theme_json, theme_preset_id, language, "
                    "created_under_pass FROM generated_cvs WHERE user_id = :uid"
                ),
                {"uid": test_user.id},
            )
        ).fetchone()
        assert row is not None, "le worker n'a pas tourné"
        assert row[0] == _CUSTOM_TOKENS
        assert row[1] is None  # custom ⇒ provenance NULL
        assert row[2] == "fr"
        assert row[3] is True  # capacité premium consommée (thème custom)

    async def test_preset_premium_tel_quel_garde_sa_provenance(
        self, client, auth_headers, test_db, test_user, monkeypatch
    ):
        """Revue pt 4 : un preset PREMIUM pris tel quel ⇒ provenance
        renseignée ET capacité consommée (created_under_pass=True)."""
        from app.models import CVTheme

        _mock_agents(monkeypatch)
        ardoise_tokens = dict(_CUSTOM_TOKENS)
        test_db.add(
            CVTheme(id="ardoise", name="Ardoise", tokens=ardoise_tokens, is_free=False)
        )
        test_db.add(
            CareerPass(
                user_id=test_user.id,
                pass_type=PassType.PASS_30_DAYS,
                valid_until=datetime.now(timezone.utc) + timedelta(days=10),
            )
        )
        await test_db.commit()

        response = await client.post(
            "/cv/generate",
            headers=auth_headers,
            json={
                "cv_name": "Ardoise",
                "offer_text": VALID_OFFER,
                "theme": {"id": "ardoise", "name": "Ardoise", "tokens": ardoise_tokens},
            },
        )
        assert response.status_code == 202
        row = (
            await test_db.execute(
                text(
                    "SELECT theme_preset_id, created_under_pass FROM generated_cvs "
                    "WHERE user_id = :uid"
                ),
                {"uid": test_user.id},
            )
        ).fetchone()
        assert row == ("ardoise", True)

    async def test_langue_en_drapeau_leve_est_persistee_et_flaguee(
        self, client, auth_headers, test_db, test_user, monkeypatch
    ):
        """Revue pt 4 : EN avec drapeau R6 levé (reste gratuit par ailleurs)
        ⇒ language='en' persistée, capacité consommée flaguée."""
        _mock_agents(monkeypatch)
        monkeypatch.setattr("app.routes.cv.settings.target_language_en_enabled", True)
        test_db.add(
            CareerPass(
                user_id=test_user.id,
                pass_type=PassType.PASS_30_DAYS,
                valid_until=datetime.now(timezone.utc) + timedelta(days=10),
            )
        )
        await test_db.commit()

        response = await client.post(
            "/cv/generate",
            headers=auth_headers,
            json={
                "cv_name": "EN",
                "offer_text": VALID_OFFER,
                "target_language": "en",
            },
        )
        assert response.status_code == 202
        row = (
            await test_db.execute(
                text(
                    "SELECT language, created_under_pass FROM generated_cvs "
                    "WHERE user_id = :uid"
                ),
                {"uid": test_user.id},
            )
        ).fetchone()
        assert row == ("en", True)

    async def test_admin_sans_pass_template_premium_flague(
        self, client, admin_headers, admin_user, test_db, monkeypatch
    ):
        """Revue pt 4 : l'admin n'est pas gaté mais la capacité premium est
        CONSOMMÉE — si le compte perd son rôle, le document se verrouille
        (comportement voulu)."""
        _mock_agents(monkeypatch)
        test_db.add(
            CVTemplate(
                id="corporate_strict",
                name="Corporate strict",
                sector="corporate",
                is_free=False,
                description="Corporate.",
                preview_url="https://talentious.app/templates/corporate_strict.png",
                default_theme_id=None,
            )
        )
        await test_db.commit()

        response = await client.post(
            "/cv/generate",
            headers=admin_headers,
            json={
                "cv_name": "Admin premium",
                "offer_text": VALID_OFFER,
                "template_id": "corporate_strict",
            },
        )
        assert response.status_code == 202
        row = (
            await test_db.execute(
                text(
                    "SELECT template_id, created_under_pass FROM generated_cvs "
                    "WHERE user_id = :uid"
                ),
                {"uid": admin_user.id},
            )
        ).fetchone()
        assert row == ("corporate_strict", True)

    async def test_defaut_premium_herite_jamais_servi_en_douce(
        self, client, auth_headers, test_db, test_user, monkeypatch
    ):
        """Revue pt 1 (trou LATENT fermé) : un template GRATUIT dont le
        preset par défaut est PREMIUM — l'utilisateur gratuit retombe sur
        anthracite (pas de 402 pour un défaut qu'il n'a pas demandé, pas de
        premium en douce) ; le porteur de Pass l'hérite, flagué."""
        from app.models import CVTheme

        _mock_agents(monkeypatch)
        test_db.add(
            CVTheme(
                id="ardoise", name="Ardoise", tokens=dict(_CUSTOM_TOKENS), is_free=False
            )
        )
        await test_db.commit()  # le preset AVANT le template (FK RESTRICT)
        test_db.add(
            CVTemplate(
                id="libre_chic",
                name="Libre chic",
                sector="modern",
                is_free=True,  # template GRATUIT…
                description="Gratuit au défaut premium.",
                preview_url="https://talentious.app/templates/libre_chic.png",
                default_theme_id="ardoise",  # …au défaut PREMIUM
            )
        )
        await test_db.commit()

        # Utilisateur GRATUIT : repli anthracite, rien de consommé.
        response = await client.post(
            "/cv/generate",
            headers=auth_headers,
            json={
                "cv_name": "Repli",
                "offer_text": VALID_OFFER,
                "template_id": "libre_chic",
            },
        )
        assert response.status_code == 202
        row = (
            await test_db.execute(
                text(
                    "SELECT theme_preset_id, theme_json, created_under_pass "
                    "FROM generated_cvs WHERE user_id = :uid"
                ),
                {"uid": test_user.id},
            )
        ).fetchone()
        assert row[0] == "anthracite"
        assert row[1] == _ANTHRACITE_TOKENS
        assert row[2] is False

        # Porteur de Pass : il hérite du défaut premium, flagué.
        test_db.add(
            CareerPass(
                user_id=test_user.id,
                pass_type=PassType.PASS_30_DAYS,
                valid_until=datetime.now(timezone.utc) + timedelta(days=10),
            )
        )
        await test_db.execute(text("DELETE FROM generated_cvs"))
        await test_db.execute(text("UPDATE cv_jobs SET status = 'failed'"))
        await test_db.commit()

        response = await client.post(
            "/cv/generate",
            headers=auth_headers,
            json={
                "cv_name": "Hérite",
                "offer_text": VALID_OFFER,
                "template_id": "libre_chic",
            },
        )
        assert response.status_code == 202
        row = (
            await test_db.execute(
                text(
                    "SELECT theme_preset_id, created_under_pass FROM generated_cvs "
                    "WHERE user_id = :uid"
                ),
                {"uid": test_user.id},
            )
        ).fetchone()
        assert row == ("ardoise", True)

    async def test_generation_v1_nue_recoit_le_defaut_du_template(
        self, client, auth_headers, test_db, test_user, monkeypatch
    ):
        """Requête V1 nue : le thème PAR DÉFAUT du template s'applique
        (contrat) — anthracite avec PROVENANCE, fr, document entièrement
        gratuit (éditable à vie, même généré par un porteur de Pass — D1)."""
        _mock_agents(monkeypatch)
        test_db.add(
            CareerPass(
                user_id=test_user.id,
                pass_type=PassType.PASS_30_DAYS,
                valid_until=datetime.now(timezone.utc) + timedelta(days=10),
            )
        )
        await test_db.commit()

        response = await client.post(
            "/cv/generate",
            headers=auth_headers,
            json={"cv_name": "V1", "offer_text": VALID_OFFER},
        )
        assert response.status_code == 202

        row = (
            await test_db.execute(
                text(
                    "SELECT template_id, theme_json, theme_preset_id, language, "
                    "created_under_pass FROM generated_cvs WHERE user_id = :uid"
                ),
                {"uid": test_user.id},
            )
        ).fetchone()
        assert row is not None
        assert row[0] == "modern_sobre"
        assert row[1] == _ANTHRACITE_TOKENS
        assert row[2] == "anthracite"  # provenance du preset par défaut
        assert row[3] == "fr"
        # Pass actif MAIS document entièrement gratuit ⇒ pas verrouillable.
        assert row[4] is False
