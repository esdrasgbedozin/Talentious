"""Moteur de Score ATS déterministe (ADR-ATS-DETERMINISTIC).

Fonctions PURES, sans I/O, sans LLM, sans horloge ni aléa : pour un couple
(mots-clés d'offre, contenu CV) donné, le score est toujours le même. Ce module
n'importe rien du réseau ni de la base — il est testable hors contexte.

Couches (du bas vers le haut) :
- M5-T05 : normalisation déterministe du texte (ce fichier, section ci-dessous) ;
- M5-T06 : corpus CV + recouvrement mots-clés / contenu (à venir) ;
- M5-T07 : pondération catégorie × importance + score borné (à venir).
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from app.generated.models import Alias, ATSKeyword, Category1, Importance1

# ---------------------------------------------------------------------------
# M5-T05 — Normalisation déterministe
# ---------------------------------------------------------------------------

# Jeton = suite de caractères alphanumériques, plus « + » et « # » qui portent
# du sens technique (« c++ », « c# », « f# ») et seraient sinon réduits à « c ».
# Tout le reste (ponctuation, tirets, barres, cadratins…) sépare les jetons.
_NON_TOKEN = re.compile(r"[^a-z0-9+#]+")


def normalize(text: str) -> str:
    """Minuscule, sans accents, ponctuation -> espace, espaces compressés.

    Tolère un non-string (champ corrompu) en renvoyant "" : le moteur ne doit
    jamais lever sur un contenu CV dégradé (défense en profondeur).
    """
    if not isinstance(text, str):
        return ""
    lowered = text.lower()
    # NFD puis dépouillement des diacritiques (Mn) : « é » -> « e », déterministe
    # et indépendant de la locale système.
    decomposed = unicodedata.normalize("NFD", lowered)
    stripped = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    return _NON_TOKEN.sub(" ", stripped).strip()


def fold_token(token: str) -> str:
    """Repli de pluriel CONSERVATEUR : retire un « s » final.

    Appliqué symétriquement aux deux côtés de la comparaison (offre ET CV), il
    ne peut pas créer de faux négatif contre soi-même. Garde-fous : seulement
    sur un jeton de longueur >= 4 et PAS terminé par « ss » — pour épargner les
    acronymes et mots techniques (« css », « process », « os »).
    """
    if len(token) >= 4 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def tokenize(text: str) -> list[str]:
    """Texte -> liste ordonnée de jetons normalisés puis repliés."""
    return [fold_token(t) for t in normalize(text).split()]


# ---------------------------------------------------------------------------
# M5-T06 — Corpus CV + recouvrement mots-clés / contenu
# ---------------------------------------------------------------------------


def _as_text(value: object) -> str:
    """Coercition défensive : un champ non-string (document dégradé) -> ""."""
    return value if isinstance(value, str) else ""


def _entries(value: object) -> list:
    """Liste défensive : une valeur non-liste -> [] (jamais d'itération sur None)."""
    return value if isinstance(value, list) else []


def build_cv_corpus(cv: Mapping | None) -> str:
    """Aplati le contenu CV canonique en un texte unique et STABLE.

    Ordre de concaténation fixe (résumé, expériences, formations, projets,
    certifications, compétences). Tout champ absent, non-string ou corrompu est
    ignoré : le moteur ne lève jamais sur un document dégradé (ADR décision 2).
    """
    if not isinstance(cv, Mapping):
        return ""
    parts: list[str] = [_as_text(cv.get("summary"))]
    for exp in _entries(cv.get("selected_experiences")):
        if isinstance(exp, Mapping):
            parts += [
                _as_text(exp.get("title")),
                _as_text(exp.get("company")),
                _as_text(exp.get("description")),
            ]
            parts += [_as_text(s) for s in _entries(exp.get("highlighted_skills"))]
    for edu in _entries(cv.get("selected_educations")):
        if isinstance(edu, Mapping):
            parts += [
                _as_text(edu.get("degree")),
                _as_text(edu.get("institution")),
                _as_text(edu.get("description")),
            ]
    for proj in _entries(cv.get("selected_projects")):
        if isinstance(proj, Mapping):
            parts += [_as_text(proj.get("name")), _as_text(proj.get("description"))]
            parts += [_as_text(s) for s in _entries(proj.get("relevant_skills"))]
    for cert in _entries(cv.get("selected_certifications")):
        if isinstance(cert, Mapping):
            parts += [_as_text(cert.get("name")), _as_text(cert.get("issuer"))]
    for skill in _entries(cv.get("highlighted_skills")):
        if isinstance(skill, Mapping):
            parts.append(_as_text(skill.get("name")))
    return " ".join(p for p in parts if p).strip()


def _keyword_forms(keyword: ATSKeyword) -> list[list[str]]:
    """Formes reconnues d'un mot-clé : son nom ET ses alias, chacun tokenisé.

    La synonymie vient des `aliases` (fournis par l'agent), pas d'une table
    maison (ADR décision 4). Les formes vides après normalisation sont écartées.
    """
    raw = [keyword.name]
    raw += [a.root if isinstance(a, Alias) else str(a) for a in (keyword.aliases or [])]
    forms = [tokenize(form) for form in raw]
    return [f for f in forms if f]


def _contains_subsequence(haystack: list[str], needle: list[str]) -> bool:
    """Vrai si `needle` est une sous-séquence CONTIGUË de jetons de `haystack`.

    Gère les mots-clés multi-mots (« machine learning ») à frontières de jetons ;
    l'ordre compte (« learning machine » ne matche pas « machine learning »).
    """
    n = len(needle)
    if n == 0:
        return False
    for i in range(len(haystack) - n + 1):
        if haystack[i : i + n] == needle:
            return True
    return False


def match_keywords(
    keywords: Sequence[ATSKeyword], corpus: str
) -> tuple[list[ATSKeyword], list[ATSKeyword]]:
    """Partition déterministe (présents, manquants) des mots-clés dans le corpus.

    Un mot-clé est présent si son nom OU l'un de ses alias apparaît comme
    sous-séquence contiguë de jetons du corpus. L'ordre des mots-clés d'entrée
    est préservé dans les deux listes de sortie.
    """
    corpus_tokens = tokenize(corpus)
    matched: list[ATSKeyword] = []
    missing: list[ATSKeyword] = []
    for keyword in keywords:
        forms = _keyword_forms(keyword)
        if any(_contains_subsequence(corpus_tokens, form) for form in forms):
            matched.append(keyword)
        else:
            missing.append(keyword)
    return matched, missing


# ---------------------------------------------------------------------------
# M5-T07 — Pondération catégorie × importance + score borné 0-100
# ---------------------------------------------------------------------------

# Poids par CATÉGORIE : hard skills > exigences/responsabilités > savoir-être.
_CATEGORY_WEIGHT: dict[Category1, float] = {
    Category1.hard_skill: 3.0,
    Category1.requirement: 2.0,
    Category1.soft_skill: 1.0,
}
# Multiplicateur par IMPORTANCE ; une importance absente (None) vaut « Important ».
_IMPORTANCE_MULTIPLIER: dict[Importance1, float] = {
    Importance1.Critical: 1.5,
    Importance1.Important: 1.0,
    Importance1.Nice_to_have: 0.5,
}


@dataclass(frozen=True)
class AtsScoreResult:
    """Résultat déterministe du moteur : score borné + partition des mots-clés."""

    score: int
    matched: list[ATSKeyword]
    missing: list[ATSKeyword]


def keyword_weight(keyword: ATSKeyword) -> float:
    """Poids d'un mot-clé = poids(catégorie) × multiplicateur(importance)."""
    category_weight = _CATEGORY_WEIGHT.get(keyword.category, 1.0)
    multiplier = _IMPORTANCE_MULTIPLIER.get(keyword.importance, 1.0)
    return category_weight * multiplier


def compute_ats_score(
    keywords: Sequence[ATSKeyword], cv: Mapping | None
) -> AtsScoreResult:
    """Score ATS 0-100 déterministe (ADR-ATS-DETERMINISTIC).

    Fraction du poids total des mots-clés de l'offre qui est couverte par le CV,
    mise à l'échelle 0-100 et arrondie UNE SEULE fois, à la fin. 0 mot-clé (ou
    poids total nul) => 0 (aucune adéquation à créditer).
    """
    corpus = build_cv_corpus(cv)
    matched, missing = match_keywords(keywords, corpus)
    total_weight = sum(keyword_weight(k) for k in keywords)
    if total_weight <= 0:
        return AtsScoreResult(score=0, matched=matched, missing=missing)
    covered_weight = sum(keyword_weight(k) for k in matched)
    score = round(100 * covered_weight / total_weight)
    return AtsScoreResult(
        score=max(0, min(100, int(score))), matched=matched, missing=missing
    )
