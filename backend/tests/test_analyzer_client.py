"""
Garde-fou d'intégration agent -> backend : le client `AnalysisResult` doit
accepter la sortie RÉELLE de l'agent analyseur-offre.

Régression du 2026-11-08 : l'agent (M5-T01, PR #77) a ajouté le champ `keywords`
à sa réponse ; côté backend, `AnalysisResult(**result)` (analyzer_client) levait
`TypeError: unexpected keyword argument 'keywords'` -> la génération de CV
échouait (le worker marquait le job FAILED). Les tests backend moquaient
`analyze_text`, donc l'écart agent/backend n'était pas couvert. Le contrat de
l'agent est ADDITIF : un nouveau champ de sortie ne doit JAMAIS casser ce client.
"""

from app.services.analyzer_client import AnalysisResult


def test_accepte_la_sortie_agent_avec_keywords():
    result = {
        "hard_skills": [{"name": "Python", "importance": "Critical"}],
        "soft_skills": [],
        "seniority_level": "Senior",
        "key_responsibilities": ["Concevoir des microservices"],
        "tone": "innovant",
        "keywords": [
            {
                "name": "Python",
                "category": "hard_skill",
                "importance": "Critical",
                "aliases": ["py"],
            }
        ],
    }
    analysis = AnalysisResult(**result)  # ne doit PAS lever
    assert analysis.keywords == result["keywords"]
    assert analysis.to_dict()["keywords"] == result["keywords"]


def test_retrocompatible_sans_keywords():
    # Analyse mise en cache AVANT l'ajout du champ : pas de `keywords`.
    analysis = AnalysisResult(
        hard_skills=[],
        soft_skills=[],
        seniority_level="Mid-level",
        key_responsibilities=[],
        tone="neutre",
    )
    assert analysis.keywords == []
    assert analysis.to_dict()["keywords"] == []


def test_forward_compatible_champ_inconnu():
    # Contrat additif : un champ futur non modélisé est ignoré, pas une erreur.
    analysis = AnalysisResult(
        hard_skills=[],
        soft_skills=[],
        seniority_level="Lead",
        key_responsibilities=[],
        tone="x",
        keywords=[],
        champ_futur_inconnu=123,
    )
    assert analysis.seniority_level == "Lead"
