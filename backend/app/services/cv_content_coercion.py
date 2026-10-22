"""
Coercition du contenu CV produit par l'agent rédacteur-cv vers le schéma canonique
`GeneratedCVData` (contracts/openapi.yaml).

Ceinture de sécurité APRÈS l'appel LLM, pendant du `coerce_profile` de l'import :
quelle que soit la sortie du rédacteur (clés inventées, types faux, `<script>`,
URL `javascript:`/`data:`, chaînes démesurées, enums hors domaine, champ interne
`optimization_notes`), seul ce qui correspond STRICTEMENT au schéma canonique en
ressort — clés en liste blanche, types forcés, longueurs plafonnées, dates
re-validées (AAAA-MM sinon null), URL re-validées (http(s) sinon null), enums
ramenés à une valeur sûre.

C'est la condition d'un rendu HTML serveur sûr en V2 (ADR-CONTENT-SCHEMA) : le
`GeneratedCVData` stocké en JSONB est ensuite rendu tel quel par le package de
rendu partagé. L'échappement HTML au rendu reste la 2e couche (ADR-RENDER-SECURITY) ;
cette coercition est la 1re. Le champ interne `optimization_notes` n'est JAMAIS
conservé (risque d'exfiltration BLK-5).

`coerce_cv_content` est volontairement sans dépendance (ni Pydantic, ni Vertex) pour
être testable partout, y compris en CI backend. La validité fine de schéma (ex. email
valide) est vérifiée en aval par le worker, qui fait échouer le job si le contenu
coercé reste invalide ; seul `is_cv_content_conformant` importe `GeneratedCVData`
paresseusement, pour cette unique validation.
"""

from __future__ import annotations

import re
from typing import Any, Optional

DATE_RE = re.compile(r"^[0-9]{4}-(0[1-9]|1[0-2])$")  # [0-9], pas \d (chiffres Unicode)
_URL_SCHEME_RE = re.compile(r"^https?://", re.IGNORECASE)
# Une URL légitime ne contient ni espace, ni caractère de contrôle, ni guillemet /
# chevron : les rejeter ferme le breakout d'attribut au rendu (defense-in-depth,
# l'échappement HTML au rendu restant la 2e couche obligatoire — ADR-RENDER-SECURITY).
_URL_UNSAFE_RE = re.compile(r"[\s\x00-\x1f\"'<>\\]")
# Les id attendus sont de forme `exp-1`, `edu-2`… : charset restreint (inerte en
# attribut HTML ou sélecteur CSS côté rendu).
_ID_DISALLOWED_RE = re.compile(r"[^A-Za-z0-9._-]")

# Plafonds de longueur. `personal_info.*` reprend les `maxLength` du contrat
# (contracts/openapi.yaml, PersonalInfo) ; les autres sont des garde-fous produit
# anti-explosion (les sous-schémas Selected* n'imposent pas de maxLength au contrat).
# Un durcissement contractuel (maxLength dans openapi.yaml + make generate-types) est
# tracé en roadmap, non bloquant pour cette ceinture de sécurité.
CAPS = {
    "first_name": 100,
    "last_name": 100,
    "email": 255,
    "phone": 30,
    "linkedin": 500,
    "address": 255,
    "city": 100,
    "postal_code": 20,
    "country": 100,
    "summary": 2000,
    "id": 64,
    "title": 255,
    "company": 255,
    "location": 255,
    "exp_description": 5000,
    "skill": 100,
    "level": 100,
    "degree": 255,
    "institution": 255,
    "edu_description": 2000,
    "proj_name": 255,
    "proj_description": 3000,
    "url": 500,
    "cert_name": 255,
    "issuer": 255,
}

MAX_LIST_ITEMS = 30  # garde-fou anti-explosion (couvre tous les CV réels)

_CATEGORIES = ("hard_skill", "soft_skill")
_IMPORTANCES = ("Critical", "Important", "Nice to have")


class CVContentCoercionError(Exception):
    """Levée quand la sortie writer est inexploitable (ex. n'est pas un objet)."""


def _s(value: Any, cap: int) -> str:
    """Chaîne sûre : force le type, nettoie, plafonne."""
    if not isinstance(value, str):
        return ""
    return value.strip()[:cap]


def _opt(value: Any, cap: int) -> Optional[str]:
    """Chaîne optionnelle : '' et non-chaînes deviennent null."""
    s = _s(value, cap)
    return s or None


