# ADR-GENAI-SDK — Migration vers le SDK `google-genai` + Gemini 3.x (endpoint UE)

- **Statut** : Proposé (2026-08-10) — en attente de validation du fondateur (points § « Décisions à valider »)
- **Décideur** : fondateur
- **Contexte technique** : agents `parser-pdf`, `analyseur-offre`, `redacteur-cv` ; Vertex AI (Gemini) ; projet `talentious-project`.
- **Remplace/complète** : [ADR-MODEL](ADR-MODEL.md) (choix `gemini-2.5-pro @ europe-west9`, qui prévoyait ce chantier).

## Contexte

Deux forces convergent et rendent la migration nécessaire :

1. **Dépréciation régionale annoncée par Google Cloud (mail du 2026-08-08, projet `talentious-project`).**
   Les endpoints régionaux *in-country* de Gemini 2.5 (Flash **et** Pro) — dont **`europe-west9` (France)** — sont retirés le **6 août 2027**. Point crucial du mail :
   > « After this change, in-country ML processing will no longer be available in … europe-west9 (France) … under any Gemini model. »
   Donc après cette date, **aucun modèle Gemini ne fera de traitement IA en France**. Jalons : période de migration recommandée **20 oct. 2026 → 27 jan. 2027** ; **hausse « significative » des prix à partir du 28 jan. 2027** ; coupure dure le **6 août 2027**.

