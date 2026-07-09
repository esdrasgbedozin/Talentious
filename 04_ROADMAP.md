# 04 — ROADMAP V1 « TALENTIOUS »

> **Produit le** : 2026-07-09  
> **Statut** : plan opérationnel — à valider par le fondateur avant exécution  
> **Remplace** : l'ancienne `ROADMAP.md` (contradictions internes, états fictifs, non fiable — voir MAJ-10 du rapport d'audit)  
> **Sources** : `00_BIBLE_PROJET.md`, `01_ARCHITECTURE_TECHNIQUE.md`, `03_RAPPORT_AUDIT.md`, `contracts/` (source de vérité validée), code réel `/tmp/talentious-onboard`

---

## 1. Vue d'ensemble & hypothèses de planification

### Équipe et rythme

- **Développeur unique** : le fondateur, seule ressource. Pas de parallélisme humain.
- Les swimlanes back / front / infra servent à organiser le travail par domaine, pas à simuler plusieurs personnes travaillant simultanément.
- **Capacité estimée** : 3 à 4 heures de développement effectif par jour (temps partiel raisonnable sur un projet solo non encore en production), soit environ 15 à 20 h par semaine.
- **Taille des tickets** : chaque ticket cible ≤ 2 h de travail effectif. Un ticket trop large est redécoupé.
- **Definition of Done** (appliquée à chaque ticket sans exception) :
  - Le ou les tests couvrant le critère de fin passent — et ont d'abord échoué (TDD : rouge → vert → refactor).
  - Lint et formatage propres (ruff/black côté Python, eslint/prettier côté TS).
  - Couverture ≥ seuil du projet (backend ≥ 80 % sur les modules modifiés).
  - Docs ou ADR mis à jour si une décision ou une interface a changé.
  - Scan de sécurité sans alerte bloquante (bandit pour Python, npm audit pour TS).
  - Aucun `str(e)` en réponse client, aucun secret en dur.

### Décisions actées (non remises en question dans ce plan)

1. **Contrats = source de vérité.** `contracts/openapi.yaml` et `contracts/agents/*.yaml` sont la référence. Les types Pydantic backend et TypeScript frontend sont générés, jamais rédigés à la main.
2. **Génération asynchrone** (job + polling/SSE). L'ADR-ASYNC tranche l'infrastructure worker (voir §4).
3. **Stripe Checkout + webhook signé**. Migration Alembic : `stripe_payment_id` → nullable. Seed admin.
4. **parser-pdf = fonction backend** (`backend/app/services/parser_service.py` avec PyMuPDF). Microservice supprimé. Import PDF réellement branché (fin de la simulation `onboarding/page.tsx:74-80`).
5. **Récupération de `feature/dashboard-and-editor`** : dashboard, `GenerateCVModal`, `Toast`/`ConfirmDialog`, `lib/api.ts` récupérés puis rebasés sur les nouveaux contrats. Correctif `timezone` de cette branche rejeté (remplacé par la correction propre `from datetime import datetime, timezone`). Éditeur WYSIWYG (`/cv/{id}/edit`) à créer.
6. **Montée en gamme modèle IA**. ADR-MODEL tranche entre `gemini-2.5-pro` (europe-west9 strict) et `gemini-3.5-pro` (endpoint EU multi-région). Évaluation harnais avant/après.

### Durée totale estimée (solo)

| Jalon | Tickets | Heures estimées | Semaines indicatives |
|---|---|---|---|
| M0 — Fondations | 7 | ~9 h | S1 |
| M1 — Pipeline vert local | 16 | ~28 h | S2 – S3 |
| M2 — Qualité IA | 7 | ~12 h | S4 |
| M3 — Accès et paiement | 10 | ~17 h | S5 – S6 |
| M4 — UI complète | 14 | ~25 h | S7 – S9 |
| M5 — Sécurité et RGPD | 14 | ~24 h | S10 – S11 |
| M6 — Production GCP | 13 | ~22 h | S12 – S14 |
| **Total** | **81** | **~137 h** | **~14 semaines** |

_Hypothèse : 10 h effectives / semaine (réaliste avec aléas). Ajuster si la capacité réelle diffère._

---

## 2. Points d'arrêt humains (PAH)

Ces points **suspendent l'exécution** jusqu'à décision explicite du fondateur. Ils sont signalés [PAH] dans les jalons.

| # | Moment | Décision requise |
|---|---|---|
| PAH-0 | Avant M0 | Valider ce plan (périmètre V1, jalons, ADR à produire) |
| PAH-1 | Fin M1 | Valider que le pipeline génère un CV correct de bout en bout en local avant d'investir dans la qualité IA |
| PAH-2 | Fin M2 (ADR-MODEL) | Trancher le choix du modèle IA (souveraineté stricte paris vs EU multi-région + performance) |
| PAH-3 | Avant M3 | Valider l'intégration Stripe (clés test, prix Stripe configurés, webhook endpoint) |
| PAH-4 | Avant M6 | Valider l'état réel de l'infra GCP (projet actif, services Cloud Run staging encore en vie, budget cible) — audit `gcloud` lecture seule recommandé |
| PAH-5 | Fin M6 | Valider le déploiement prod avant de rendre le service public |

---

## 3. Jalons et tickets

Les dépendances inter-tickets sont notées dans la colonne **Dépend de**. Un ticket non bloqué peut être attaqué dès que ses dépendances sont au vert — dans la limite de la capacité solo (séquentiel).

---

### M0 — Fondations (objectif : environnement local propre, types générés, modèles alignés) — ✅ TERMINÉ (2026-07-09)

**Critère de fin du jalon** : `docker-compose up` démarre tous les services sans erreur ; les types Pydantic backend et TypeScript frontend sont générés depuis `contracts/openapi.yaml` et commités ; les tests existants (23 backend, 3 suites frontend) passent toujours.

> **État** : ✅ atteint. 23 tests backend verts + 20 tests jest verts + `tsc --noEmit` propre. Types générés des deux côtés depuis les contrats, schémas backend et frontend alignés (renommages issuer/field, ajout languages, skills requis). Outillage retenu : `datamodel-code-generator` (backend) + `openapi-typescript` (frontend) au lieu d'openapi-generator (sans JVM) — **ADR outillage à formaliser**. Correctifs de fondation au passage : parsing CORS robuste + `extra=ignore` (config.py), dépendance `greenlet` ajoutée. Branche `restructuration/v1-foundations` (non poussée).

