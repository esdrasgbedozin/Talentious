"""
M1-T11 — L'enveloppe dans les lectures (`GET /cv`, `GET /cv/{id}`) +
`is_editable` calculé.

Critère du ticket : Pass expiré ⇒ `is_editable=false`, lecture OK, AUCUNE
écriture en base (D1 : l'état « verrouillé » est calculé à la volée, jamais
persisté).

Garanties testées :
- conformité au contrat par validation contre les modèles GÉNÉRÉS
  (`CVListItem`, `CVDetailResponse`) — y compris `theme` snapshot complet
  (id de provenance, nom, tokens) et `language` ;
- le nom du thème vient du registre pour un preset (`Anthracite`), et vaut
  « Personnalisé » pour un thème custom (provenance NULL — T05) ;
- `is_editable` suit la table de vérité D1 (document gratuit toujours
  éditable ; document créé sous Pass : éditable seulement Pass actif) ;
- la lecture n'écrit RIEN : `updated_at` et l'enveloppe sont identiques en
  base après les GET (vérifié en SQL direct).
"""

import json
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import null, text

from app.generated.models import CVDetailResponse as CVDetailContract
from app.generated.models import CVListItem as CVListItemContract
from app.models import GeneratedCV
from app.models.career_pass import CareerPass, PassType
from app.models.generated_cv import ANTHRACITE_TOKENS
from tests.test_cv_themes import _ANTHRACITE_TOKENS


def test_la_constante_app_est_alignee_sur_le_registre():
    """Chaîne de preuve : ANTHRACITE_TOKENS (app, source du server_default et
    du repli de lecture) == _ANTHRACITE_TOKENS (tests, prouvé aligné sur
    theme.ts par test_cv_themes). Toute dérive casse ici."""
    assert ANTHRACITE_TOKENS == _ANTHRACITE_TOKENS


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


async def _seed_cvs(test_db, user) -> dict:
    """Deux variantes : une « V1 » (enveloppe par défauts serveur), une
    premium (thème custom, EN, créée sous Pass)."""
    libre = GeneratedCV(
        user_id=user.id,
        cv_name="CV libre",
        template_id="modern_sobre",
        cv_data_json=_CANONICAL_CV,
    )
    premium = GeneratedCV(
        user_id=user.id,
        cv_name="CV premium",
        template_id="modern_sobre",
        cv_data_json=_CANONICAL_CV,
        theme_json=_CUSTOM_TOKENS,
        # ⚠️ PIÈGE (découvert ici, tracé M1-T13) : `theme_preset_id=None`
        # explicite est AVALÉ par l'ORM (colonne à server_default → l'INSERT
        # omet la colonne et la base pose 'anthracite', provenance FAUSSE).
        # `null()` force réellement NULL — le worker devra faire pareil.
        theme_preset_id=null(),
        language="en",
        created_under_pass=True,
    )
    test_db.add_all([libre, premium])
    await test_db.commit()
    await test_db.refresh(libre)
    await test_db.refresh(premium)
    return {"libre": libre, "premium": premium}


class TestListeAvecEnveloppe:
    async def test_conforme_au_contrat_presets_et_custom(
        self, client, auth_headers, test_db, test_user
    ):
        cvs = await _seed_cvs(test_db, test_user)
        response = await client.get("/cv", headers=auth_headers)
        assert response.status_code == 200
        items = {item["cv_name"]: item for item in response.json()}
        assert set(items) == {"CV libre", "CV premium"}

        # Conformité : chaque élément valide contre le modèle GÉNÉRÉ.
        parsed = {
            name: CVListItemContract.model_validate(item)
            for name, item in items.items()
        }

        libre = parsed["CV libre"]
        assert libre.theme.id == "anthracite"
        assert libre.theme.name == "Anthracite"  # nom du REGISTRE (join)
        assert libre.theme.tokens.model_dump() == _ANTHRACITE_TOKENS
        assert libre.language.value == "fr"
        assert libre.job_offer_id is None

        premium = parsed["CV premium"]
        assert premium.theme.id is None  # provenance NULL = custom (T05)
        assert premium.theme.name == "Personnalisé"
        assert premium.theme.tokens.model_dump() == _CUSTOM_TOKENS
        assert premium.language.value == "en"
        assert str(cvs["premium"].id) == str(premium.id)