def _url(value: Any, cap: int) -> Optional[str]:
    """URL sûre : http(s) uniquement (neutralise javascript:/data:) ET sans caractère
    permettant un breakout d'attribut (espace, contrôle, guillemet, chevron)."""
    s = _s(value, cap)
    if s and _URL_SCHEME_RE.match(s) and not _URL_UNSAFE_RE.search(s):
        return s
    return None


def _date(value: Any) -> Optional[str]:
    """Date AAAA-MM validée, sinon null (le LLM n'a pas le droit d'inventer)."""
    if isinstance(value, str) and DATE_RE.match(value.strip()):
        return value.strip()
    return None


def _enum(value: Any, allowed: tuple[str, ...], default: str) -> str:
    """Valeur d'enum validée, sinon repli sûr."""
    if isinstance(value, str) and value in allowed:
        return value
    return default


def _str_list(value: Any, cap: int) -> list:
    """Liste de chaînes uniques (insensible à la casse), non vides, plafonnée à
    MAX_LIST_ITEMS éléments examinés (une seule borne, anti-explosion)."""
    if not isinstance(value, list):
        return []
    out: list = []
    seen: set = set()
    for item in value[:MAX_LIST_ITEMS]:
        s = _s(item, cap)
        if s and s.lower() not in seen:
            seen.add(s.lower())
            out.append(s)
    return out


def _dicts(value: Any) -> list:
    """Ne garde que les éléments dict d'une liste supposée (plafonnée)."""
    if not isinstance(value, list):
        return []
    return [x for x in value[:MAX_LIST_ITEMS] if isinstance(x, dict)]


def _id(value: Any, fallback: str) -> str:
    """Id restreint à [A-Za-z0-9._-] (defense-in-depth), sinon identifiant de repli."""
    s = _ID_DISALLOWED_RE.sub("", _s(value, CAPS["id"]))
    return s or fallback


def coerce_personal_info(pi: Any) -> dict:
    """Coerce un bloc `personal_info`, qu'il vienne de la sortie writer OU du profil.

    Exposé pour que le worker puisse ANCRER l'identité sur le profil vérifié : le LLM
    ne doit pas pouvoir changer le nom / email / contact affichés sur le CV via une
    injection (ADR-CONTENT-SCHEMA). Clés en liste blanche, types forcés, URL re-validée.
    """
    pi = pi if isinstance(pi, dict) else {}
    return {
        "first_name": _s(pi.get("first_name"), CAPS["first_name"]),
        "last_name": _s(pi.get("last_name"), CAPS["last_name"]),
        "email": _s(pi.get("email"), CAPS["email"]),
        "phone": _opt(pi.get("phone"), CAPS["phone"]),
        "linkedin": _url(pi.get("linkedin"), CAPS["linkedin"]),
        "address": _opt(pi.get("address"), CAPS["address"]),
        "city": _opt(pi.get("city"), CAPS["city"]),
        "postal_code": _opt(pi.get("postal_code"), CAPS["postal_code"]),
        "country": _opt(pi.get("country"), CAPS["country"]),
    }


