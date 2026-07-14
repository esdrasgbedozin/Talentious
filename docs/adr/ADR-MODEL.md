# ADR-MODEL — Choix du modèle Vertex AI pour l'analyse d'offre et la rédaction de CV

- **Statut** : Accepté (2026-07-09)
- **Décideur** : fondateur (point d'arrêt [PAH-2])
- **Contexte technique** : agents `analyseur-offre` et `redacteur-cv`, Vertex AI, projet `talentious-project`.

## Contexte

Le point de douleur historique du produit est la qualité de génération des CV. Deux
leviers : le modèle et les prompts. La roadmap M2 vise une amélioration mesurable
(≥ 15 % au harnais d'evals). Trois faits cadrent la décision :

1. **Contrainte de souveraineté** — tranchée par le fondateur : la contrainte est
   **« géographie UE » (RGPD standard)**, pas un confinement strict à la France.
2. **Dépréciation de la famille Gemini 2.5** — retrait annoncé sur Agent Platform
   au plus tôt le 16 octobre 2026 ; les SDK Agent Platform post-juin 2026 ne
   supporteront plus 2.x (migration obligatoire vers le SDK `google-genai`).
3. **Disponibilité réelle vérifiée empiriquement (2026-07-09)** sur ce projet :
   - `gemini-2.5-pro` : **fonctionne en `europe-west9` (Paris)** avec le SDK
     `vertexai` actuel, sans changement de code.
   - `gemini-3.5-flash` et `gemini-3-flash` : **404 dans toutes les régions Vertex**
     avec le SDK `vertexai`. Ces modèles 3.x exigent le SDK `google-genai`
     (endpoint global/EU), dont l'installation dans les images agents échoue
     aujourd'hui sur un conflit de namespace `google.*` — reachability du modèle
     pour ce projet non confirmée.

## Décision

**Basculer immédiatement l'analyse et la rédaction sur `gemini-2.5-pro`, en
`europe-west9`**, via la variable d'environnement `VERTEX_AI_MODEL` (déjà externalisée).

- Satisfait la contrainte UE (mieux : Paris strict, sans surcoût d'endpoint non-global).
- Gain de qualité attendu sur le suivi d'instructions complexes et la rédaction
  soutenue en français ; **à valider par les evals avant/après** (juge LLM).
- Aucun changement de SDK ni de code : maîtrise du risque.

**La cible idéale reste `gemini-3.5-flash`** (meilleure qualité/pérennité), mais son
adoption est **différée à un chantier dédié** (voir ADR-GENAI-SDK à créer) car elle
impose la migration `vertexai → google-genai`. Cette migration est de toute façon
**imposée avant octobre 2026** par la fin de vie de la famille 2.5.

## Conséquences

- **Coût** : ~4× le coût de `gemini-2.5-flash` (~$0.19 vs ~$0.045 par génération).
  Le pipeline étant asynchrone, le **mode batch** (−50 % sur 2.5-pro) est exploitable
  pour ramener le surcoût à ~2× si besoin.
- **Latence** : ~2-3× celle de flash — non bloquant (pipeline asynchrone, polling/SSE).
- **Dette / risque** : la famille 2.5 sera retirée (≥ oct. 2026). Un chantier de
  migration `google-genai` + `gemini-3.5-flash` doit être planifié et exécuté avant
  cette échéance. Il faudra alors gérer les « thought signatures » 3.x et revalider
  le JSON mode.
- **Implémentation** : `VERTEX_AI_MODEL=gemini-2.5-pro` par défaut dans
  `docker-compose.yml` ; validation du nom de modèle au démarrage des agents.

## Alternatives écartées

- **`gemini-3.5-flash` (EU multi-région) maintenant** — écarté : nécessite la migration
  SDK `google-genai` (chantier + risque), reachability non confirmée. Reporté proprement.
- **Rester sur `gemini-2.5-flash` + ingénierie de prompts seule** — écarté comme choix
  unique : le pro-tier apporte un gain sur la complexité d'instructions ; mais l'amélioration
  des prompts reste complémentaire et sera menée en parallèle (M2-T06).
- **`gemini-2.5-pro` en Paris strict comme fin en soi** — la souveraineté Paris est un
  bonus, pas l'objectif : la cible pérenne reste 3.x en UE.

## Suivi

- [ ] Mesurer le gain 2.5-flash → 2.5-pro via le juge LLM sur le harnais d'evals (M2-T05).
- [ ] Créer **ADR-GENAI-SDK** : migration `vertexai → google-genai` + `gemini-3.5-flash`,
      à exécuter avant la fin de vie 2.5 (oct. 2026).
