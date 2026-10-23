"""
M1-T14 — `PUT /cv/{id}` : édition d'enveloppe, contenu et enveloppe
INDÉPENDANTS, édition premium ⇒ 402 typés.

Critères du ticket : modifier l'un ne modifie jamais l'autre ; le renommage
d'un CV gratuit reste toujours possible (même Pass expiré — D1).

Exigence revue data M1-T13 (ADR-GATING déc. 8) : CLIQUET MONOTONE — une
édition qui INTRODUIT une capacité premium est gatée ET passe
`created_under_pass` à true, jamais l'inverse (sinon « créer gratuit puis
éditer premium » contourne le modèle).
"""

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import text

from app.models import CVTemplate, GeneratedCV
from app.models.career_pass import CareerPass, PassType
from tests.test_cv_themes import _ANTHRACITE_TOKENS

_CANONICAL_CV = json.loads(
    (
        Path(__file__).resolve().parents[2]
        / "fixtures"
        / "cv-reference"
        / "minimal.json"
    ).read_text(encoding="utf-8")
)

_CUSTOM_TOKENS = {
    "color_accent": "#2B6CB0",
    "color_text": "#1A202C",
    "color_muted": "#4A5568",
    "color_background": "#FFFFFF",
    "font_heading": "Lora",
    "font_body": "Source Sans 3",
}


async def _seed_cv(test_db, user, **overrides) -> GeneratedCV:
    cv = GeneratedCV(
        user_id=user.id,
        cv_name="Mon CV",
        template_id="modern_sobre",
        cv_data_json=_CANONICAL_CV,
        **overrides,
    )
    test_db.add(cv)
    await test_db.commit()
    await test_db.refresh(cv)
    return cv


async def _grant_pass(test_db, user, *, active: bool) -> None:
    delta = timedelta(days=10) if active else -timedelta(days=1)
    test_db.add(
        CareerPass(
            user_id=user.id,
            pass_type=PassType.PASS_30_DAYS,
            valid_until=datetime.now(timezone.utc) + delta,
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
            description="Corporate.",
            preview_url="https://talentious.app/templates/corporate_strict.png",
            default_theme_id=None,
        )
    )
    await test_db.commit()


async def _envelope_row(test_db, cv_id) -> dict:
    row = (
        await test_db.execute(
            text(
                "SELECT template_id, theme_json, theme_preset_id, language, "
                "created_under_pass, md5(cv_data_json::text) "
                "FROM generated_cvs WHERE id = :id"
            ),
            {"id": cv_id},
        )
    ).fetchone()
    return {
        "template_id": row[0],
        "theme_json": row[1],
        "theme_preset_id": row[2],
        "language": row[3],
        "created_under_pass": row[4],
        "content_md5": row[5],
    }


class TestContrat:
    async def test_corps_vide_422(self, client, auth_headers, test_db, test_user):
        cv = await _seed_cv(test_db, test_user)
        response = await client.put(f"/cv/{cv.id}", headers=auth_headers, json={})
        assert response.status_code == 422

    async def test_renommage_gratuit_toujours_possible_pass_expire(
        self, client, auth_headers, test_db, test_user
    ):
        """CRITÈRE : un CV gratuit se renomme même Pass expiré (D1)."""
        cv = await _seed_cv(test_db, test_user)
        await _grant_pass(test_db, test_user, active=False)
        response = await client.put(
            f"/cv/{cv.id}", headers=auth_headers, json={"cv_name": "Renommé"}
        )
        assert response.status_code == 200
        assert response.json()["cv_name"] == "Renommé"


