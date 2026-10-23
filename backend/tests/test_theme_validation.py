"""
M1-T09 — Validation serveur du Thème CV (point de rejet 422, ADR-THEME-DECOUPLED).

Le serveur est LE point de rejet d'un thème invalide (le package de rendu ne
fait que dégrader vers le défaut, jamais rejeter). Critère du ticket : hex
invalide, police hors liste blanche, contraste insuffisant => 422.

Garanties testées :
- structure STRICTE déléguée au modèle GÉNÉRÉ du contrat (hex `#RRGGBB`,
  police dans l'enum `CVFontFamily`, aucune propriété en trop, tous champs
  requis) — toute dérive du contrat se propage ici par régénération ;
- contraste WCAG 2.x : texte/fond et atténué/fond >= 4.5 (texte normal),
  accent/fond >= 3.0 (titres = texte large), vérifié aux bornes EXACTES avec
  les paires de référence WCAG (#767676/#FFFFFF = 4.54, #777777 = 4.48) ;
- TOUTES les erreurs sont remontées d'un coup (pas seulement la première) ;
- les cas sont partagés avec l'éditeur front (fixtures/theme-validation/,
  consommées par M3-T10) — le même thème est accepté ou refusé des deux côtés.
"""

import json
from pathlib import Path

import pytest

from app.generated.models import CVThemeTokens
from app.services.theme_validation import (
    CONTRAST_MIN_TEXT,
    ThemeValidationError,
    contrast_ratio,
    validate_theme_tokens,
)

_FIXTURES = (
    Path(__file__).resolve().parents[2] / "fixtures" / "theme-validation" / "cases.json"
)
_CASES = json.loads(_FIXTURES.read_text(encoding="utf-8"))["cases"]


class TestContrastRatio:
    def test_paires_de_reference_wcag(self):
        """Noir/blanc = 21:1, identique = 1:1, #767676/blanc = 4.54 (paire de
        référence WCAG), symétrique."""
        assert contrast_ratio("#000000", "#FFFFFF") == pytest.approx(21.0, abs=0.01)
        assert contrast_ratio("#FFFFFF", "#FFFFFF") == pytest.approx(1.0)
        assert contrast_ratio("#767676", "#FFFFFF") == pytest.approx(4.54, abs=0.01)
        assert contrast_ratio("#FFFFFF", "#767676") == contrast_ratio(
            "#767676", "#FFFFFF"
        )

    def test_le_seuil_produit(self):
        """4.5 (AA texte normal) pour les TROIS couleurs de premier plan —
        la valeur elle-même est un engagement (contrat : « seuil fixé côté
        serveur ») ; pas de seuil « texte large » tant que les titres sont
        rendus à 13 px gras (revue M1-T09, pt 1)."""
        assert CONTRAST_MIN_TEXT == 4.5


class TestValidationStructurelle:
    @pytest.mark.parametrize("case", _CASES, ids=[c["name"] for c in _CASES])
    def test_cas_partages_avec_le_front(self, case):
        """Chaque cas du fichier partagé est accepté ou refusé comme annoncé.
        Le contrat porte sur les CHAMPS en erreur (`error_fields`), pas sur le
        texte des messages — indépendant de la langue (revue M1-T09, pt 3)."""
        if case["valid"]:
            tokens = validate_theme_tokens(case["tokens"])
            assert isinstance(tokens, CVThemeTokens)
        else:
            with pytest.raises(ThemeValidationError) as exc_info:
                validate_theme_tokens(case["tokens"])
            fields = {e["field"] for e in exc_info.value.errors}
            assert fields == set(case["error_fields"])

    def test_un_modele_deja_valide_est_accepte_tel_quel(self):
        """Le worker (M1-T13) passera parfois un CVThemeTokens déjà construit."""
        tokens = CVThemeTokens(
            color_accent="#2D3748",
            color_text="#1A202C",
            color_muted="#4A5568",
            color_background="#FFFFFF",
            font_heading="Inter",
            font_body="Inter",
        )
        assert validate_theme_tokens(tokens) == tokens

    def test_un_modele_construit_sans_validation_est_revalide(self):
        """Revue M1-T09, pt 2 : `model_construct()` contourne pydantic — le
        service doit REVALIDER (422 propre), pas crasher en ValueError brut
        dans le calcul de contraste (500)."""
        forged = CVThemeTokens.model_construct(
            color_accent="#2D3748",
            color_text="#ZZZZZZ; background: url(//evil)",
            color_muted="#4A5568",
            color_background="#FFFFFF",
            font_heading="Inter",
            font_body="Inter",
        )
        with pytest.raises(ThemeValidationError) as exc_info:
            validate_theme_tokens(forged)
        assert {e["field"] for e in exc_info.value.errors} == {"color_text"}

    @pytest.mark.parametrize("hostile", [None, [], "x", 42, {}])
    def test_une_entree_non_conforme_leve_proprement(self, hostile):
        """Revue M1-T09, pt 4 : None, liste, chaîne, entier, dict vide —
        toujours ThemeValidationError structurée, jamais un crash brut."""
        with pytest.raises(ThemeValidationError) as exc_info:
            validate_theme_tokens(hostile)
        assert exc_info.value.errors  # au moins une erreur structurée

    def test_les_hex_minuscules_sont_acceptes(self):
        """Le pattern du contrat accepte [0-9A-Fa-f] : la luminance doit
        suivre (int(x, 16) gère les minuscules)."""
        tokens = validate_theme_tokens(
            {
                "color_accent": "#2d3748",
                "color_text": "#1a202c",
                "color_muted": "#4a5568",
                "color_background": "#ffffff",
                "font_heading": "Inter",
                "font_body": "Inter",
            }
        )
        assert tokens.color_text == "#1a202c"

    @pytest.mark.parametrize("sale", ["#1A202C\n", "#1A202C ", " #1A202C"])
    def test_les_blancs_autour_d_un_hex_sont_refuses(self, sale):
        """Revue M1-T09, pt 5 : pas de tolérance aux blancs — le serveur est
        plus strict que le rendu (qui trim), jamais l'inverse."""
        with pytest.raises(ThemeValidationError) as exc_info:
            validate_theme_tokens(
                {
                    "color_accent": "#2D3748",
                    "color_text": sale,
                    "color_muted": "#4A5568",
                    "color_background": "#FFFFFF",
                    "font_heading": "Inter",
                    "font_body": "Inter",
                }
            )
        assert {e["field"] for e in exc_info.value.errors} == {"color_text"}

    def test_les_messages_structurels_sont_en_francais(self):
        """Revue M1-T09, pt 6 : les erreurs pydantic courantes sont traduites,
        et la valeur reçue (potentiellement hostile) n'est JAMAIS reflétée."""
        charge = "Inter'; @import url(//evil); '"
        with pytest.raises(ThemeValidationError) as exc_info:
            validate_theme_tokens(
                {
                    "color_accent": "#2D3748",
                    "color_text": "#1A202C",
                    "color_muted": "#4A5568",
                    "color_background": "#FFFFFF",
                    "font_heading": charge,
                    "font_body": "Inter",
                }
            )
        (error,) = exc_info.value.errors
        assert error["field"] == "font_heading"
        assert "liste blanche" in error["message"]
        assert charge not in str(exc_info.value)


