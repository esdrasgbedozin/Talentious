# Agents IA - Talentious

Ce dossier contient les agents intelligents qui alimentent les fonctionnalités IA de Talentious.

## Structure

```
agents/
├── parser-pdf/         # Agent d'extraction de CV
├── analyseur-offre/    # Agent d'analyse d'offres d'emploi
└── redacteur-cv/       # Agent de génération de CV
```

## Technologies

- **Vertex AI** - Plateforme IA de Google Cloud
- **Gemini** - Modèle de langage de Google
- **LangChain** - Framework pour applications LLM
- **Python** - Langage de programmation

## Développement

Chaque agent est un module Python indépendant qui peut être :
- Développé et testé isolément
- Déployé comme service distinct
- Appelé par le backend via des APIs internes

## Prochaines étapes

Les agents seront développés dans la Phase 2 de la roadmap.