2. **Fin de vie de la famille 2.5 + limites du SDK actuel.** Les modèles 3.x exigent le SDK `google-genai` (l'actuel `google-cloud-aiplatform==1.73.0` / `vertexai` ne les sert pas). Par ailleurs, le « thinking » non maîtrisable des 2.5 avec ce SDK nous a déjà coûté deux incidents (troncature JSON → contournement `max_output_tokens=32k`).

Le fondateur a demandé (2026-08-10) d'exécuter la migration **maintenant, sans attendre les échéances**, mais « en bonne et due forme ».

### Faits vérifiés (2026-08-10, sources en fin d'ADR)

- **Gemini 3.5 Flash est disponible sur l'endpoint UE multi-région** (`aiplatform.eu.rep.googleapis.com`) ; les requêtes sont **routées exclusivement dans la géographie UE** et couvertes par le DPA Vertex (résidence des données « DRZ » supportée sur les multi-régions US/EU/global — l'endpoint **global n'offre AUCUNE garantie de résidence**).
- **Il n'existe pas encore d'endpoint mono-région `europe-west*` pour la famille 3.x** : la résidence UE passe par le **multi-région `eu`**, pas par un confinement France-seule.
- **Les « thought signatures » ne concernent PAS nos appels.** Elles sont obligatoires pour le *function-calling multi-tour* ; « single-turn generation (no tools) works correctly, you don't need to handle thought signatures ». Nos 3 agents font du **mono-tour** (une requête → un JSON, sans outils ni conversation). ⇒ pas de circulation de signatures à implémenter.
- **Le SDK `google-genai` cible Vertex** via `genai.Client(vertexai=True, project=…, location=…)` puis `client.models.generate_content(model=…, …)`. La 3.x expose un contrôle du raisonnement (`thinking_level`), qui **remplace proprement notre contournement 32k**.

## Décision (proposée)

**Migrer les 3 agents de `vertexai` (google-cloud-aiplatform) vers `google-genai`, sur `Gemini 3.5 Flash`, via l'endpoint UE multi-région (`eu`).**

1. **SDK** : remplacer `google-cloud-aiplatform` par `google-genai` dans les 3 agents ; réécrire l'appel (`genai.Client(vertexai=True, location="eu")` + `client.models.generate_content`), en conservant le mode JSON forcé (`response_mime_type="application/json"`) et la coercition post-LLM existante.
2. **Modèle** : **`gemini-3.5-flash` par défaut** sur les 3 agents. **Arbitrage par les evals** (juge LLM) : si le `redacteur-cv` régresse en qualité vs `2.5-pro`, basculer CET agent sur `gemini-3.5-pro` (variable `VERTEX_AI_MODEL` déjà externalisée par agent). L'extracteur (`parser-pdf`) est une transcription → Flash suffit.
3. **Région / résidence** : `GCP_LOCATION` passe de `europe-west9` à **`eu` (multi-région)** pour les appels Gemini. **Le stockage reste en `europe-west9`** (Cloud SQL, GCS) : seul le *traitement IA* se déplace, à l'intérieur de l'UE.
4. **Thinking** : utiliser `thinking_level` (3.x) pour cadrer le raisonnement ; **retirer le contournement `max_output_tokens=32k`** une fois validé.
5. **Thought signatures** : **non implémentées** (hors périmètre : mono-tour sans outils). Décision consignée pour éviter une sur-ingénierie.

## Décisions à valider par le fondateur

1. **Souveraineté & communication (le seul vrai choix produit).** Après migration, le **traitement IA n'est plus « en France » mais « en UE »** (le stockage, lui, reste en France). Les affirmations France-strictes de la landing doivent être ajustées :
   - `HomeClient.tsx` : « IA souveraine · Hébergée en France », « Ton parcours ne quitte pas la France », « Serveurs GCP en France (europe-west9) », « Fièrement hébergé en France 🇫🇷 ».
   - **Formulation proposée** (honnête et défendable) : « **Données hébergées en France, traitements IA en Europe — conforme RGPD, aucune donnée ne quitte l'UE** ». Cohérent avec la contrainte « géographie UE » déjà actée en ADR-MODEL.
2. **Flash par défaut** (coût/pérennité) avec bascule Pro du seul rédacteur si les evals l'exigent — OK ?

## Conséquences

- **Coût** : `gemini-3.5-flash` est nettement moins cher que `2.5-pro` (potentiellement −70 à −80 % par appel) — gain, pas surcoût, si la qualité tient.
- **Qualité** : à **mesurer** (juge LLM, harnais `backend/evals/`) avant/après, par agent. Aucune bascule prod sans non-régression démontrée.
- **Souveraineté** : passe de « France stricte » à « **UE** » (RGPD standard) — perte du sous-argument France-seule, conforme à la décision ADR-MODEL.
- **Code** : réécriture de la couche Vertex des 3 agents (`extractor_service.py`, services équivalents analyseur/rédacteur), `requirements.txt`, images Docker (résout au passage le conflit de namespace `google.*` qui bloquait `google-genai`). Simplification : suppression du contournement 32k.
- **Infra** : `GCP_LOCATION=eu` (agents) via Terraform + docker-compose ; le rôle `roles/aiplatform.user` par SA reste valable.
- **Marketing/légal** : mise à jour de la landing (voir décision 1).

## Plan de migration (incréments TDD, un commit par étape)

0. **Spike de connectivité** (jetable) : confirmer l'appel réel `google-genai` → `gemini-3.5-flash` sur l'endpoint UE (`location="eu"` vs base_url REP `aiplatform.eu.rep.googleapis.com`) depuis une image agent. Bloquant : valide la faisabilité avant tout le reste.
1. **Un agent pilote = `parser-pdf`** (le mieux outillé en tests de coercition) : bascule SDK + modèle + région, tests unitaires verts, extraction réelle sur les fixtures.
2. **Evals du rédacteur** : mesurer `2.5-pro` (référence) vs `3.5-flash` vs `3.5-pro` via le juge LLM ; trancher le modèle du rédacteur sur données.
3. **Généraliser** aux `analyseur-offre` et `redacteur-cv` (modèle retenu à l'étape 2).
4. **Infra** : `GCP_LOCATION=eu`, `VERTEX_AI_MODEL` par agent (Terraform + compose), retrait du contournement 32k.
5. **Marketing/docs** : landing (wording UE), Bible/Architecture/ONBOARDING, correction de l'échéance (« oct. 2026 » → jan./août 2027).
6. **Déploiement** : pipeline `main` → prod, puis smoke réel (import + génération + export) sur talentious.app.

## Validation

- Non-régression qualité par le **juge LLM** (`backend/evals/`) par agent, seuil : ≥ qualité `2.5-pro` actuelle.
- Tests unitaires agents verts (coercition, JSON mode).
- Smoke e2e réel en prod.

## Rollback

`VERTEX_AI_MODEL` et `GCP_LOCATION` sont des variables : retour à `gemini-2.5-pro @ europe-west9` possible tant que ces endpoints vivent (jusqu'au 6 août 2027). La migration est donc réversible côté modèle/région ; le SDK, lui, se revert par `git revert`. **À faire bien avant le 28 jan. 2027** (hausse de prix) pour garder cette porte de sortie sans surcoût.

## Alternatives écartées

- **Endpoint `global` pour Gemini 3.x** — écarté : aucune garantie de résidence des données (contredit le RGPD/souveraineté).
- **Attendre les échéances (oct. 2026 / 2027)** — écarté : le fondateur veut sécuriser tôt ; migrer maintenant garde le rollback gratuit et évite la hausse de prix.
- **Chercher un LLM tiers résident-France (ex. Mistral sur Vertex)** — non retenu à ce stade : Gemini UE satisfait la contrainte « géographie UE » déjà actée ; réévaluable si une exigence France-stricte réapparaissait.

## Sources

- Mail Google Cloud « deprecation of specific in-country regional endpoints for Gemini 2.5 » (2026-08-08).
- [Vertex AI data residency](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency) · [Gemini Enterprise locations](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/locations)
- [Thought signatures (Gemini Enterprise)](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thought-signatures) · [Gemini 3 developer guide](https://ai.google.dev/gemini-api/docs/gemini-3)
- [Google Gen AI Python SDK (`google-genai`)](https://github.com/googleapis/python-genai)