class TestContrasteAuxBornes:
    def _tokens(self, **overrides):
        base = {
            "color_accent": "#2D3748",
            "color_text": "#1A202C",
            "color_muted": "#4A5568",
            "color_background": "#FFFFFF",
            "font_heading": "Inter",
            "font_body": "Inter",
        }
        base.update(overrides)
        return base

    def test_texte_a_la_borne_exacte(self):
        """#767676/blanc = 4.54 passe ; #777777/blanc = 4.48 est refusé.
        Toute érosion du seuil 4.5 casse ce test."""
        validate_theme_tokens(self._tokens(color_text="#767676"))
        with pytest.raises(ThemeValidationError, match="color_text"):
            validate_theme_tokens(self._tokens(color_text="#777777"))

    def test_attenue_a_la_borne_exacte(self):
        validate_theme_tokens(self._tokens(color_muted="#767676"))
        with pytest.raises(ThemeValidationError, match="color_muted"):
            validate_theme_tokens(self._tokens(color_muted="#777777"))

    def test_accent_au_meme_seuil_que_le_texte(self):
        """Revue M1-T09, pt 1 : les titres en accent sont rendus à 13 px gras
        (CVRenderer.tsx) — PAS du « texte large » WCAG. L'accent exige donc
        4.5 : #949494/blanc = 3.03 (qui passait l'ex-seuil 3.0) est REFUSÉ,
        #767676 (4.54) passe."""
        validate_theme_tokens(self._tokens(color_accent="#767676"))
        with pytest.raises(ThemeValidationError, match="color_accent"):
            validate_theme_tokens(self._tokens(color_accent="#949494"))

    def test_le_message_porte_le_ratio_calcule(self):
        """L'utilisateur doit savoir POURQUOI son thème est illisible : le
        message cite le ratio mesuré et le seuil exigé."""
        with pytest.raises(ThemeValidationError) as exc_info:
            validate_theme_tokens(self._tokens(color_text="#CCCCCC"))
        message = str(exc_info.value)
        assert "contraste" in message
        assert "4.5" in message
        assert "1.6" in message  # ratio #CCCCCC/#FFFFFF ~ 1.60

    def test_toutes_les_erreurs_remontent_d_un_coup(self):
        """Trois violations de contraste => trois erreurs listées (pas
        seulement la première) ; `errors` est structuré champ par champ."""
        with pytest.raises(ThemeValidationError) as exc_info:
            validate_theme_tokens(
                self._tokens(
                    color_text="#CCCCCC",
                    color_muted="#DDDDDD",
                    color_accent="#EEEEEE",
                )
            )
        fields = {e["field"] for e in exc_info.value.errors}
        assert fields == {"color_text", "color_muted", "color_accent"}

    def test_structure_et_contraste_ne_se_melangent_pas(self):
        """Un hex invalide est signalé AVANT tout calcul de contraste (pas de
        crash sur int('zz', 16)) ; l'erreur structurelle cite le champ."""
        with pytest.raises(ThemeValidationError, match="color_text"):
            validate_theme_tokens(self._tokens(color_text="#ZZZZZZ"))