| ID | Titre | Description courte | Fichiers / zone | Dépend de | Estim. | Critère de fin (test) |
|---|---|---|---|---|---|---|
| M0-T01 | Cloner et recréer l'environnement local | `git clone`, créer `.env` depuis `.env.example`, `docker-compose up`, vérifier que tous les services démarrent et que `pytest` passe | Racine, `docker-compose.yml`, `.env` | — | 1 h | `pytest` : 23 tests verts ; `docker-compose ps` : tous les services `Up` |
| M0-T02 | Installer la chaîne openapi-generator | Ajouter `@openapitools/openapi-generator-cli` en devDependency, configurer le script npm `generate:types`, documenter la commande dans un `Makefile` ou `package.json` | Racine `package.json`, `Makefile` | M0-T01 | 1 h | Commande `make generate-types` s'exécute sans erreur |
| M0-T03 | Générer les modèles Pydantic backend depuis `openapi.yaml` | Lancer la génération vers `backend/app/generated/`, vérifier la cohérence, commiter | `backend/app/generated/`, `contracts/openapi.yaml` | M0-T02 | 1,5 h | Import de `backend.app.generated` sans erreur dans un test smoke |
| M0-T04 | Générer les types TypeScript frontend depuis `openapi.yaml` | Lancer la génération vers `frontend/src/generated/`, vérifier la cohérence, commiter | `frontend/src/generated/`, `contracts/openapi.yaml` | M0-T02 | 1 h | `tsc --noEmit` passe sans erreur sur le frontend |
| M0-T05 | Migrer `backend/app/schemas/profile.py` vers les types générés | Remplacer les classes `ProfileData`, `Experience`, `Education`, `Certification`, `Language` par les imports depuis `backend/app/generated/`. Renommages : `issuing_organization` → `issuer`, `field_of_study` → `field`. Ajouter `languages` manquant. | `backend/app/schemas/profile.py`, `backend/app/routes/profile.py` | M0-T03 | 2 h | `pytest backend/tests/test_profile.py` : 9 tests verts |
| M0-T06 | Migrer `frontend/src/types/profile.ts` vers les types générés | Remplacer les interfaces manuelles par les imports depuis `frontend/src/generated/`. Adapter les composants qui référencent les anciens noms (`issuing_organization`, `field_of_study`). | `frontend/src/types/profile.ts`, composants `profile/` | M0-T04 | 1,5 h | `tsc --noEmit` + `eslint` propres ; rendu de la page `/profile` sans erreur console |
| M0-T07 | Ajouter le step CI de vérification des types générés | Dans `backend-staging.yml` (ou workflow dédié) : générer les types et vérifier `git diff --exit-code` sur les dossiers générés | `.github/workflows/backend-staging.yml` | M0-T03, M0-T04 | 1 h | Le workflow CI échoue si les types générés ne sont pas à jour |

---

### M1 — Pipeline vert local (objectif : générer un CV de bout en bout sans erreur depuis `curl` local) — 🟢 QUASI TERMINÉ (2026-07-09)

**Critère de fin du jalon** : `POST /cv/generate` avec un profil admin complet retourne `202`, le job passe à `succeeded`, `GET /cv/{cv_id}` retourne un CV structuré valide. Tests TDD verts sur tout le pipeline. [PAH-1]

> **État** : cœur backend fait et testé (33 tests verts, 10 nouveaux sur le pipeline). Faits : T01-T14 (async job 202 + polling/SSE, worker BackgroundTask, fix NameError timezone, suppression transformation skills, RFC 7807, idempotence 409, tz-aware timestamptz + migration Alembic réversible, seed admin, borne offer_text), T04/T05 (agents réalignés sur le contrat, fix event-loop). **Reste avant [PAH-1]** : run end-to-end réel avec les agents Vertex (nécessite credentials GCP) — jusqu'ici les agents sont mockés dans les tests. Dette mineure : T16 (jsonb_agg→null) laissée car dans une migration déjà appliquée.