class TestDetailAvecEnveloppe:
    async def test_conforme_au_contrat_et_is_editable_present(
        self, client, auth_headers, test_db, test_user
    ):
        cvs = await _seed_cvs(test_db, test_user)
        response = await client.get(f"/cv/{cvs['libre'].id}", headers=auth_headers)
        assert response.status_code == 200
        detail = CVDetailContract.model_validate(response.json())
        assert detail.theme.id == "anthracite"
        assert detail.theme.tokens.model_dump() == _ANTHRACITE_TOKENS
        assert detail.language.value == "fr"
        assert detail.is_editable is True  # document gratuit, user gratuit

    async def test_is_editable_suit_d1(self, client, auth_headers, test_db, test_user):
        """Document créé sous Pass : user gratuit => false ; Pass EXPIRÉ =>
        toujours false (critère) ; Pass actif => true. Le document gratuit
        reste éditable dans tous les cas."""
        cvs = await _seed_cvs(test_db, test_user)
        url_libre = f"/cv/{cvs['libre'].id}"
        url_premium = f"/cv/{cvs['premium'].id}"
        now = datetime.now(timezone.utc)

        # Sans aucun pass.
        assert (await client.get(url_premium, headers=auth_headers)).json()[
            "is_editable"
        ] is False
        assert (await client.get(url_libre, headers=auth_headers)).json()[
            "is_editable"
        ] is True

        # Pass EXPIRÉ : rien ne change (critère du ticket).
        test_db.add(
            CareerPass(
                user_id=test_user.id,
                pass_type=PassType.PASS_30_DAYS,
                valid_until=now - timedelta(days=1),
            )
        )
        await test_db.commit()
        assert (await client.get(url_premium, headers=auth_headers)).json()[
            "is_editable"
        ] is False
        assert (await client.get(url_libre, headers=auth_headers)).json()[
            "is_editable"
        ] is True

        # Pass ACTIF : le document premium redevient éditable.
        test_db.add(
            CareerPass(
                user_id=test_user.id,
                pass_type=PassType.PASS_30_DAYS,
                valid_until=now + timedelta(days=10),
            )
        )
        await test_db.commit()
        assert (await client.get(url_premium, headers=auth_headers)).json()[
            "is_editable"
        ] is True

    async def test_la_lecture_n_ecrit_rien_en_base(
        self, client, auth_headers, test_db, test_user
    ):
        """CRITÈRE : l'état « verrouillé » est CALCULÉ, jamais persisté —
        après les GET, updated_at et l'enveloppe sont identiques en SQL
        direct (aucun UPDATE, aucune « lazy migration »)."""
        cvs = await _seed_cvs(test_db, test_user)

        async def snapshot():
            rows = await test_db.execute(
                text(
                    "SELECT id, updated_at, theme_preset_id, created_under_pass, "
                    "md5(theme_json::text), md5(cv_data_json::text) "
                    "FROM generated_cvs ORDER BY id"
                )
            )
            return rows.fetchall()

        before = await snapshot()
        await client.get("/cv", headers=auth_headers)
        await client.get(f"/cv/{cvs['libre'].id}", headers=auth_headers)
        await client.get(f"/cv/{cvs['premium'].id}", headers=auth_headers)
        assert await snapshot() == before

    async def test_le_cv_d_autrui_reste_introuvable_ou_interdit(
        self, client, auth_headers, test_db, admin_user
    ):
        """L'enveloppe n'ouvre aucune brèche d'ownership : le CV d'un autre
        user répond comme avant (403 contrat V1 — harmonisation 404
        anti-IDOR tracée M9-T11), sans fuite d'is_editable."""
        autre = GeneratedCV(
            user_id=admin_user.id,
            cv_name="pas à moi",
            template_id="modern_sobre",
            cv_data_json=_CANONICAL_CV,
        )
        test_db.add(autre)
        await test_db.commit()
        await test_db.refresh(autre)

        response = await client.get(f"/cv/{autre.id}", headers=auth_headers)
        assert response.status_code == 403
        assert "is_editable" not in response.json()

    async def test_un_id_inconnu_reste_404(self, client, auth_headers):
        response = await client.get(f"/cv/{uuid.uuid4()}", headers=auth_headers)
        assert response.status_code == 404

    async def test_admin_lit_le_cv_d_autrui_avec_son_propre_sujet(
        self, client, admin_headers, test_db, test_user
    ):
        """Revue M1-T11 pt 4 : l'admin lit le CV premium d'un autre user —
        is_editable est calculé sur SON sujet (admin jamais gaté) : true."""
        cvs = await _seed_cvs(test_db, test_user)
        response = await client.get(f"/cv/{cvs['premium'].id}", headers=admin_headers)
        assert response.status_code == 200
        assert response.json()["is_editable"] is True

    async def test_preset_modifie_tokens_servis_tels_quels(
        self, client, auth_headers, test_db, test_user
    ):
        """Un thème « parti d'un preset puis modifié » garde sa provenance :
        id et nom du preset, tokens SERVIS TELS QUELS (le snapshot fait foi,
        jamais résolu par référence — ADR-THEME-DECOUPLED)."""
        modifie = GeneratedCV(
            user_id=test_user.id,
            cv_name="anthracite modifié",
            template_id="modern_sobre",
            cv_data_json=_CANONICAL_CV,
            theme_json=_CUSTOM_TOKENS,  # diffère du preset anthracite
            theme_preset_id="anthracite",
        )
        test_db.add(modifie)
        await test_db.commit()
        await test_db.refresh(modifie)

        response = await client.get(f"/cv/{modifie.id}", headers=auth_headers)
        detail = CVDetailContract.model_validate(response.json())
        assert detail.theme.id == "anthracite"
        assert detail.theme.name == "Anthracite"
        assert detail.theme.tokens.model_dump() == _CUSTOM_TOKENS


