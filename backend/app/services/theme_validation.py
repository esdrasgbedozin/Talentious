"""
Validation serveur du Thème CV — LE point de rejet (M1-T09, ADR-THEME-DECOUPLED).

Le contrat a tranché : le serveur rejette (422, type `validation-error`), le
package de rendu ne fait que DÉGRADER vers le défaut anthracite (jamais
d'échec au rendu, jamais d'injection). Ce module est l'unique entrée de
validation d'un `CVThemeTokens` côté backend : routes (M1-T12) et worker
(M1-T13) passent par lui.

Deux étages, dans cet ordre :
1. STRUCTURE — déléguée au modèle GÉNÉRÉ du contrat (`CVThemeTokens` :
   hex `#RRGGBB` strict, police dans l'enum `CVFontFamily`, aucun champ en
   trop, tous requis). Jamais réimplémentée ici : toute évolution du contrat
   se propage par régénération.
2. LISIBILITÉ — contraste WCAG 2.x (seuil « fixé côté serveur », dixit le
   contrat) : >= 4.5 sur le fond pour les TROIS couleurs de premier plan
   (AA texte normal). L'accent n'a PAS droit au seuil « texte large » de 3.0 :
   le renderer pose les titres de sections en 13 px gras (CVRenderer.tsx),
   sous les 18.66 px gras qui définissent le texte large WCAG (revue M1-T09,
   pt 1). Si le rendu passe un jour les titres >= 14 pt gras, redescendre
   l'accent à 3.0 — par amendement d'ADR, pas en douce.

Toutes les violations remontent EN UNE FOIS (`ThemeValidationError.errors`,
liste structurée champ par champ) : l'utilisateur corrige son thème en un
aller-retour, pas en six.

Les cas de référence vivent dans `fixtures/theme-validation/cases.json`,
partagés avec l'éditeur de thème front (M3-T10) : un thème accepté ici l'est
là-bas, et réciproquement.
"""

from pydantic import ValidationError

from app.generated.models import CVThemeTokens

# Seuil WCAG 2.x AA texte normal — engagement produit (la lisibilité du CV
# est la promesse, cf. Bible) ; vérifié par test aux paires de référence.
# S'applique aux trois couleurs de premier plan (voir docstring : les titres
# en accent sont rendus trop petits pour le seuil « texte large »).
CONTRAST_MIN_TEXT = 4.5

_CONTRAST_RULES = (
    ("color_text", CONTRAST_MIN_TEXT),
    ("color_muted", CONTRAST_MIN_TEXT),
    ("color_accent", CONTRAST_MIN_TEXT),
)

# Messages français pour les erreurs pydantic courantes (revue M1-T09, pt 6).
# Jamais la valeur reçue dans le message : une charge hostile ne doit pas
# être reflétée dans la réponse.
_PYDANTIC_MESSAGES = {
    "string_pattern_mismatch": "couleur attendue au format hexadécimal strict #RRGGBB",
    "enum": "police hors de la liste blanche du contrat (CVFontFamily)",
    "extra_forbidden": "propriété non prévue par le contrat",
    "missing": "champ requis manquant",
}


class ThemeValidationError(ValueError):
    """Thème refusé — à rendre en 422 `validation-error` (RFC 7807).

    `errors` : liste de {"field", "message"}, TOUTES les violations d'un coup.
    """

    def __init__(self, errors: list[dict[str, str]]):
        self.errors = errors
        super().__init__(
            "Thème CV refusé : "
            + " ; ".join(f"{e['field']} — {e['message']}" for e in errors)
        )


def _linear(channel: int) -> float:
    srgb = channel / 255
    return srgb / 12.92 if srgb <= 0.04045 else ((srgb + 0.055) / 1.055) ** 2.4


def relative_luminance(hex_color: str) -> float:
    """Luminance relative WCAG 2.x d'une couleur `#RRGGBB` (0 = noir, 1 = blanc)."""
    r, g, b = (int(hex_color[i : i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * _linear(r) + 0.7152 * _linear(g) + 0.0722 * _linear(b)


def contrast_ratio(color_a: str, color_b: str) -> float:
    """Ratio de contraste WCAG 2.x entre deux `#RRGGBB` (1:1 à 21:1), symétrique."""
    lum_a, lum_b = relative_luminance(color_a), relative_luminance(color_b)
    lighter, darker = max(lum_a, lum_b), min(lum_a, lum_b)
    return (lighter + 0.05) / (darker + 0.05)


def validate_theme_tokens(tokens) -> CVThemeTokens:
    """Valide des tokens de thème (dict brut ou `CVThemeTokens`) et les rend
    validés. Lève `ThemeValidationError` avec TOUTES les violations.

    La structure passe d'abord (un hex malformé ne doit jamais atteindre le
    calcul de contraste) ; la lisibilité ensuite, sur les trois paires.
    """
    try:
        # TOUJOURS revalider, même un CVThemeTokens déjà instancié : un
        # modèle issu de model_construct() ou muté après coup contournerait
        # la regex hex et crasherait le calcul de contraste en 500 (revue
        # M1-T09, pt 2).
        payload = tokens.model_dump() if isinstance(tokens, CVThemeTokens) else tokens
        model = CVThemeTokens.model_validate(payload)
    except ValidationError as exc:
        raise ThemeValidationError(
            [
                {
                    # loc vide = erreur au niveau objet (entrée non-dict).
                    "field": ".".join(str(part) for part in error["loc"]) or "tokens",
                    "message": _PYDANTIC_MESSAGES.get(error["type"], error["msg"]),
                }
                for error in exc.errors()
            ]
        ) from exc

    contrast_errors = []
    for field, minimum in _CONTRAST_RULES:
        ratio = contrast_ratio(getattr(model, field), model.color_background)
        if ratio < minimum:
            contrast_errors.append(
                {
                    "field": field,
                    "message": (
                        f"contraste insuffisant sur color_background : "
                        f"{ratio:.2f}:1 mesuré, {minimum}:1 exigé (WCAG AA)"
                    ),
                }
            )
    if contrast_errors:
        raise ThemeValidationError(contrast_errors)
    return model