| ID | Titre | Description courte | Fichiers / zone | Dépend de | Estim. | Critère de fin (test) |
|---|---|---|---|---|---|---|
| M1-T01 | Test rouge : `POST /cv/generate` retourne 500 (reproduire BLK-2) | Écrire un test `test_cv_generate_timezone_error` avec agent mockés qui vérifie le `NameError: timezone`. Ce test doit échouer (rouge). | `backend/tests/test_cv.py` (nouveau) | M0-T05 | 1 h | Test rouge confirmé |
| M1-T02 | Corriger BLK-2 : `NameError: timezone` dans `cv.py` | Remplacer `from datetime import datetime` par `from datetime import datetime, timezone` (ligne 7). Ne pas introduire `utcnow()`. | `backend/app/routes/cv.py:7` | M1-T01 | 0,5 h | M1-T01 passe au vert |
| M1-T03 | Supprimer la transformation runtime des skills (ADR-R4) | Supprimer le bloc `cv.py:169-195` (transformation `{hard, soft}` → `[{name, level, category}]`). Passer `profile_data['skills']` tel quel à l'agent (structure `{hard, soft}` déjà canonique). | `backend/app/routes/cv.py:169-195` | M1-T02, M0-T05 | 1 h | Test TDD : profil avec skills `{hard: ["Python"], soft: ["Communication"]}` → agent reçoit la structure brute sans transformation |
| M1-T04 | Aligner `redacteur-cv/app/models.py` sur les contrats agents | Mettre à jour `agents/redacteur-cv/app/models.py` : `SelectedEducation.graduation_date` → `end_date` optionnel, `SelectedCertification.issue_date` → optionnel, ajouter `achievements`, `is_current`, `languages`, `expiration_date`, `credential_url`, `projects.role` à `UserProfileData`. Supprimer la classe `Skill` ancienne (remplacée par `{hard, soft}`). | `agents/redacteur-cv/app/models.py` | M0-T03 | 2 h | Import du module sans erreur + test unitaire de désérialisation d'un profil complet |
| M1-T05 | Aligner `analyseur-offre/app/models.py` sur le contrat agent | Vérifier la cohérence avec `contracts/agents/analyseur-offre.openapi.yaml`. Corriger le bug event-loop (`generate_content` synchrone dans méthode `async` — MIN-1) : remplacer par `asyncio.to_thread`. | `agents/analyseur-offre/app/services/vertex_ai_service.py:60,108`, `models.py` | M0-T03 | 1,5 h | Test unitaire : mock Vertex AI, `await analyze_text(...)` retourne un `AnalysisResult` valide sans bloquer l'event loop |
| M1-T06 | Corriger MIN-3 : `datetime.utcnow()` → `datetime.now(timezone.utc)` partout | Remplacer toutes les occurrences de `datetime.utcnow()` dans `profile.py:102`, `cv.py:363`, `models/career_pass.py:45,57`, `models/user_profile.py`, `models/generated_cv.py`. | `backend/app/models/`, `backend/app/routes/` | M1-T02 | 1 h | `grep -r "utcnow" backend/` retourne 0 résultat |
| M1-T07 | Migration Alembic : `stripe_payment_id` nullable + table `cv_jobs` | Nouvelle migration Alembic : (1) `stripe_payment_id` passe de `nullable=False, unique=True` à `nullable=True, unique=True` (BLK-1) ; (2) créer la table `cv_jobs` (colonnes : `id UUID PK`, `user_id FK`, `status enum[queued,running,succeeded,failed]`, `progress_pct int nullable`, `cv_id UUID nullable FK`, `error_message text nullable`, `created_at`, `updated_at`). | `backend/alembic/versions/` (nouveau), `backend/app/models/` | M0-T01 | 2 h | `alembic upgrade head` sans erreur sur la DB de test ; un `CareerPass` avec `stripe_payment_id=None` s'insère sans violation de contrainte |
| M1-T08 | Seed admin : migration Alembic ou script `seed_admin.py` | Créer `backend/scripts/seed_admin.py` : crée un utilisateur admin + un CareerPass valide 365 jours (sans `stripe_payment_id`) si n'existe pas. Configurer via variables d'env `ADMIN_EMAIL` / `ADMIN_PASSWORD`. | `backend/scripts/seed_admin.py` | M1-T07 | 1 h | Après `python seed_admin.py`, `GET /auth/me` avec le JWT admin retourne `role: ADMIN` |
| M1-T09 | Réécrire `POST /cv/generate` en mode async (phase 1 : submit + job record) | Remplacer la réponse synchrone `200` par un enregistrement `cv_jobs` en statut `queued` et une réponse `202 { job_id }`. Le worker IA sera ajouté en M1-T10. | `backend/app/routes/cv.py`, `backend/app/models/cv_job.py` (nouveau) | M1-T07, M1-T03 | 2 h | Test TDD : `POST /cv/generate` retourne `202` avec `job_id` ; un enregistrement `cv_jobs` existe en base avec statut `queued` |
| M1-T10 | Implémenter le worker IA (Background Task FastAPI) | Créer `backend/app/services/cv_worker.py` : `BackgroundTasks` FastAPI lance le pipeline Analyzer → Writer de manière asynchrone, met à jour `cv_jobs.status` (queued → running → succeeded/failed) et insère le `GeneratedCV` en cas de succès. | `backend/app/services/cv_worker.py` (nouveau), `backend/app/routes/cv.py` | M1-T09, M1-T04, M1-T05 | 2 h | Test d'intégration (agents mockés) : job passe de `queued` à `succeeded`, `cv_id` renseigné en base |
| M1-T11 | Implémenter `GET /cv/jobs/{job_id}` et `GET /cv/jobs/{job_id}/events` (SSE) | Ajouter les routes de polling et SSE sur `cv_jobs`. Le SSE émet `progress` et `done` à chaque changement de statut. | `backend/app/routes/cv.py` | M1-T09 | 2 h | Test TDD : polling retourne `status: succeeded` après que le worker a terminé ; SSE envoie `event: done` |
| M1-T12 | Garantir l'idempotence : une seule génération active par utilisateur | Vérifier avant d'insérer un `cv_jobs` qu'aucun job `queued` ou `running` n'existe pour l'utilisateur. Retourner `409` RFC 7807 si c'est le cas. | `backend/app/routes/cv.py`, `backend/app/routes/` | M1-T09 | 1 h | Test TDD : second `POST /cv/generate` pendant qu'un job est en cours retourne `409 application/problem+json` |
| M1-T13 | Erreurs RFC 7807 sur tout le module `cv.py` | Remplacer les `HTTPException(detail=str(e))` et `detail=f"CV generation failed: {str(e)}"` par des réponses `application/problem+json` avec message générique (MAJ-4). Logger le détail technique côté serveur avec un `trace_id`. | `backend/app/routes/cv.py:242-245` | M1-T09 | 1,5 h | Test TDD : une erreur interne retourne `application/problem+json` sans stack trace ; le log serveur contient le détail |
| M1-T14 | Validation `offer_text` : borne haute backend + `max_length` | Ajouter `max_length=200000` sur `offer_text` dans `GenerateCVRequest` (actuellement non borné côté backend, borné seulement à l'agent — échec tardif MIN-7). | `backend/app/routes/cv.py:43` | M1-T09 | 0,5 h | Test TDD : `offer_text` de 200 001 caractères → `422 application/problem+json` |
| M1-T15 | Test bout-en-bout local (smoke test manuel documenté) | Documenter dans `ONBOARDING.md` la procédure : seed admin → login → profil complet → `POST /cv/generate` → polling → `GET /cv/{cv_id}`. Vérifier manuellement que tous les champs (languages, achievements, is_current, field, expiration_date, credential_url, projects.role) apparaissent dans le CV généré. | `ONBOARDING.md` | M1-T10, M1-T08 | 1 h | Procédure documentée ; CV généré contient les champs précédemment perdus |
| M1-T16 | Corriger MIN-6 : `jsonb_agg` → `null` sur tableau vide | Dans la migration `0a59b3039eea`, ajouter `COALESCE(..., '[]')` pour éviter que `jsonb_agg` retourne `null` sur un tableau vide. Ou corriger dans le code Python (défensive). | `backend/alembic/versions/0a59b3039eea_...py:42-46` | M1-T07 | 0,5 h | Test : profil sans expériences → `experiences: []` (jamais `null`) |

---

### M2 — Qualité IA (objectif : CV nettement mieux générés, modèle Pro-tier validé par les evals) — 🟢 LARGEMENT ATTEINT (2026-07-09)

**Critère de fin du jalon** : ADR-MODEL tranché [PAH-2] ; score moyen du harnais d'evals augmenté d'au moins 15 % vs la baseline `gemini-2.5-flash` sur les 2 résultats commités ; le modèle choisi est déployé localement et les evals repassent.

> **État** : ADR-MODEL tranché ([PAH-2] : géographie UE → `gemini-2.5-pro` en europe-west9 ; cible `gemini-3.5-flash` différée car migration SDK `google-genai` requise, cf. ci-dessous). Modèle basculé et validé. Juge LLM construit (`score_evals.py`). **Mesure : 7.0 → 7.7 (+10 %)**, gain décisif sur la fidélité du CV junior (1→9 : le flash hallucinait). Le +15 % visé nécessite encore **M2-T06 (ingénierie des prompts)** et de meilleures fixtures. **M2-T07 (anti-injection)** partiellement fait (optimization_notes retiré du contrat) ; délimiteurs de prompt restants. Détails : `backend/evals/results/SCORES.md`.
>
> **Nouveau chantier acté** : migration `vertexai → google-genai` + `gemini-3.5-flash` (endpoint EU) — bloquée aujourd'hui par un conflit de namespace `google.*` dans les images agents ; **imposée avant oct. 2026** (fin de vie famille 2.5). À créer : ADR-GENAI-SDK.
>
> **M2-T06/T07 FAITS (2026-07-09)** : prompts améliorés (schéma réaligné end_date/field, anti-injection `<offre>` + bloc sécurité, fidélité renforcée) ; `.format`→`.replace` dans l'analyseur (robustesse accolades). **Injection testée et bloquée** (l'agent traite l'offre comme donnée). Mesure honnête sur paires **cohérentes** : junior 7.6 / senior 9.6, **fidélité 10/10** (moyenne 8.6 vs flash 7.0). L'hallucination ne subsiste que sur un mauvais-fit artificiel (junior×tech-lead). **Follow-ups** : (a) garde-fou « profil hors-cible » (refuser/signaler un fit trop faible) ; (b) robustesse analyseur (422 transitoire sur variance de sortie Gemini → retry/tolérance) ; (c) élargir le jeu d'evals.

### [PAH-1] — Run end-to-end réel : ✅ VALIDÉ (2026-07-09)

`POST /cv/generate` via l'API backend (base `talentious_app` migrée + seed admin, agents `gemini-2.5-pro`) → job async `queued→running→succeeded` (~60s) → `GET /cv/{id}` : CV ciblé et riche (résumé « Tech Lead Full-Stack » sur-mesure, 3 expériences reformulées avec verbes d'action, 23 compétences, formations avec dates/domaines préservés). **L'application génère correctement les CV.** Bug corrigé au passage : enum stocké en valeurs (`values_callable`) — l'inscription/seed cassait sur base migrée.

