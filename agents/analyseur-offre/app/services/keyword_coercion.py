"""Ceinture de coercition post-LLM des mots-clés ATS (M5-T01).

Pure et importable SANS google-genai (le SDK Vertex) : le test de fumée tourne
en CI avec les seules dépendances backend. La sortie du modèle n'est jamais
digne de confiance (elle dérive quasi directement du texte d'offre, contrôlé par
l'utilisateur) : on assainit le JEU DE CARACTÈRES à la frontière (contrôle, NUL,
bidi, zero-width), on normalise (NFC + trim), on écarte les catégories invalides
et les noms vides, on déduplique (insensible à la casse), et on borne (nombre de
mots-clés, d'alias, longueurs). Les bornes suivent le contrat (ATSKeyword /
AnalysisResult.keywords). Ne lève JAMAIS : un contenu douteux est écarté, pas une
erreur (le flux reste robuste face à un LLM malformé).
"""

import logging
import unicodedata
from collections.abc import Mapping

logger = logging.getLogger(__name__)

_VALID_CATEGORIES = frozenset({"hard_skill", "soft_skill", "requirement"})
# Importance : correspondance INSENSIBLE À LA CASSE -> valeur canonique du contrat
# (un « critical » renvoyé par le LLM ne doit pas être silencieusement perdu).
_IMPORTANCE_BY_KEY = {
    "critical": "Critical",
    "important": "Important",
    "nice to have": "Nice to have",
}

MAX_KEYWORDS = 60  # AnalysisResult.keywords : maxItems
MAX_ALIASES = 5  # ATSKeyword.aliases : maxItems
MAX_NAME_LEN = 100  # ATSKeyword.name / alias : maxLength


def _clean_name(value: object) -> str:
    """Chaîne sûre et bornée, "" si non-string ou vide après nettoyage.

    Assainit le charset à la frontière de la sortie LLM (défense en profondeur,
    pas de délégation au seul échappement des sinks) : NFC, puis suppression des
    caractères de CONTRÔLE (Cc, dont NUL — qui casserait un INSERT Postgres) et de
    FORMAT (Cf : overrides bidi, zero-width, BOM), enfin trim et troncature.
    """
    if not isinstance(value, str):
        return ""
    normalized = unicodedata.normalize("NFC", value)
    cleaned = "".join(
        c for c in normalized if unicodedata.category(c) not in ("Cc", "Cf")
    )
    return cleaned.strip()[:MAX_NAME_LEN]


def _canonical_category(value: object) -> str | None:
    """Catégorie TOLÉRANTE -> valeur d'enum, ou None si non reconnue.

    « Hard_Skill », « hard skill », « hard_skill » -> « hard_skill » : on ne perd
    pas un mot-clé pour une casse ou un espace (un mot-clé perdu tire le score
    ATS vers le bas sans signal).
    """
    if not isinstance(value, str):
        return None
    key = value.strip().lower().replace(" ", "_")
    return key if key in _VALID_CATEGORIES else None


def _canonical_importance(value: object) -> str | None:
    """Importance TOLÉRANTE (insensible à la casse) -> valeur d'enum, ou None."""
    if not isinstance(value, str):
        return None
    return _IMPORTANCE_BY_KEY.get(value.strip().lower())


def _clean_aliases(value: object, taken: set[str]) -> list[str]:
    """Alias nettoyés : non-string écartés, assainis, dédupliqués (casse) et
    bornés, en EXCLUANT les clés déjà prises (le nom du mot-clé lui-même, pour
    ne pas gaspiller un emplacement d'alias sur un doublon du nom)."""
    if not isinstance(value, list):
        return []
    out: list[str] = []
    seen = set(taken)
    for raw in value:
        name = _clean_name(raw)
        if not name:
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(name)
        if len(out) >= MAX_ALIASES:
            break
    return out


def coerce_keywords(raw: object) -> list[dict]:
    """Normalise, filtre, déduplique et borne les mots-clés issus du LLM.

    Déterministe et sans exception. Écarte : non-liste, éléments non-objet, nom
    vide, catégorie non reconnue, doublons de nom (casse). Importance non reconnue
    -> None. Les valeurs non hashables (liste/dict pour category/importance) sont
    gérées par les gardes `isinstance`, jamais une `TypeError`.
    """
    if not isinstance(raw, list):
        return []
    out: list[dict] = []
    seen: set[str] = set()
    dropped = 0
    for item in raw:
        if not isinstance(item, Mapping):
            dropped += 1
            continue
        name = _clean_name(item.get("name"))
        category = _canonical_category(item.get("category"))
        if not name or category is None:
            dropped += 1
            continue
        key = name.casefold()
        if key in seen:
            dropped += 1
            continue
        seen.add(key)
        out.append(
            {
                "name": name,
                "category": category,
                "importance": _canonical_importance(item.get("importance")),
                "aliases": _clean_aliases(item.get("aliases"), {key}),
            }
        )
        if len(out) >= MAX_KEYWORDS:
            break
    if dropped:
        # Observabilité SANS contenu (RGPD) : un LLM qui déraille devient visible.
        logger.debug("coercition keywords : %d gardés, %d écartés", len(out), dropped)
    return out