class TestIndependance:
    async def test_changer_le_template_ne_touche_pas_le_contenu(
        self, client, auth_headers, test_db, test_user
    ):
        """CRITÈRE : enveloppe et contenu indépendants — checksum du contenu
        IDENTIQUE après changement de template, thème intact."""
        await _seed_premium_template(test_db)
        cv = await _seed_cv(test_db, test_user)
        before = await _envelope_row(test_db, cv.id)
        await _grant_pass(test_db, test_user, active=True)

        response = await client.put(
            f"/cv/{cv.id}",
            headers=auth_headers,
            json={"template_id": "corporate_strict"},
        )
        assert response.status_code == 200
        after = await _envelope_row(test_db, cv.id)
        assert after["template_id"] == "corporate_strict"
        assert after["content_md5"] == before["content_md5"]
        assert after["theme_json"] == before["theme_json"]
        assert after["language"] == before["language"]

    async def test_changer_le_contenu_ne_touche_pas_l_enveloppe(
        self, client, auth_headers, test_db, test_user
    ):
        cv = await _seed_cv(test_db, test_user)
        before = await _envelope_row(test_db, cv.id)
        nouveau = dict(_CANONICAL_CV, summary="Résumé réécrit.")

        response = await client.put(
            f"/cv/{cv.id}", headers=auth_headers, json={"cv_data_json": nouveau}
        )
        assert response.status_code == 200
        after = await _envelope_row(test_db, cv.id)
        assert after["content_md5"] != before["content_md5"]
        assert after["theme_json"] == before["theme_json"]
        assert after["template_id"] == before["template_id"]
        assert after["created_under_pass"] is False


class TestGatingTypes:
    async def test_template_premium_sans_pass_402(
        self, client, auth_headers, test_db, test_user
    ):
        await _seed_premium_template(test_db)
        cv = await _seed_cv(test_db, test_user)
        response = await client.put(
            f"/cv/{cv.id}",
            headers=auth_headers,
            json={"template_id": "corporate_strict"},
        )
        assert response.status_code == 402
        assert (
            response.json()["type"]
            == "https://talentious.fr/errors/premium-template-required"
        )
        # Rien n'a bougé.
        assert (await _envelope_row(test_db, cv.id))["template_id"] == "modern_sobre"

    async def test_theme_custom_sans_pass_402(
        self, client, auth_headers, test_db, test_user
    ):
        cv = await _seed_cv(test_db, test_user)
        response = await client.put(
            f"/cv/{cv.id}",
            headers=auth_headers,
            json={"theme": {"id": None, "name": "Le mien", "tokens": _CUSTOM_TOKENS}},
        )
        assert response.status_code == 402
        assert (
            response.json()["type"]
            == "https://talentious.fr/errors/premium-theme-required"
        )

    async def test_langue_en_sans_pass_402_et_drapeau_avec_pass(
        self, client, auth_headers, test_db, test_user
    ):
        cv = await _seed_cv(test_db, test_user)
        response = await client.put(
            f"/cv/{cv.id}", headers=auth_headers, json={"language": "en"}
        )
        assert response.status_code == 402
        assert (
            response.json()["type"]
            == "https://talentious.fr/errors/premium-language-required"
        )

        await _grant_pass(test_db, test_user, active=True)
        response = await client.put(
            f"/cv/{cv.id}", headers=auth_headers, json={"language": "en"}
        )
        assert response.status_code == 422  # drapeau R6

    async def test_template_inconnu_422_et_theme_illisible_422(
        self, client, auth_headers, test_db, test_user
    ):
        cv = await _seed_cv(test_db, test_user)
        response = await client.put(
            f"/cv/{cv.id}", headers=auth_headers, json={"template_id": "fantome"}
        )
        assert response.status_code == 422

        illisible = dict(_CUSTOM_TOKENS, color_text="#CCCCCC")
        response = await client.put(
            f"/cv/{cv.id}",
            headers=auth_headers,
            json={"theme": {"id": None, "name": "Pâle", "tokens": illisible}},
        )
        assert response.status_code == 422
        assert "contraste" in response.json()["detail"]

    async def test_preset_gratuit_tel_quel_reste_gratuit(
        self, client, auth_headers, test_db, test_user
    ):
        """Changer pour un preset GRATUIT tel quel : permis sans Pass, le
        document reste entièrement gratuit (pas de cliquet)."""
        cv = await _seed_cv(test_db, test_user)
        response = await client.put(
            f"/cv/{cv.id}",
            headers=auth_headers,
            json={
                "theme": {
                    "id": "anthracite",
                    "name": "Anthracite",
                    "tokens": _ANTHRACITE_TOKENS,
                }
            },
        )
        assert response.status_code == 200
        after = await _envelope_row(test_db, cv.id)
        assert after["theme_preset_id"] == "anthracite"
        assert after["created_under_pass"] is False


