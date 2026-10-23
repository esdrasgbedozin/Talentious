"""
M1-T12 — `POST /cv/generate` : enveloppe optionnelle + 402 TYPÉS.

Critère du ticket : la requête V1 nue (cv_name + offer_text) reste valide ;
les refus premium portent le TYPE RFC 7807 exact du contrat
(`premium-template-required`, `premium-theme-required`,
`premium-language-required`, `variant-limit-reached`).

Changement de modèle d'accès ASSUMÉ (Bible §4.3, contrat) : la génération
devient FREEMIUM — le « Pass obligatoire » V1 est remplacé par le gating
entitlements (1 variante gratuite, capacités premium typées). `en` est
désactivé par drapeau serveur jusqu'à M7-T11 (R6 : 422 explicite, même avec
Pass).

Ordre des contrôles testé : existence (422) AVANT gating (402) — ADR-GATING
décision 6 ; le worker persiste l'enveloppe à M1-T13 (hors périmètre ici).
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

from sqlalchemy import select, text

from app.models import CVTemplate, CVTheme
from app.models.career_pass import CareerPass, PassType
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


def _body(**extra) -> dict:
    return {"cv_name": "CV test", "offer_text": VALID_OFFER, **extra}


async def _grant_pass(test_db, user, *, active: bool) -> None:
    now = datetime.now(timezone.utc)
    delta = timedelta(days=10) if active else -timedelta(days=1)
    test_db.add(
        CareerPass(
            user_id=user.id,
            pass_type=PassType.PASS_30_DAYS,
            valid_until=now + delta,
        )
    )
    await test_db.commit()


async def _seed_premium_template(test_db) -> None:
    test_db.add(
        CVTemplate(
            id="corporate_strict",
            name="Corporate strict",
            sector="corporate",
            is_free=False,
            description="Mise en page corporate.",
            preview_url="https://talentious.app/templates/corporate_strict.png",
            default_theme_id=None,
        )
    )
    await test_db.commit()


class TestRequeteV1Freemium:
    async def test_requete_v1_nue_user_gratuit_202(
        self, client, auth_headers, monkeypatch
    ):
        """La requête V1 reste valide, et la génération devient FREEMIUM :
        la première variante d'un user sans Pass part en 202 (Bible §4.3 —
        remplace le « Pass obligatoire » V1)."""
        monkeypatch.setattr("app.routes.cv.run_cv_generation", AsyncMock())
        response = await client.post("/cv/generate", headers=auth_headers, json=_body())
        assert response.status_code == 202
        assert response.json()["status"] == "queued"

    async def test_la_2e_variante_gratuite_est_refusee_typee(
        self, client, auth_headers, test_db, test_user, monkeypatch
    ):
        """Quota par COUNT : une Variante existe déjà => 402
        `variant-limit-reached` (la gratuité en autorise UNE)."""
        from app.models import GeneratedCV

        monkeypatch.setattr("app.routes.cv.run_cv_generation", AsyncMock())
        test_db.add(
            GeneratedCV(
                user_id=test_user.id,
                cv_name="existante",
                template_id="modern_sobre",
                cv_data_json={"summary": "x"},
            )
        )
        await test_db.commit()

        response = await client.post("/cv/generate", headers=auth_headers, json=_body())
        assert response.status_code == 402
        body = response.json()
        assert body["type"] == "https://talentious.fr/errors/variant-limit-reached"
        assert response.headers["content-type"].startswith("application/problem+json")


class Test402Types:
    async def test_template_premium_sans_pass(
        self, client, auth_headers, test_db, monkeypatch
    ):
        monkeypatch.setattr("app.routes.cv.run_cv_generation", AsyncMock())
        await _seed_premium_template(test_db)
        response = await client.post(
            "/cv/generate",
            headers=auth_headers,
            json=_body(template_id="corporate_strict"),
        )
        assert response.status_code == 402
        assert (
            response.json()["type"]
            == "https://talentious.fr/errors/premium-template-required"
        )

    async def test_theme_custom_sans_pass(self, client, auth_headers, monkeypatch):
        """Thème sans provenance (id null) = personnalisé = premium."""
        monkeypatch.setattr("app.routes.cv.run_cv_generation", AsyncMock())
        response = await client.post(
            "/cv/generate",
            headers=auth_headers,
            json=_body(theme={"id": None, "name": "Le mien", "tokens": _CUSTOM_TOKENS}),
        )
        assert response.status_code == 402
        assert (
            response.json()["type"]
            == "https://talentious.fr/errors/premium-theme-required"
        )

    async def test_preset_modifie_est_premium(self, client, auth_headers, monkeypatch):
        """Contrat : un thème dont les tokens DIFFÈRENT du preset désigné par
        id est un thème personnalisé (premium)."""
        monkeypatch.setattr("app.routes.cv.run_cv_generation", AsyncMock())
        response = await client.post(
            "/cv/generate",
            headers=auth_headers,
            json=_body(
                theme={
                    "id": "anthracite",
                    "name": "Anthracite",
                    "tokens": _CUSTOM_TOKENS,
                }
            ),
        )
        assert response.status_code == 402
        assert (
            response.json()["type"]
            == "https://talentious.fr/errors/premium-theme-required"
        )

    async def test_preset_gratuit_tel_quel_passe_sans_pass(
        self, client, auth_headers, monkeypatch
    ):
        monkeypatch.setattr("app.routes.cv.run_cv_generation", AsyncMock())
        response = await client.post(
            "/cv/generate",
            headers=auth_headers,
            json=_body(
                theme={
                    "id": "anthracite",
                    "name": "Anthracite",
                    "tokens": _ANTHRACITE_TOKENS,
                }
            ),
        )
        assert response.status_code == 202

    async def test_tous_les_presets_gratuits_du_registre_passent(
        self, client, auth_headers, test_db, monkeypatch
    ):
        """Revue pt 5 : chaque preset GRATUIT du registre, envoyé tel quel
        (tokens RELUS EN BASE, pas une constante de test), passe en 202 — un
        preset seedé avec une clé en trop/en moins ne serait jamais « égal »
        et deviendrait 402 pour tout le monde : ce test casserait."""
        monkeypatch.setattr("app.routes.cv.run_cv_generation", AsyncMock())
        presets = (
            (await test_db.execute(select(CVTheme).where(CVTheme.is_free.is_(True))))
            .scalars()
            .all()
        )
        assert presets, "aucun preset gratuit seedé"
        for preset in presets:
            response = await client.post(
                "/cv/generate",
                headers=auth_headers,
                json=_body(
                    cv_name=f"via {preset.id}",
                    theme={
                        "id": preset.id,
                        "name": preset.name,
                        "tokens": preset.tokens,
                    },
                ),
            )
            assert response.status_code == 202, preset.id
            # Libère le slot « un job actif » pour le preset suivant.
            await test_db.execute(text("UPDATE cv_jobs SET status = 'failed'"))
            await test_db.commit()

    async def test_langue_en_sans_pass(self, client, auth_headers, monkeypatch):
        monkeypatch.setattr("app.routes.cv.run_cv_generation", AsyncMock())
        response = await client.post(
            "/cv/generate",
            headers=auth_headers,
            json=_body(target_language="en"),
        )
        assert response.status_code == 402
        assert (
            response.json()["type"]
            == "https://talentious.fr/errors/premium-language-required"
        )


class Test422Existence:
    async def test_template_inconnu(self, client, auth_headers, monkeypatch):
        """Existence AVANT gating (ADR-GATING déc. 6) : un id hors registre
        est un 422, jamais un 402 trompeur."""
        monkeypatch.setattr("app.routes.cv.run_cv_generation", AsyncMock())
        response = await client.post(
            "/cv/generate",
            headers=auth_headers,
            json=_body(template_id="fantome"),
        )
        assert response.status_code == 422

    async def test_preset_inconnu(self, client, auth_headers, monkeypatch):
        monkeypatch.setattr("app.routes.cv.run_cv_generation", AsyncMock())
        response = await client.post(
            "/cv/generate",
            headers=auth_headers,
            json=_body(
                theme={"id": "fantome", "name": "X", "tokens": _ANTHRACITE_TOKENS}
            ),
        )
        assert response.status_code == 422

    async def test_theme_illisible_422(self, client, auth_headers, monkeypatch):
        """La validation serveur du thème (M1-T09) est branchée : contraste
        insuffisant => 422, avant tout gating."""
        monkeypatch.setattr("app.routes.cv.run_cv_generation", AsyncMock())
        illisible = dict(_CUSTOM_TOKENS, color_text="#CCCCCC")
        response = await client.post(
            "/cv/generate",
            headers=auth_headers,
            json=_body(theme={"id": None, "name": "Pâle", "tokens": illisible}),
        )
        assert response.status_code == 422
        assert "contraste" in response.json()["detail"]

    async def test_langue_en_avec_pass_drapeau_r6(
        self, client, auth_headers, test_db, test_user, monkeypatch
    ):
        """R6 : `en` est au contrat mais pas implémenté — drapeau serveur =>
        422 EXPLICITE même avec Pass actif (jamais un échec sale en aval)."""
        monkeypatch.setattr("app.routes.cv.run_cv_generation", AsyncMock())
        await _grant_pass(test_db, test_user, active=True)
        response = await client.post(
            "/cv/generate",
            headers=auth_headers,
            json=_body(target_language="en"),
        )
        assert response.status_code == 422
        assert "désactiv" in response.json()["detail"]


class TestFreinDeCout:
    async def test_le_plafond_journalier_frappe_les_non_pass(
        self, client, auth_headers, test_db, test_user, monkeypatch
    ):
        """Revue sécu pt 1 : le quota de variantes est un quota de STOCK —
        générer/supprimer/regénérer le contournerait. Le plafond compte les
        LANCEMENTS (jobs) sur 24 h, insensible aux suppressions : au plafond,
        429 typé `generation-daily-cap`, aucun job créé."""
        from app.config import settings
        from app.models import CVJob, JobStatus, JobType

        monkeypatch.setattr("app.routes.cv.run_cv_generation", AsyncMock())
        # Historique du jour : N jobs FAILED (aucun CV produit → le quota de
        # stock ne voit rien, seul le plafond de lancements peut freiner).
        for i in range(settings.free_daily_generation_cap):
            test_db.add(
                CVJob(
                    user_id=test_user.id,
                    cv_name=f"essai {i}",
                    status=JobStatus.FAILED,
                    job_type=JobType.CV_GENERATION,
                )
            )
        await test_db.commit()

        response = await client.post("/cv/generate", headers=auth_headers, json=_body())
        assert response.status_code == 429
        body = response.json()
        assert body["type"] == "https://talentious.fr/errors/generation-daily-cap"
        assert response.headers["content-type"].startswith("application/problem+json")

    async def test_le_pass_actif_n_est_pas_plafonne(
        self, client, auth_headers, test_db, test_user, monkeypatch
    ):
        from app.config import settings
        from app.models import CVJob, JobStatus, JobType

        monkeypatch.setattr("app.routes.cv.run_cv_generation", AsyncMock())
        await _grant_pass(test_db, test_user, active=True)
        for i in range(settings.free_daily_generation_cap):
            test_db.add(
                CVJob(
                    user_id=test_user.id,
                    cv_name=f"essai {i}",
                    status=JobStatus.FAILED,
                    job_type=JobType.CV_GENERATION,
                )
            )
        await test_db.commit()

        response = await client.post("/cv/generate", headers=auth_headers, json=_body())
        assert response.status_code == 202


class TestOrdreDesControles:
    async def test_job_actif_409_avant_quota_402(
        self, client, auth_headers, test_db, test_user, monkeypatch
    ):
        """Revue sécu pt 2 : le contrôle « job actif » passe AVANT le COUNT
        du quota (ferme la fenêtre de course) — job actif + stock plein ⇒
        409, pas 402."""
        from app.models import CVJob, GeneratedCV, JobStatus, JobType

        monkeypatch.setattr("app.routes.cv.run_cv_generation", AsyncMock())
        test_db.add(
            GeneratedCV(
                user_id=test_user.id,
                cv_name="existante",
                template_id="modern_sobre",
                cv_data_json={"summary": "x"},
            )
        )
        test_db.add(
            CVJob(
                user_id=test_user.id,
                cv_name="en cours",
                status=JobStatus.RUNNING,
                job_type=JobType.CV_GENERATION,
            )
        )
        await test_db.commit()

        response = await client.post("/cv/generate", headers=auth_headers, json=_body())
        assert response.status_code == 409

    async def test_template_premium_prime_sur_theme_invalide(
        self, client, auth_headers, test_db, monkeypatch
    ):
        """Ordre documenté (revue pt 9) : les contrôles sont PAR RESSOURCE
        dans l'ordre template → thème — un template premium (402) répond
        avant la validation d'un thème illisible (422)."""
        monkeypatch.setattr("app.routes.cv.run_cv_generation", AsyncMock())
        await _seed_premium_template(test_db)
        illisible = dict(_CUSTOM_TOKENS, color_text="#CCCCCC")
        response = await client.post(
            "/cv/generate",
            headers=auth_headers,
            json=_body(
                template_id="corporate_strict",
                theme={"id": None, "name": "Pâle", "tokens": illisible},
            ),
        )
        assert response.status_code == 402
        assert (
            response.json()["type"]
            == "https://talentious.fr/errors/premium-template-required"
        )

    async def test_template_id_null_explicite_vaut_defaut(
        self, client, auth_headers, monkeypatch
    ):
        """Revue pt 8 : le contrat génère template_id nullable — un null
        explicite retombe sur le template gratuit par défaut (202)."""
        monkeypatch.setattr("app.routes.cv.run_cv_generation", AsyncMock())
        response = await client.post(
            "/cv/generate", headers=auth_headers, json=_body(template_id=None)
        )
        assert response.status_code == 202


