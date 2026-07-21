"""
Coercition du JSON produit par le LLM vers le ProfileData canonique.

Ce module est la ceinture de sécurité APRÈS l'appel Gemini : quel que soit ce
que le modèle renvoie (clés inventées, types faux, valeurs hors contraintes,
tentative d'injection ayant altéré la sortie), seul ce qui correspond
STRICTEMENT au schéma canonique en ressort — clés en liste blanche, types
forcés, longueurs plafonnées (contraintes du contrat), dates re-validées
(AAAA-MM sinon null), ids assignés par le système.

Volontairement sans dépendance (ni Vertex, ni Pydantic) pour être testable
partout, y compris dans la CI backend.
"""

import re
from typing import Any, Optional

DATE_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")

# Plafonds issus du contrat canonique (contracts/openapi.yaml).
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
    "title": 255,
    "company": 255,
    "location": 255,
    "exp_description": 5000,
    "degree": 255,
    "institution": 255,
    "field": 255,
    "edu_description": 2000,
    "grade": 100,
    "skill": 100,
    "achievement": 500,
    "lang": 100,
    "proj_name": 255,
    "proj_description": 3000,
    "role": 255,
    "url": 500,
    "cert_name": 255,
    "issuer": 255,
    "credential_id": 255,
    "credential_url": 500,
}

MAX_LIST_ITEMS = 30  # garde-fou anti-explosion (30 expériences suffisent à tous)


def neutralize_fences(text: str) -> str:
    """Neutralise toute tentative de fermer/rouvrir la clôture <document> depuis
    le contenu du PDF (défense anti-injection, même principe que l'analyseur)."""
    return re.sub(r"</?\s*document\s*>", "", text, flags=re.IGNORECASE)


def _s(value: Any, cap: int) -> str:
    """Chaîne sûre : force le type, nettoie, plafonne."""
    if not isinstance(value, str):
        return ""
    return value.strip()[:cap]


def _opt(value: Any, cap: int) -> Optional[str]:
    """Chaîne optionnelle : '' et non-chaînes deviennent null."""
    s = _s(value, cap)
    return s or None


def _date(value: Any) -> Optional[str]:
    """Date AAAA-MM validée, sinon null (le LLM n'a pas le droit d'inventer)."""
    if isinstance(value, str) and DATE_RE.match(value.strip()):
        return value.strip()
    return None


def _str_list(value: Any, cap: int) -> list:
    """Liste de chaînes uniques, non vides, plafonnées."""
    if not isinstance(value, list):
        return []
    out, seen = [], set()
    for item in value[:MAX_LIST_ITEMS]:
        s = _s(item, cap)
        if s and s.lower() not in seen:
            seen.add(s.lower())
            out.append(s)
    return out