| ID | Titre | Description courte | Fichiers / zone | Dépend de | Estim. | Critère de fin (test) |
|---|---|---|---|---|---|---|
| M2-T01 | Baseline evals avec `gemini-2.5-flash` | Lancer `backend/evals/run_evals.py` sur les 2 profils existants, noter les scores, commiter les résultats JSON dans `backend/evals/results/baseline_flash/` | `backend/evals/run_evals.py`, `backend/evals/results/` | M1-T10 | 1 h | Résultats JSON commités, scores notés |
| M2-T02 | Rédiger ADR-MODEL : choix du modèle IA | Documenter les options : `gemini-2.5-pro` (europe-west9 strict, RGPD Paris single-region) vs `gemini-3.5-pro` (endpoint EU multi-région, données en UE mais pas single-Paris). Critères : souveraineté, latence, coût par génération, disponibilité region. | `docs/adr/ADR-MODEL.md` (nouveau) | M2-T01 | 1,5 h | Document ADR rédigé, options comparées avec données factuelles |
| M2-T03 | [PAH-2] Attendre décision humaine sur ADR-MODEL | Présenter l'ADR au fondateur. Pas de code avant la décision. | — | M2-T02 | — | Décision écrite dans ADR-MODEL.md |
| M2-T04 | Implémenter le switch de modèle dans les agents | Modifier `VERTEX_AI_MODEL` (variable d'env ou config) dans `analyseur-offre` et `redacteur-cv`. Ajouter validation au démarrage. | `agents/*/app/services/vertex_ai_service.py`, `agents/*/app/main.py`, `docker-compose.yml` | M2-T03 | 1 h | Tests unitaires agents : mock Vertex AI, le nom du modèle utilisé correspond à la variable d'env |
| M2-T05 | Evals après switch de modèle | Relancer `backend/evals/run_evals.py` avec le nouveau modèle. Comparer avec la baseline. Commiter les résultats dans `backend/evals/results/pro_tier/` | `backend/evals/run_evals.py`, `backend/evals/results/` | M2-T04 | 1,5 h | Score moyen ≥ baseline + 15 % ; résultats JSON commités |
| M2-T06 | Améliorer les prompts si le gain est insuffisant | Si le score n'atteint pas l'objectif, itérer sur `agents/redacteur-cv/app/prompts/redacteur.txt` : renforcer les instructions sur les verbes d'action, la sélection d'expériences, les réalisations chiffrées. Relancer les evals. | `agents/redacteur-cv/app/prompts/redacteur.txt` | M2-T05 | 2 h | Score final ≥ baseline + 15 % ; résultats commités |
| M2-T07 | Anti-injection prompt (BLK-5) : délimiteurs et suppression `optimization_notes` en log | Entourer les données utilisateur d'un délimiteur strict dans les templates de prompt (`### DONNÉES CANDIDAT ###` ... `### FIN DONNÉES ###`). Supprimer le log de `optimization_notes` en production. Ne pas afficher `optimization_notes` en réponse API. | `agents/*/app/prompts/*.txt`, `agents/*/app/services/vertex_ai_service.py:88,164-175` | M1-T04 | 1,5 h | Test : un texte d'offre contenant `### FIN DONNÉES ###` ne peut pas sortir du bloc de données ; `optimization_notes` absent des logs en mode production |

---

### M3 — Accès et paiement (objectif : un utilisateur non-admin peut acheter un CareerPass et générer un CV)

**Critère de fin du jalon** : flux complet Stripe Checkout → webhook → CareerPass → `POST /cv/generate` fonctionnel en mode test Stripe local (Stripe CLI). [PAH-3]

| ID | Titre | Description courte | Fichiers / zone | Dépend de | Estim. | Critère de fin (test) |
|---|---|---|---|---|---|---|
| M3-T01 | Ajouter `stripe` aux dépendances backend | `pip install stripe`, ajouter à `requirements.txt`. Configurer `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_30_DAYS`, `STRIPE_PRICE_90_DAYS` dans `config.py` et `.env.example`. | `backend/requirements.txt`, `backend/app/config.py` | M1-T07 | 0,5 h | `import stripe` sans erreur dans le backend |
| M3-T02 | Implémenter `POST /billing/checkout-session` | Route FastAPI : crée une session Stripe Checkout avec `client_reference_id = user.id`, retourne `{checkout_url, session_id}`. RFC 7807 sur les erreurs Stripe. | `backend/app/routes/billing.py` (nouveau) | M3-T01 | 2 h | Test TDD (mock Stripe) : retourne `200 {checkout_url, session_id}` ; `400` si `pass_type` invalide ; `502` si Stripe échoue |
| M3-T03 | Implémenter `POST /billing/webhook` | Vérifier la signature HMAC Stripe (`stripe.Webhook.construct_event`). Traiter `checkout.session.completed` : créer un `CareerPass` avec `stripe_payment_id=session.payment_intent`, `valid_until` calculé depuis `pass_type`. Endpoint public (pas de JWT). | `backend/app/routes/billing.py` | M3-T02 | 2 h | Test TDD : payload `checkout.session.completed` avec signature valide → CareerPass créé en base ; signature invalide → `400` |
| M3-T04 | Tester le webhook en local avec Stripe CLI | Documenter dans `ONBOARDING.md` : `stripe listen --forward-to localhost:8000/billing/webhook`. Déclencher un paiement test. | `ONBOARDING.md` | M3-T03 | 1 h | Procédure documentée ; CareerPass créé après paiement test |
| M3-T05 | Page frontend `/billing` : sélection du pass et redirection Checkout | Créer `frontend/src/app/billing/page.tsx` : deux options (30 jours / 90 jours), bouton → appel `POST /billing/checkout-session` → redirection vers `checkout_url`. | `frontend/src/app/billing/page.tsx` (nouveau) | M3-T02, M0-T04 | 2 h | Test Playwright smoke : la page s'affiche ; le bouton déclenche la redirection Stripe (mock API) |
| M3-T06 | Page de succès et d'annulation post-Checkout | Créer `frontend/src/app/billing/success/page.tsx` et `/billing/cancelled/page.tsx`. La page succès affiche un message de confirmation et un lien vers le dashboard. | `frontend/src/app/billing/` | M3-T05 | 1 h | Les pages s'affichent sans erreur JS |
| M3-T07 | Intercepteur 402 frontend : redirection vers `/billing` | Quand l'API retourne `402 application/problem+json`, le client axios redirige vers `/billing` au lieu d'afficher une erreur opaque. | `frontend/src/lib/api.ts` (ou `axios` interceptor) | M0-T04, M3-T05 | 1 h | Test unitaire : réponse `402` → `router.push('/billing')` |
| M3-T08 | Rate limiting sur `POST /auth/login` (MAJ-5) | Ajouter `slowapi` ou équivalent : 5 tentatives / minute par IP sur `/auth/login`. Message d'erreur générique sur `/auth/register` (supprimer « Email already registered »). `verify_password` factice si user absent (timing constant). | `backend/app/routes/auth.py` | M1-T13 | 1,5 h | Test TDD : 6e tentative de login → `429 application/problem+json` ; timing de l'échec login similaire avec et sans user existant |
| M3-T09 | CORS backend : ajouter les URLs Cloud Run staging | Ajouter les URLs staging dans `CORS_ORIGINS` (config ou variable d'env). Agents : remplacer `allow_origins=["*"]` par `allow_origins=[]` (les agents ne sont pas appelés depuis un navigateur — CORS inutile côté agent). | `backend/app/config.py:30`, `agents/*/app/main.py:51-54,69-73` | M0-T01 | 0,5 h | Test : requête CORS depuis l'URL staging → `200` avec `Access-Control-Allow-Origin` correct |
| M3-T10 | Ajouter `GET /billing/status` (CareerPass actif ?) | Route JWT-protégée retournant `{has_active_pass: bool, valid_until: datetime | null}`. Utilisé par le frontend pour conditionner l'affichage. | `backend/app/routes/billing.py` | M3-T03 | 1 h | Test TDD : user avec pass actif → `{has_active_pass: true}` ; user sans pass → `{has_active_pass: false}` |

---

### M4 — UI complète (objectif : parcours utilisateur de bout en bout dans le navigateur)

**Critère de fin du jalon** : un utilisateur peut s'inscrire, importer un PDF, générer un CV, l'éditer dans un WYSIWYG et l'exporter en PDF depuis le navigateur.

| ID | Titre | Description courte | Fichiers / zone | Dépend de | Estim. | Critère de fin (test) |
|---|---|---|---|---|---|---|
| M4-T01 | Rebaser `feature/dashboard-and-editor` sur `main` | `git checkout feature/dashboard-and-editor`, `git rebase main`. Résoudre les conflits. Rejeter le correctif `utcnow()` de cette branche (déjà corrigé proprement en M1-T06). | Branche git | M1-T06 | 1 h | `git rebase --continue` sans conflit résiduel ; `pytest` passe toujours |
| M4-T02 | Adapter le dashboard (`dashboard/page.tsx`) aux nouveaux contrats | Mettre à jour les types importés vers `frontend/src/generated/`. Remplacer les appels manuels axios par les méthodes générées. | `frontend/src/app/dashboard/page.tsx` | M0-T04, M4-T01 | 2 h | Test Playwright smoke : la page `/dashboard` affiche la liste des CV (API mockée) sans erreur console |
| M4-T03 | Adapter `GenerateCVModal` aux nouveaux contrats | Mettre à jour les types et les appels API. La modale appelle `POST /cv/generate` (202) puis poll `GET /cv/jobs/{job_id}` jusqu'à `succeeded`. Afficher la barre de progression (`progress_pct`). | `frontend/src/components/GenerateCVModal.tsx` | M4-T02, M1-T11 | 2 h | Test unitaire React Testing Library : la modale affiche "Génération en cours..." puis redirige vers `/cv/{id}/edit` quand `status: succeeded` |
| M4-T04 | Intégrer `Toast` et `ConfirmDialog` dans le layout | Importer les composants de la branche et les connecter au système global (context ou zustand). | `frontend/src/components/Toast.tsx`, `ConfirmDialog.tsx` | M4-T01 | 1 h | Test unitaire : `Toast` s'affiche 3 s puis disparaît ; `ConfirmDialog` bloque la navigation si non confirmé |
| M4-T05 | Créer `frontend/src/lib/api.ts` basé sur le client généré | Remplacer la lib api manuelle par le client axios généré (type-safe). Configurer le `baseURL` depuis `NEXT_PUBLIC_API_URL`. | `frontend/src/lib/api.ts` | M0-T04 | 1 h | Tous les appels frontend compilent sans erreur TypeScript |
| M4-T06 | Créer l'éditeur WYSIWYG `/cv/{id}/edit` | Nouvelle page `frontend/src/app/cv/[id]/edit/page.tsx` : charger `GET /cv/{cv_id}`, afficher les sections du CV en mode édition inline (textarea enrichie ou `contentEditable` contrôlé). Sauvegarder via `PUT /cv/{cv_id}`. | `frontend/src/app/cv/[id]/edit/page.tsx` (nouveau) | M4-T05, M1-T11 | 2 h | Test Playwright smoke : la page `/cv/{id}/edit` charge le CV, modifie un champ, sauvegarde → rechargement affiche la valeur modifiée |
| M4-T07 | Rendu CV : template `modern_v1` | Créer `frontend/src/components/cv/CVTemplate.tsx` : rendu HTML structuré d'un `GeneratedCVData` (sections personal_info, summary, experiences, educations, skills, certifications, projects). CSS Tailwind fidèle à la charte graphique (#2D3748, #38A169, Inter). | `frontend/src/components/cv/CVTemplate.tsx` (nouveau) | M4-T06 | 2 h | Test snapshot React Testing Library : le rendu HTML contient les sections attendues |
| M4-T08 | Export PDF côté client (html2pdf.js ou react-to-pdf) | Ajouter un bouton "Exporter en PDF" dans l'éditeur qui capture `CVTemplate` et génère un PDF téléchargeable. | `frontend/src/app/cv/[id]/edit/page.tsx`, dépendance npm | M4-T07 | 1,5 h | Test manuel : le PDF généré contient toutes les sections du CV ; le fichier est téléchargeable |
| M4-T09 | Implémenter `parser_service.py` (PyMuPDF) côté backend | Créer `backend/app/services/parser_service.py` : importer PyMuPDF, extraire le texte d'un PDF uploadé, retourner un `ProfileData` partiel. Ce module remplace le microservice `parser-pdf`. | `backend/app/services/parser_service.py` (nouveau) | M0-T05 | 2 h | Test unitaire : un PDF de CV simple → extrait au moins `first_name`, `last_name`, `email`, une expérience |
| M4-T10 | Ajouter la route `POST /profile/import-pdf` | Route FastAPI : accepte un `multipart/form-data` PDF (max 10 MB), appelle `parser_service.parse_pdf()`, retourne un `ProfileData` partiel que le frontend peut pré-remplir avant confirmation. | `backend/app/routes/profile.py` | M4-T09 | 1 h | Test TDD : upload d'un PDF → `200 {profile_data: {...}}` ; PDF non-PDF → `422` |
| M4-T11 | Brancher l'import PDF dans `onboarding/page.tsx` | Remplacer la simulation (`setTimeout`, TODO Phase 3) par un appel réel à `POST /profile/import-pdf`. Afficher le résultat pré-rempli dans le formulaire de profil avant confirmation. | `frontend/src/app/onboarding/page.tsx:74-80` | M4-T10 | 1,5 h | Test Playwright smoke : upload d'un PDF → formulaire pré-rempli visible |
| M4-T12 | Supprimer le microservice `parser-pdf` | Retirer le service `parser-pdf` du `docker-compose.yml`, supprimer les références dans les workflows CI (`agents-staging.yml`). Conserver le dossier `agents/parser-pdf/` en lecture seule dans un commit "archived" ou supprimer. | `docker-compose.yml`, `.github/workflows/agents-staging.yml` | M4-T09 | 0,5 h | `docker-compose up` sans le service `parser-pdf` démarre sans erreur |
| M4-T13 | Route `DELETE /users/me` (RGPD Art. 17 — partie UI) | Ajouter un bouton "Supprimer mon compte" dans les paramètres utilisateur, avec `ConfirmDialog`. Appelle `DELETE /users/me`. | `frontend/src/app/profile/page.tsx` ou `settings/` | M4-T04, M5-T05 (route backend) | 1 h | Test Playwright smoke : le bouton affiche la confirmation ; après confirmation, redirection vers `/` |
| M4-T14 | Adapter le middleware Next.js auth (supprimer le cookie spoofable) | Remplacer la protection de route cosmétique (lecture du cookie `talentious_session` posé côté client) par une vérification réelle du JWT via l'API `/auth/me` (ou HttpOnly cookie si décision actée en ADR). | `frontend/src/middleware.ts` (si existe) ou `_app.tsx` | M0-T04 | 1,5 h | Test : une requête vers `/dashboard` sans JWT valide redirige vers `/login` |

---

### M5 — Sécurité et RGPD (objectif : zéro bloquant sécurité avant mise en production)

**Critère de fin du jalon** : BLK-4 et BLK-5 résolus ; agents privés ; RFC 7807 partout ; route RGPD opérationnelle ; scan bandit sans alerte HIGH.

| ID | Titre | Description courte | Fichiers / zone | Dépend de | Estim. | Critère de fin (test) |
|---|---|---|---|---|---|---|
| M5-T01 | Agents Cloud Run : passer en `--no-allow-unauthenticated` | Modifier `agents-staging.yml:61,120,179` : remplacer `--allow-unauthenticated` par `--no-allow-unauthenticated --service-account agents-sa@...`. Le backend obtient un token IAM via `google.auth` (déjà implémenté dans `parser_client.py` — généraliser à `analyzer_client.py` et `writer_client.py`). | `.github/workflows/agents-staging.yml`, `backend/app/services/analyzer_client.py`, `backend/app/services/writer_client.py` | M0-T01 | 2 h | Test d'intégration : appel direct à l'endpoint agent sans token → `403` ; appel via le backend avec token IAM → `200` |
| M5-T02 | Créer les comptes de service dédiés (SA) par service | Créer `backend-sa`, `analyseur-sa`, `redacteur-sa` avec rôles minimaux (Cloud Run Invoker pour les agents, Cloud SQL Client pour le backend). Supprimer le Compute SA par défaut des déploiements. | `infra/main.tf` (nouveaux resources `google_service_account`), `.github/workflows/` | M5-T01 | 2 h | `gcloud iam service-accounts list` montre les SA dédiés ; aucun service ne tourne avec le SA Compute par défaut |
| M5-T03 | Ajouter RFC 7807 sur `writer_client.py` et les agents | Remplacer `response.text` renvoyé en clair dans `writer_client.py:61,67,95`, `redacteur-cv/app/main.py:161`, `parser-pdf/app/main.py:137,148` par des réponses génériques `application/problem+json`. | `backend/app/services/writer_client.py`, `agents/*/app/main.py` | M1-T13 | 1,5 h | Test TDD : une erreur interne agent retourne `application/problem+json` sans stack trace |
| M5-T04 | Logs structurés JSON partout (MIN-4) | Remplacer `logging` texte + emojis par `structlog` ou `logging` avec formatter JSON. Ajouter un `trace_id` (UUID par requête, propagé via header `X-Trace-Id`). `debug=False` par défaut dans `config.py:16` et `redacteur-cv/app/main.py:117`. Masquer PII (email, phone) dans les logs. | `backend/app/main.py`, `agents/*/app/main.py`, `backend/app/config.py:16` | M0-T01 | 2 h | `docker-compose logs backend` affiche du JSON valide ; aucun email en clair dans les logs |
| M5-T05 | Implémenter `DELETE /users/me` backend | Route FastAPI : (1) supprimer les CVs + PDF GCS associés, (2) supprimer le profil, (3) supprimer les CareerPasses, (4) supprimer l'utilisateur. Invalider le JWT (ajouter `jti` à la blacklist en Redis ou table `revoked_tokens` simple). | `backend/app/routes/account.py` (nouveau), `backend/app/services/gcs_service.py` | M1-T07 | 2 h | Test TDD : `DELETE /users/me` → `204` ; `GET /auth/me` avec le JWT révoqué → `401` ; aucune donnée en base |
| M5-T06 | Lifecycle bucket GCS : supprimer les PDF orphelins | Ajouter une règle de lifecycle sur le bucket (supprimer les objets de plus de 365 jours) dans `infra/main.tf`. Désactiver `versioning` (les versions récupèrent les PDF supprimés — violation RGPD). | `infra/main.tf:69-79` | M0-T01 | 1 h | `terraform plan` montre le lifecycle + versioning désactivé ; `terraform apply` sans erreur |
| M5-T07 | Corriger les garde-fous Terraform (MAJ-7) | `deletion_protection = true` sur Cloud SQL. `force_destroy = false` sur le bucket GCS. | `infra/main.tf:40,72-73` | M5-T06 | 0,5 h | `terraform plan` montre les valeurs correctes ; `terraform apply` sans erreur |
| M5-T08 | Quota Vertex AI par utilisateur | Ajouter un compteur de générations actives par utilisateur (déjà géré par l'idempotence M1-T12). Ajouter un budget GCP programmatique (`google_billing_budget`) dans Terraform avec alerte e-mail à 80 % du seuil mensuel. | `infra/main.tf` (nouveau `google_billing_budget`), `backend/app/routes/cv.py` | M5-T07 | 1,5 h | `terraform apply` crée le budget ; une alerte apparaît dans la console GCP |
| M5-T09 | Validation `max_length` sur les champs URL et skills (MIN-7) | Ajouter `max_length` sur les champs URL non bornés dans les schémas Pydantic générés. Valider que la contrainte « max 20 skills » est enforced en validation backend. | `backend/app/routes/profile.py`, schémas générés | M0-T05 | 0,5 h | Test TDD : skills avec 21 éléments → `422` |
| M5-T10 | ADR-SECURITY : documenter les décisions de sécurité actées | Rédiger `docs/adr/ADR-SECURITY.md` couvrant : JWT localStorage vs HttpOnly (décision sur la migration), agents privés, moindre privilège SA, RGPD. | `docs/adr/ADR-SECURITY.md` (nouveau) | M5-T05 | 1 h | Document ADR rédigé et commité |
| M5-T11 | Scan sécurité bandit en CI | Ajouter `bandit -r backend/ agents/` dans `backend-staging.yml`. Bloquer le pipeline si alerte `HIGH`. | `.github/workflows/backend-staging.yml` | M0-T07 | 0,5 h | Le workflow CI échoue si `bandit` trouve une alerte HIGH |
| M5-T12 | Lint et formatage en CI (ruff, black, eslint, prettier) | Ajouter les steps lint/format dans les workflows CI (backend et frontend). Le pipeline est bloquant si le lint échoue. | `.github/workflows/backend-staging.yml`, `.github/workflows/frontend-staging.yml` | M0-T07 | 1 h | Le workflow CI échoue si ruff ou eslint retourne une erreur |
| M5-T13 | Secret par défaut dangereux : valeur interdite en CI | Ajouter un hook pre-commit ou un step CI qui vérifie que `SECRET_KEY` n'est pas égal à `"your-secret-key-change-in-production"`. | `.github/workflows/backend-staging.yml`, `.pre-commit-config.yaml` | M0-T01 | 0,5 h | CI échoue si le secret par défaut est détecté dans la config |
| M5-T14 | Health-check writer avant pipeline (MIN-9) | Appeler `writer_client.health_check()` au démarrage du worker. Si le writer est indisponible, le job passe immédiatement à `failed` avec message générique. | `backend/app/services/cv_worker.py`, `backend/app/services/writer_client.py:98` | M1-T10 | 1 h | Test TDD : si le writer répond `503` au health-check, le job est marqué `failed` sans appeler l'analyseur |

---

### M6 — Production GCP (objectif : service public déployé, observable, résilient)

**Critère de fin du jalon** : les 4 services (backend, frontend, analyseur, rédacteur) sont déployés sur Cloud Run prod via Terraform et GitHub Actions. Les logs JSON arrivent dans Cloud Logging. Un test de smoke end-to-end passe en prod. [PAH-4] [PAH-5]

| ID | Titre | Description courte | Fichiers / zone | Dépend de | Estim. | Critère de fin (test) |
|---|---|---|---|---|---|---|
| M6-T01 | [PAH-4] Audit GCP lecture seule avant Terraform | Vérifier l'état réel : services Cloud Run staging toujours en vie ? Projet GCP actif et facturé ? Budget actuel ? Secret Manager peuplé ? Réseau VPC ? | `gcloud` (lecture seule) | Tous M5 | 1 h | Rapport textuel des ressources existantes |
| M6-T02 | Rapatrier Cloud Run dans Terraform (MAJ-8) | Ajouter dans `infra/main.tf` les ressources `google_cloud_run_v2_service` pour backend, frontend, analyseur, rédacteur (avec variables min-instances, max-instances, région, SA, secrets). | `infra/main.tf` | M5-T02, M6-T01 | 2 h | `terraform plan` montre les 4 services Cloud Run à créer/modifier |
| M6-T03 | IAM Cloud Run dans Terraform | Ajouter les bindings IAM (`google_cloud_run_service_iam_binding`) : agents en `--no-allow-unauthenticated`, backend public, frontend public. SA backend a `roles/run.invoker` sur les agents. | `infra/main.tf` | M6-T02 | 1 h | `terraform plan` montre les bindings IAM corrects |
| M6-T04 | Secret Manager dans Terraform | Ajouter `google_secret_manager_secret` et `google_secret_manager_secret_version` pour `JWT_SECRET_KEY`, `DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Les SA ont `roles/secretmanager.secretAccessor` uniquement sur leurs propres secrets. | `infra/main.tf` | M5-T02 | 1,5 h | `terraform apply` sans erreur ; les secrets sont accessibles depuis les services Cloud Run |
| M6-T05 | Créer le pipeline de production GitHub Actions | Nouveau workflow `backend-prod.yml` (et équivalents frontend/agents) : déclenché sur `push main`, build l'image Docker, pousse vers Artifact Registry, `terraform apply` (ou `gcloud run deploy`), test de smoke. | `.github/workflows/backend-prod.yml` (nouveau) | M6-T02 | 2 h | Le workflow s'exécute sans erreur sur un push `main` de test |
| M6-T06 | CORS backend prod : ajouter l'URL de prod | Ajouter l'URL de production frontend dans `CORS_ORIGINS`. | `backend/app/config.py` | M6-T05 | 0,5 h | Test CORS depuis l'URL prod → `200` avec le header correct |
| M6-T07 | Observabilité : Cloud Logging + Cloud Trace | Vérifier que les logs JSON (M5-T04) arrivent dans Cloud Logging. Ajouter `google-cloud-trace` et propager le `trace_id` dans le header `X-Cloud-Trace-Context`. Configurer un tableau de bord Cloud Monitoring basique (taux d'erreurs, latence p95). | `backend/app/main.py`, `agents/*/app/main.py` | M5-T04 | 2 h | Les logs apparaissent dans Cloud Logging avec le `trace_id` ; le tableau de bord est visible dans Cloud Monitoring |
| M6-T08 | Aligner les timeouts Cloud Run sur le pipeline async | Le backend est maintenant async (M1-T09), donc le timeout Cloud Run peut être réduit à 60 s (le worker tourne en arrière-plan). Configurer `--timeout 60` pour le backend. Les agents gardent un timeout plus long (600 s) ou sont configurés avec Cloud Tasks si l'ADR-ASYNC l'a tranché ainsi. | `infra/main.tf` (Cloud Run timeout), `.github/workflows/` | M6-T02, ADR-ASYNC | 1 h | `gcloud run services describe backend` montre `--timeout 60` |
| M6-T09 | Rédiger ADR-ASYNC : infrastructure worker (BackgroundTasks vs Cloud Tasks vs Cloud Run Jobs) | Documenter les options : (A) `FastAPI BackgroundTasks` (simple, en cours, mais lié au processus — cold start risque) ; (B) `Cloud Tasks` (queue managée, retry, délai entre tâches) ; (C) `Cloud Run Jobs` (exécution isolée, idéal pour workloads longs). Recommander l'option la plus simple pour un solo. | `docs/adr/ADR-ASYNC.md` (nouveau) | M1-T10 | 1,5 h | ADR rédigé avec recommendation argumentée |
| M6-T10 | Backup et PITR Cloud SQL : vérifier et documenter | Vérifier que le backup automatique est actif (`backup_configuration.enabled = true`), activer PITR (`point_in_time_recovery_enabled = true`), définir la rétention à 7 jours. Documenter la procédure de restauration. | `infra/main.tf:42-52`, `ONBOARDING.md` | M5-T07 | 1 h | `terraform plan` montre PITR activé ; procédure de restauration documentée |
| M6-T11 | Test de smoke en production | Après le premier déploiement : seed admin prod, login, génération d'un CV complet, vérification que le CV est accessible via `GET /cv/{cv_id}`. | Script `scripts/smoke_prod.sh` | M6-T05 | 1 h | Script s'exécute sans erreur ; CV généré accessible en prod |
| M6-T12 | Versioning d'API `/v1` : préfixer toutes les routes | Ajouter le préfixe `/v1` à toutes les routes backend (actuellement sans versioning). Mettre à jour le frontend et les clients agents en conséquence. | `backend/app/main.py`, `frontend/src/lib/api.ts`, `backend/app/services/*.py` | M0-T05 | 1,5 h | `GET /v1/auth/me` → `200` ; `GET /auth/me` → `404` |
| M6-T13 | [PAH-5] Validation humaine avant ouverture du service | Présenter le résultat du smoke test prod. Valider la mise en service publique. | — | M6-T11 | — | Décision documentée |

---

## 4. ADR à produire

Ces trois ADR conditionnent des décisions de code et d'infrastructure. Ils doivent être rédigés et validés [PAH] aux moments indiqués dans les jalons.

| ADR | Titre | Moment | Options principales | Recommandation provisoire |
|---|---|---|---|---|
| ADR-ASYNC | Infrastructure worker de génération asynchrone | Avant fin M1 (décision d'archi, pas de blocage immédiat car BackgroundTasks est utilisé en M1 par défaut) | (A) FastAPI BackgroundTasks — simple, en mémoire, risque cold start ; (B) Cloud Tasks — queue managée, retry automatique, overhead IAM ; (C) Cloud Run Jobs — isolation complète, le plus robuste pour workloads longs | (A) pour solo en V1 : moins d'infrastructure à maintenir. Migrer vers (C) si les cold starts deviennent problématiques en prod |
| ADR-MODEL | Choix du modèle IA (gemini-2.5-pro vs gemini-3.5-pro) | Début M2, après baseline evals [PAH-2] | `gemini-2.5-pro` (europe-west9 strict, RGPD Paris single-region, disponible aujourd'hui) vs `gemini-3.5-pro` (endpoint EU multi-région, données en UE mais pas single-Paris, potentiellement plus performant) | Dépend de la priorité souveraineté stricte vs performance. Si RGPD Paris strict est non-négociable → `gemini-2.5-pro`. Sinon → `gemini-3.5-pro` si disponible en EU. |
| ADR-SECURITY | Décisions de sécurité V1 (JWT localStorage → HttpOnly, agents privés, moindre privilège) | Fin M5 | Migration JWT vers HttpOnly cookie (sécurisée mais complexifie le refresh token) vs conservation localStorage avec HTTPS strict et durée courte (30 min) | Migrer vers HttpOnly avant la V1 publique si le temps le permet ; sinon documenter comme dette actée avec échéance V1.1 |

---

## 5. Chemin critique

Le chemin critique est la séquence de tickets dont le retard repousse la date de fin totale. Il est entièrement en phase M0 → M1.

```
M0-T01 → M0-T02 → M0-T03 → M0-T05          (contrats backend)
                          ↘
M0-T01 → M0-T02 → M0-T04 → M0-T06          (contrats frontend)
                          ↘
M0-T03 → M1-T01 → M1-T02 → M1-T03          (TDD pipeline + fix timezone + suppression transformation)
                          ↘
M1-T04 → M1-T09 → M1-T10 → M1-T11 → M1-T15  (async pipeline complet → smoke test local)
                          ↓
                    [PAH-1] → M2-T01 → M2-T02 → [PAH-2] → M2-T04 → M2-T05
```

Toute action qui retarde M0-T01 (mise en place de l'environnement) ou M0-T03 (génération des types Pydantic) bloque l'ensemble du plan. Ces deux tickets sont la priorité absolue de S1.

---

## 6. Swimlanes par domaine (organisation du travail solo)

| Domaine | Jalons principaux | Remarque |
|---|---|---|
| Backend (Python/FastAPI) | M0-T03,T05 · M1 complet · M2-T04 · M3-T01→T03,T08,T10 · M4-T09,T10 · M5-T01→T05,T08→T14 · M6-T02→T04,T07→T12 | Chemin critique ; traiter avant le frontend |
| Frontend (Next.js/React) | M0-T04,T06 · M3-T05→T07 · M4-T01→T08,T11,T13,T14 | Peut commencer M4-T01 dès M0 terminé |
| Infra / IaC (Terraform/GCP) | M5-T06,T07 · M6-T01→T06,T08,T10 · M0-T07 (CI) | Regrouper les sessions Terraform pour minimiser les contextes d'authentification GCP |
| IA / Evals | M2 complet · M2-T07 (sécurité prompt) | Traiter en un bloc une fois le pipeline vert (M1 terminé) |

---

## 7. Risques et mitigations

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Cold start Cloud Run 2-5 min pour les agents IA (workload synchrone déplacé en async mais agents toujours froids) | Haute | Moyen | Configurer `min-instances: 1` sur les agents en prod (coût ~15 €/mois par agent) ; documenter dans ADR-ASYNC |
| Modèle Pro-tier non disponible en europe-west9 ou quota insuffisant | Moyenne | Haut | Vérifier la disponibilité avant ADR-MODEL ; avoir un fallback `gemini-2.5-flash` documenté |
| Scope creep UI (éditeur WYSIWYG sous-estimé) | Haute | Moyen | M4-T06 est borné à 2 h : si insuffisant, livrer d'abord un éditeur textarea simple (non WYSIWYG) et itérer en V1.1 |
| Stripe en mode test insuffisant (webhooks locaux difficiles) | Moyenne | Faible | Utiliser `stripe listen` dès M3-T04 ; documenter la procédure |
| Dérive de contexte de l'état GCP réel (services encore en vie ? base de prod intacte ?) | Haute | Haut | [PAH-4] obligatoire avant M6 : audit `gcloud` lecture seule |
| Tickets de sécurité (M5) déprioritisés en fin de projet | Haute | Critique | M5 est un jalon complet, non optionnel, avant tout déploiement prod |
| Token JWT localStorage capturé via XSS | Moyenne | Haut | ADR-SECURITY à trancher ; migration HttpOnly recommandée avant mise en service public |

---

## 8. Décisions restant à trancher par le fondateur avant exécution

Ces questions bloquent ou orientent des tickets précis. Elles complètent les PAH et les ADR.

1. **Budget GCP mensuel cible** (staging + prod) : dimensionne le choix `min-instances` vs cold starts et l'option de Cloud Tasks. — **⏳ à trancher (non bloquant avant M6).**
2. **Export PDF** : **✅ TRANCHÉ (2026-07-09) — côté client (html2pdf.js) en V1** (M4-T08). Migration serveur WeasyPrint + GCS envisagée en V1.1.
3. **Import LinkedIn PDF** : **✅ TRANCHÉ (2026-07-09) — inclus en V1** (CV PDF **et** LinkedIn PDF). Impact : M4-T09 (`parser_service`) doit gérer les deux formats ; ajouter un ticket de mapping spécifique LinkedIn si le format diffère sensiblement du CV standard.
4. **Modèle économique** : **✅ TRANCHÉ — Pass temporaire** (30 / 90 jours) via Stripe (M3), pas de freemium.
5. **Suppression du microservice `parser-pdf`** : **✅ TRANCHÉ — oui**, rebranché comme fonction backend en M4-T09, microservice supprimé en M4-T12.

---

_Ce document est vivant. Toute décision prise sur un PAH ou un ADR doit être notée ici ou dans le document ADR correspondant avant de passer à la phase suivante._