class TestPassActif:
    async def test_pass_et_admin_ne_sont_pas_limites_en_stock(
        self, client, admin_headers, admin_user, test_db, monkeypatch
    ):
        """Revue pt 9 : variant-limit ne frappe jamais pass/admin, même avec
        du stock existant."""
        from app.models import GeneratedCV

        monkeypatch.setattr("app.routes.cv.run_cv_generation", AsyncMock())
        for i in range(3):
            test_db.add(
                GeneratedCV(
                    user_id=admin_user.id,
                    cv_name=f"stock {i}",
                    template_id="modern_sobre",
                    cv_data_json={"summary": "x"},
                )
            )
        await test_db.commit()

        response = await client.post(
            "/cv/generate", headers=admin_headers, json=_body()
        )
        assert response.status_code == 202

    async def test_pass_actif_debloque_template_et_theme(
        self, client, auth_headers, test_db, test_user, monkeypatch
    ):
        monkeypatch.setattr("app.routes.cv.run_cv_generation", AsyncMock())
        await _seed_premium_template(test_db)
        await _grant_pass(test_db, test_user, active=True)
        response = await client.post(
            "/cv/generate",
            headers=auth_headers,
            json=_body(
                template_id="corporate_strict",
                theme={"id": None, "name": "Le mien", "tokens": _CUSTOM_TOKENS},
            ),
        )
        assert response.status_code == 202

    async def test_pass_expire_redevient_gratuit(
        self, client, auth_headers, test_db, test_user, monkeypatch
    ):
        """D1 : pass expiré = capacités gratuites pour le NEUF."""
        monkeypatch.setattr("app.routes.cv.run_cv_generation", AsyncMock())
        await _seed_premium_template(test_db)
        await _grant_pass(test_db, test_user, active=False)
        response = await client.post(
            "/cv/generate",
            headers=auth_headers,
            json=_body(template_id="corporate_strict"),
        )
        assert response.status_code == 402
        assert (
            response.json()["type"]
            == "https://talentious.fr/errors/premium-template-required"
        )