def coerce_cv_content(raw: Any) -> tuple[dict, list]:
    """Coerce la sortie du rédacteur vers le GeneratedCVData canonique.

    Retourne (cv_content, warnings). Ne lève `CVContentCoercionError` que si
    l'entrée n'est pas un objet (inexploitable). Toute autre entrée, même absurde,
    produit une structure sûre (éventuellement vide).
    """
    if not isinstance(raw, dict):
        raise CVContentCoercionError("Sortie du rédacteur inexploitable (non-objet)")

    warnings: list = []

    personal_info = coerce_personal_info(raw.get("personal_info"))

    selected_experiences = []
    for i, e in enumerate(_dicts(raw.get("selected_experiences"))):
        title = _s(e.get("title"), CAPS["title"])
        company = _s(e.get("company"), CAPS["company"])
        if not title and not company:
            continue
        # start_date est requis ET patterné (AAAA-MM) par le contrat : sans date
        # valide, l'expérience ne peut satisfaire le schéma — on l'écarte plutôt
        # que de faire échouer tout le CV sur une seule entrée corrompue.
        start_date = _date(e.get("start_date"))
        if start_date is None:
            warnings.append("Expérience ignorée : date de début manquante ou invalide")
            continue
        selected_experiences.append(
            {
                "id": _id(e.get("id"), f"exp-{i + 1}"),
                "title": title,
                "company": company,
                "location": _opt(e.get("location"), CAPS["location"]),
                "start_date": start_date,
                "end_date": _date(e.get("end_date")),
                "description": _s(e.get("description"), CAPS["exp_description"]),
                "highlighted_skills": _str_list(
                    e.get("highlighted_skills"), CAPS["skill"]
                ),
            }
        )

    highlighted_skills = []
    for s in _dicts(raw.get("highlighted_skills")):
        name = _s(s.get("name"), CAPS["skill"])
        if not name:
            continue
        highlighted_skills.append(
            {
                "name": name,
                "level": _opt(s.get("level"), CAPS["level"]),
                "category": _enum(s.get("category"), _CATEGORIES, "hard_skill"),
                "importance": _enum(s.get("importance"), _IMPORTANCES, "Important"),
            }
        )

    selected_educations = []
    for i, e in enumerate(_dicts(raw.get("selected_educations"))):
        degree = _s(e.get("degree"), CAPS["degree"])
        institution = _s(e.get("institution"), CAPS["institution"])
        if not degree and not institution:
            continue
        selected_educations.append(
            {
                "id": _id(e.get("id"), f"edu-{i + 1}"),
                "degree": degree,
                "institution": institution,
                "end_date": _date(e.get("end_date")),
                "description": _opt(e.get("description"), CAPS["edu_description"]),
            }
        )

    selected_projects = []
    for i, p in enumerate(_dicts(raw.get("selected_projects"))):
        name = _s(p.get("name"), CAPS["proj_name"])
        if not name:
            continue
        selected_projects.append(
            {
                "id": _id(p.get("id"), f"proj-{i + 1}"),
                "name": name,
                "description": _s(p.get("description"), CAPS["proj_description"]),
                "url": _url(p.get("url"), CAPS["url"]),
                "completion_date": _date(p.get("completion_date")),
                "relevant_skills": _str_list(p.get("relevant_skills"), CAPS["skill"]),
            }
        )

    selected_certifications = []
    for i, c in enumerate(_dicts(raw.get("selected_certifications"))):
        name = _s(c.get("name"), CAPS["cert_name"])
        if not name:
            continue
        selected_certifications.append(
            {
                "id": _id(c.get("id"), f"cert-{i + 1}"),
                "name": name,
                "issuer": _s(c.get("issuer"), CAPS["issuer"]),
                "issue_date": _date(c.get("issue_date")),
                "url": _url(c.get("url"), CAPS["url"]),
            }
        )

    content = {
        "personal_info": personal_info,
        "summary": _s(raw.get("summary"), CAPS["summary"]),
        "selected_experiences": selected_experiences,
        "highlighted_skills": highlighted_skills,
        "selected_educations": selected_educations,
        "selected_projects": selected_projects,
        "selected_certifications": selected_certifications,
    }
    # `optimization_notes` est volontairement absent (champ interne, jamais rendu).
    return content, warnings


def is_cv_content_conformant(cv_data_json: Any) -> tuple[bool, str]:
    """Indique si un `cv_data_json` déjà stocké est conforme ET sûr (lecture seule).

    Un contenu est conforme si (1) il est coercible, (2) la coercition ne le modifie
    pas (déjà canonique : pas de champ interne, pas d'URL dangereuse, pas de clé hors
    schéma, pas de doublon) et (3) il valide le schéma canonique. Sert au script de
    décompte M0-T05 pour chiffrer les CV V1 à traiter (backfill vs coercition au
    rendu) — décision PAH-M0. Ne lève jamais.

    Le test (2) est une égalité round-trip STRICTE : la coercition ajoute les clés
    optionnelles absentes à `null`, donc un CV V1 légitime mais partiel ressort
    « non-canonique » sans être dangereux. Le décompte est donc une BORNE HAUTE
    (conservatrice) de la population à traiter, pas le compte exact des CV à risque.
    """
    try:
        coerced, _ = coerce_cv_content(cv_data_json)
    except CVContentCoercionError:
        return False, "non-coercible (sortie inexploitable)"
    if coerced != cv_data_json:
        return False, "non-canonique ou contenu à risque (nettoyé par coercition)"
    # Validation fine du schéma : seule dépendance Pydantic, importée paresseusement.
    try:
        from pydantic import ValidationError

        from app.generated.models import GeneratedCVData

        GeneratedCVData.model_validate(cv_data_json)
    except ValidationError:
        return False, "invalide au schéma canonique"
    return True, "conforme"