class TestThemeCorrompuDegrade:
    async def test_un_theme_json_corrompu_ne_casse_ni_liste_ni_detail(
        self, client, auth_headers, test_db, test_user
    ):
        """Revue M1-T11 pt 1 : la base ne garantit que jsonb_typeof='object'
        — un theme_json corrompu (bug futur, écriture directe) ne doit PAS
        rendre 500 toute la liste : même doctrine que le rendu, DÉGRADATION
        vers le défaut anthracite (le point de rejet est à l'écriture)."""
        cvs = await _seed_cvs(test_db, test_user)
        await test_db.execute(
            text(
                "UPDATE generated_cvs SET theme_json = "
                '\'{"color_accent": "expression(alert(1))"}\'::jsonb '
                "WHERE id = :id"
            ),
            {"id": cvs["libre"].id},
        )
        await test_db.commit()
        # L'UPDATE SQL brut n'invalide pas l'identity map de la session
        # partagée avec le client (expire_on_commit=False) : sans expire,
        # la route relirait l'objet ORM d'avant corruption.
        test_db.expire_all()

        liste = await client.get("/cv", headers=auth_headers)
        assert liste.status_code == 200
        items = {item["cv_name"]: item for item in liste.json()}
        degrade = items["CV libre"]["theme"]
        assert degrade["tokens"] == ANTHRACITE_TOKENS  # repli, pas la charge
        assert degrade["id"] is None  # provenance retirée : plus garantie

        detail = await client.get(f"/cv/{cvs['libre'].id}", headers=auth_headers)
        assert detail.status_code == 200
        assert detail.json()["theme"]["tokens"] == ANTHRACITE_TOKENS


class TestPutServeEtGate:
    async def test_le_put_sert_l_enveloppe_et_les_champs_v1(
        self, client, auth_headers, test_db, test_user
    ):
        """Revue M1-T11 pt 4 : la réponse du PUT porte l'enveloppe ET les
        champs V1 (aucune régression de forme)."""
        cvs = await _seed_cvs(test_db, test_user)
        response = await client.put(
            f"/cv/{cvs['libre'].id}",
            headers=auth_headers,
            json={"cv_name": "renommé"},
        )
        assert response.status_code == 200
        detail = CVDetailContract.model_validate(response.json())
        assert detail.cv_name == "renommé"
        assert detail.theme.id == "anthracite"
        assert detail.language.value == "fr"
        assert detail.is_editable is True

    async def test_le_put_est_gate_par_d1(
        self, client, auth_headers, test_db, test_user
    ):
        """Revue M1-T11 pt 2 : l'ÉCRITURE suit la même règle que
        is_editable (D1) — un document créé sous Pass n'est pas modifiable
        sans Pass actif (402), et rien n'est écrit ; le document gratuit
        reste modifiable."""
        cvs = await _seed_cvs(test_db, test_user)
        response = await client.put(
            f"/cv/{cvs['premium'].id}",
            headers=auth_headers,
            json={"cv_name": "tentative"},
        )
        assert response.status_code == 402
        assert response.headers["content-type"].startswith("application/problem+json")
        # Rien n'a été écrit.
        row = await test_db.execute(
            text("SELECT cv_name FROM generated_cvs WHERE id = :id"),
            {"id": cvs["premium"].id},
        )
        assert row.scalar_one() == "CV premium"
