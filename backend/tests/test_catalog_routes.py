"""
M1-T10 — `GET /cv/templates` et `GET /cv/themes` : les catalogues (data-driven).

Critère du ticket : conformité au contrat ; seul `modern_sobre` gratuit.

Garanties testées :
- 401 sans authentification (contrat : les deux endpoints exigent un user) ;
- chaque élément de réponse VALIDE contre le modèle GÉNÉRÉ du contrat
  (`CVTemplate` / `CVTheme`) — la conformité est prouvée par le contrat
  lui-même, pas par une liste d'assertions recopiée ;
- un seul template gratuit (`modern_sobre`), un seul preset gratuit
  (`anthracite`, tokens exacts du registre) ;
- DATA-DRIVEN prouvé : une ligne ajoutée en base apparaît dans la réponse
  (aucune liste codée en dur) ;
- les chemins littéraux `/cv/templates` et `/cv/themes` ne sont PAS avalés
  par la route paramétrée `/cv/{cv_id}` (le 200 le prouve — l'ordre
  d'enregistrement des routes est un détail d'implémentation qui casserait
  ici en 404/422).
"""

from app.generated.models import CVTemplate as CVTemplateContract
from app.generated.models import CVTheme as CVThemeContract
from app.models import CVTemplate, CVTheme
from tests.test_cv_themes import _ANTHRACITE_TOKENS


class TestAuthentification:
    async def test_templates_sans_auth_401(self, client):
        response = await client.get("/cv/templates")
        assert response.status_code == 401

    async def test_themes_sans_auth_401(self, client):
        response = await client.get("/cv/themes")
        assert response.status_code == 401


class TestCatalogueTemplates:
    async def test_conforme_au_contrat_et_seul_modern_sobre_gratuit(
        self, client, auth_headers
    ):
        response = await client.get("/cv/templates", headers=auth_headers)
        assert response.status_code == 200
        items = response.json()
        assert len(items) >= 1

        # Conformité : chaque élément valide contre le modèle GÉNÉRÉ du
        # contrat (champs requis, types, URL d'aperçu bien formée).
        parsed = [CVTemplateContract.model_validate(item) for item in items]

        # CRITÈRE : seul modern_sobre est gratuit.
        gratuits = [t for t in parsed if t.is_free]
        assert [t.id for t in gratuits] == ["modern_sobre"]
        modern = gratuits[0]
        assert modern.name == "Moderne sobre"
        assert modern.sector.value == "modern"
        assert modern.default_theme_id == "anthracite"
        assert str(modern.preview_url).endswith("/templates/modern_sobre.png")

    async def test_data_driven_une_ligne_en_base_apparait(
        self, client, auth_headers, test_db
    ):
        """Le registre est piloté par la BASE (contrat) : un template ajouté
        (premium) apparaît sans toucher au code — aucune liste en dur."""
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

        response = await client.get("/cv/templates", headers=auth_headers)
        assert response.status_code == 200
        by_id = {item["id"]: item for item in response.json()}
        assert "corporate_strict" in by_id
        assert by_id["corporate_strict"]["is_free"] is False
        # Et toujours un seul gratuit.
        assert sum(1 for item in by_id.values() if item["is_free"]) == 1


class TestCataloguePresets:
    async def test_conforme_au_contrat_anthracite_gratuit_tokens_exacts(
        self, client, auth_headers
    ):
        response = await client.get("/cv/themes", headers=auth_headers)
        assert response.status_code == 200
        items = response.json()
        parsed = [CVThemeContract.model_validate(item) for item in items]

        gratuits = [t for t in parsed if t.is_free]
        assert [t.id for t in gratuits] == ["anthracite"]
        anthracite = gratuits[0]
        assert anthracite.name == "Anthracite"
        # Les tokens servis sont EXACTEMENT ceux du registre (seed T04,
        # alignés sur theme.ts — c'est ce que l'éditeur front consommera).
        assert anthracite.tokens.model_dump() == _ANTHRACITE_TOKENS

    async def test_data_driven_un_preset_en_base_apparait(
        self, client, auth_headers, test_db
    ):
        test_db.add(
            CVTheme(
                id="ardoise",
                name="Ardoise",
                tokens={
                    "color_accent": "#2B6CB0",
                    "color_text": "#1A202C",
                    "color_muted": "#4A5568",
                    "color_background": "#FFFFFF",
                    "font_heading": "Lora",
                    "font_body": "Source Sans 3",
                },
                is_free=False,
            )
        )
        await test_db.commit()

        response = await client.get("/cv/themes", headers=auth_headers)
        assert response.status_code == 200
        by_id = {item["id"]: item for item in response.json()}
        assert "ardoise" in by_id
        assert by_id["ardoise"]["is_free"] is False
        assert sum(1 for item in by_id.values() if item["is_free"]) == 1