def coerce_profile(raw: Any) -> tuple[dict, list]:
    """Coerce la sortie LLM vers le ProfileData canonique.

    Retourne (profile_data, warnings). Ne lève jamais : une entrée absurde
    produit un profil vide + warnings.
    """
    warnings: list = []
    if not isinstance(raw, dict):
        return _empty_profile(), [
            "Structuration impossible : sortie du modèle inexploitable"
        ]

    pi = raw.get("personal_info") if isinstance(raw.get("personal_info"), dict) else {}
    personal_info = {
        "first_name": _s(pi.get("first_name"), CAPS["first_name"]),
        "last_name": _s(pi.get("last_name"), CAPS["last_name"]),
        "email": _s(pi.get("email"), CAPS["email"]),
        "phone": _opt(pi.get("phone"), CAPS["phone"]),
        "linkedin": _opt(pi.get("linkedin"), CAPS["linkedin"]),
        "address": _opt(pi.get("address"), CAPS["address"]),
        "city": _opt(pi.get("city"), CAPS["city"]),
        "postal_code": _opt(pi.get("postal_code"), CAPS["postal_code"]),
        "country": _opt(pi.get("country"), CAPS["country"]),
    }

    experiences = []
    for i, e in enumerate(_dicts(raw.get("experiences"))):
        title = _s(e.get("title"), CAPS["title"])
        company = _s(e.get("company"), CAPS["company"])
        if not title and not company:
            continue  # entrée vide/bruit
        experiences.append(
            {
                "id": f"imp-exp-{i + 1}",
                "title": title,
                "company": company,
                "location": _opt(e.get("location"), CAPS["location"]),
                "start_date": _date(e.get("start_date")) or "",
                "end_date": _date(e.get("end_date")),
                "is_current": bool(e.get("is_current")),
                "description": _s(e.get("description"), CAPS["exp_description"]),
                "achievements": _str_list(e.get("achievements"), CAPS["achievement"]),
            }
        )

    educations = []
    for i, e in enumerate(_dicts(raw.get("educations"))):
        degree = _s(e.get("degree"), CAPS["degree"])
        institution = _s(e.get("institution"), CAPS["institution"])
        if not degree and not institution:
            continue
        educations.append(
            {
                "id": f"imp-edu-{i + 1}",
                "degree": degree,
                "institution": institution,
                "location": _opt(e.get("location"), CAPS["location"]),
                "field": _opt(e.get("field"), CAPS["field"]),
                "start_date": _date(e.get("start_date")),
                "end_date": _date(e.get("end_date")),
                "description": _opt(e.get("description"), CAPS["edu_description"]),
                "grade": _opt(e.get("grade"), CAPS["grade"]),
            }
        )

    sk = raw.get("skills") if isinstance(raw.get("skills"), dict) else {}
    skills = {
        "hard": _str_list(sk.get("hard"), CAPS["skill"]),
        "soft": _str_list(sk.get("soft"), CAPS["skill"]),
    }

    languages = []
    for lang in _dicts(raw.get("languages")):
        name = _s(lang.get("name"), CAPS["lang"])
        if not name:
            continue
        languages.append(
            {
                "name": name,
                "level": _s(lang.get("level"), CAPS["lang"]) or "Non précisé",
            }
        )

    projects = []
    for i, p in enumerate(_dicts(raw.get("projects"))):
        name = _s(p.get("name"), CAPS["proj_name"])
        if not name:
            continue
        projects.append(
            {
                "id": f"imp-proj-{i + 1}",
                "name": name,
                "description": _s(p.get("description"), CAPS["proj_description"]),
                "role": _opt(p.get("role"), CAPS["role"]),
                "url": _opt(p.get("url"), CAPS["url"]),
                "start_date": _date(p.get("start_date")),
                "end_date": _date(p.get("end_date")),
                "technologies": _str_list(p.get("technologies"), CAPS["skill"]),
            }
        )

    certifications = []
    for i, c in enumerate(_dicts(raw.get("certifications"))):
        name = _s(c.get("name"), CAPS["cert_name"])
        if not name:
            continue
        certifications.append(
            {
                "id": f"imp-cert-{i + 1}",
                "name": name,
                "issuer": _s(c.get("issuer"), CAPS["issuer"]),
                "issue_date": _date(c.get("issue_date")),
                "expiration_date": _date(c.get("expiration_date")),
                "credential_id": _opt(c.get("credential_id"), CAPS["credential_id"]),
                "credential_url": _opt(c.get("credential_url"), CAPS["credential_url"]),
            }
        )

    profile = {
        "personal_info": personal_info,
        "summary": _s(raw.get("summary"), CAPS["summary"]),
        "experiences": experiences,
        "educations": educations,
        "skills": skills,
        "languages": languages,
        "projects": projects,
        "certifications": certifications,
    }

    # Avertissements de complétude (aident l'utilisateur à la relecture).
    if not personal_info["first_name"] and not personal_info["last_name"]:
        warnings.append("Nom non détecté — à compléter manuellement")
    if not experiences:
        warnings.append("Aucune expérience détectée")
    if not skills["hard"] and not skills["soft"]:
        warnings.append("Aucune compétence détectée")

    return profile, warnings


def _dicts(value: Any) -> list:
    """Ne garde que les éléments dict d'une liste supposée."""
    if not isinstance(value, list):
        return []
    return [x for x in value[:MAX_LIST_ITEMS] if isinstance(x, dict)]


def _empty_profile() -> dict:
    return {
        "personal_info": {
            "first_name": "",
            "last_name": "",
            "email": "",
            "phone": None,
            "linkedin": None,
            "address": None,
            "city": None,
            "postal_code": None,
            "country": None,
        },
        "summary": "",
        "experiences": [],
        "educations": [],
        "skills": {"hard": [], "soft": []},
        "languages": [],
        "projects": [],
        "certifications": [],
    }