class TestCliquetMonotone:
    async def test_editer_en_premium_verrouille_le_document(
        self, client, auth_headers, test_db, test_user
    ):
        """ADR-GATING déc. 8 : introduire une capacité premium à l'édition
        passe created_under_pass à TRUE — provenance NULL posée AVEC les
        tokens (règle T05 (a), null() prouvé en SQL) — et le document se
        verrouille à l'expiration du Pass."""
        cv = await _seed_cv(test_db, test_user)
        await _grant_pass(test_db, test_user, active=True)

        response = await client.put(
            f"/cv/{cv.id}",
            headers=auth_headers,
            json={"theme": {"id": None, "name": "Le mien", "tokens": _CUSTOM_TOKENS}},
        )
        assert response.status_code == 200
        after = await _envelope_row(test_db, cv.id)
        assert after["theme_json"] == _CUSTOM_TOKENS
        assert after["theme_preset_id"] is None  # null() — jamais 'anthracite'
        assert after["created_under_pass"] is True
        assert response.json()["is_editable"] is True  # Pass encore actif

        # Pass expiré ensuite : le document ÉDITÉ premium est verrouillé.
        await test_db.execute(
            text("UPDATE career_passes SET valid_until = now() - interval '1 day'")
        )
        await test_db.commit()
        response = await client.put(
            f"/cv/{cv.id}", headers=auth_headers, json={"cv_name": "tentative"}
        )
        assert response.status_code == 402

    async def test_atomicite_un_422_n_ecrit_rien(
        self, client, auth_headers, test_db, test_user
    ):
        """Revue pt 4 : template premium VALIDE + contenu INVALIDE dans le
        même PUT ⇒ 422 et AUCUNE écriture partielle (ni template ni
        cliquet)."""
        await _seed_premium_template(test_db)
        cv = await _seed_cv(test_db, test_user)
        await _grant_pass(test_db, test_user, active=True)

        response = await client.put(
            f"/cv/{cv.id}",
            headers=auth_headers,
            json={
                "template_id": "corporate_strict",
                "cv_data_json": {"n'importe": "quoi"},
            },
        )
        assert response.status_code == 422
        after = await _envelope_row(test_db, cv.id)
        assert after["template_id"] == "modern_sobre"
        assert after["created_under_pass"] is False

    async def test_cliquet_template_et_combo_theme_gratuit(
        self, client, auth_headers, test_db, test_user
    ):
        """Revue pt 4 : le cliquet couvre le TEMPLATE — un PUT combinant
        template premium + preset gratuit verrouille via le template seul."""
        await _seed_premium_template(test_db)
        cv = await _seed_cv(test_db, test_user)
        await _grant_pass(test_db, test_user, active=True)

        response = await client.put(
            f"/cv/{cv.id}",
            headers=auth_headers,
            json={
                "template_id": "corporate_strict",
                "theme": {
                    "id": "anthracite",
                    "name": "Anthracite",
                    "tokens": _ANTHRACITE_TOKENS,
                },
            },
        )
        assert response.status_code == 200
        after = await _envelope_row(test_db, cv.id)
        assert after["template_id"] == "corporate_strict"
        assert after["theme_preset_id"] == "anthracite"
        assert after["created_under_pass"] is True  # via le template

    async def test_cliquet_langue_drapeau_leve(
        self, client, auth_headers, test_db, test_user, monkeypatch
    ):
        """Revue pt 4 : branche langue du cliquet (drapeau R6 levé)."""
        monkeypatch.setattr("app.routes.cv.settings.target_language_en_enabled", True)
        cv = await _seed_cv(test_db, test_user)
        await _grant_pass(test_db, test_user, active=True)

        response = await client.put(
            f"/cv/{cv.id}", headers=auth_headers, json={"language": "en"}
        )
        assert response.status_code == 200
        after = await _envelope_row(test_db, cv.id)
        assert after["language"] == "en"
        assert after["created_under_pass"] is True

    async def test_preset_modifie_est_custom(
        self, client, auth_headers, test_db, test_user
    ):
        """Revue pt 4 : un preset aux tokens ALTÉRÉS = thème custom — 402
        sans Pass ; avec Pass : provenance NULL."""
        cv = await _seed_cv(test_db, test_user)
        altere = dict(_ANTHRACITE_TOKENS, color_accent="#2B6CB0")
        body = {"theme": {"id": "anthracite", "name": "Anthracite", "tokens": altere}}

        response = await client.put(f"/cv/{cv.id}", headers=auth_headers, json=body)
        assert response.status_code == 402
        assert (
            response.json()["type"]
            == "https://talentious.fr/errors/premium-theme-required"
        )

        await _grant_pass(test_db, test_user, active=True)
        response = await client.put(f"/cv/{cv.id}", headers=auth_headers, json=body)
        assert response.status_code == 200
        after = await _envelope_row(test_db, cv.id)
        assert after["theme_preset_id"] is None
        assert after["theme_json"] == altere

    async def test_admin_ne_donne_pas_de_premium_a_autrui(
        self, client, admin_headers, test_db, test_user
    ):
        """Revue pt 1 : les capacités d'enveloppe suivent le PROPRIÉTAIRE —
        un admin ne peut pas poser un thème premium sur le document d'un
        user gratuit (le cliquet le verrouillerait sans issue). Le renommage
        de support, lui, reste permis (bypass can_edit, ADR 7bis)."""
        cv = await _seed_cv(test_db, test_user, created_under_pass=True)

        # Support : renommer le doc premium d'autrui (propriétaire sans
        # pass) — bypass admin du gate D1.
        response = await client.put(
            f"/cv/{cv.id}", headers=admin_headers, json={"cv_name": "Corrigé"}
        )
        assert response.status_code == 200

        # Mais pas de cadeau premium : thème custom sur le doc d'un user
        # gratuit ⇒ 402 (sujet du propriétaire).
        response = await client.put(
            f"/cv/{cv.id}",
            headers=admin_headers,
            json={"theme": {"id": None, "name": "Cadeau", "tokens": _CUSTOM_TOKENS}},
        )
        assert response.status_code == 402
        assert (
            response.json()["type"]
            == "https://talentious.fr/errors/premium-theme-required"
        )

    async def test_le_cliquet_ne_redescend_jamais(
        self, client, auth_headers, test_db, test_user
    ):
        """Rétablir une enveloppe 100 % gratuite sur un document premium ne
        remet PAS created_under_pass à false (monotone)."""
        cv = await _seed_cv(
            test_db,
            test_user,
            theme_json=dict(_CUSTOM_TOKENS),
            created_under_pass=True,
        )
        await _grant_pass(test_db, test_user, active=True)

        response = await client.put(
            f"/cv/{cv.id}",
            headers=auth_headers,
            json={
                "theme": {
                    "id": "anthracite",
                    "name": "Anthracite",
                    "tokens": _ANTHRACITE_TOKENS,
                }
            },
        )
        assert response.status_code == 200
        after = await _envelope_row(test_db, cv.id)
        assert after["theme_preset_id"] == "anthracite"
        assert after["created_under_pass"] is True  # cliquet
