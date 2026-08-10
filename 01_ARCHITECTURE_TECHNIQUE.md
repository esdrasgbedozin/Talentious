# 01 — ARCHITECTURE TECHNIQUE « TALENTIOUS »

> **Statut** : constat du réel au 2026-08-08, **en production**. Décrit ce qui
> **est** déployé sur https://talentious.app (europe-west9). Source de vérité
> technique : `contracts/openapi.yaml`. Écarts résiduels / dette en §8.

---

## 1. Topologie

Monorepo, 5 services conteneurisés sur **Cloud Run** + PostgreSQL managé, région `europe-west9` (Paris) :

```
Navigateur
   │ HTTPS (access JWT 15 min en mémoire + cookie de nav "__session")
   ▼
Firebase Hosting (façade CDN, domaines talentious.app / api.talentious.app)
   │ rewrites → Cloud Run ; ne laisse passer que le cookie __session ; no-cache HTML
   ▼
Frontend  Next.js / React / Tailwind              (Cloud Run, europe-west9)
   │ REST JSON (axios, Bearer + refresh silencieux)
   ▼
Backend   FastAPI / SQLAlchemy 2 async            (Cloud Run, max 1 instance)
   │  ├── PostgreSQL  (Cloud SQL `talentious-db-prod`, base `talentious`, JSONB)
   │  ├── httpx (auth IAM) ──► parser-pdf      PyMuPDF + Vertex AI   (privé)  agent d'IMPORT
   │  ├── httpx (auth IAM) ──► analyseur-offre Vertex AI Gemini      (privé)
   │  └── httpx (auth IAM) ──► redacteur-cv    Vertex AI Gemini      (privé)
   ▼
Vertex AI  gemini-2.5-pro, région europe-west9 (Paris), sortie JSON forcée, retries
```

- **Génération** : `POST /cv/generate` retourne **202 + job_id** ; traitement en tâche
  de fond (`cv_worker.py`), suivi par polling `GET /cv/jobs/{id}` (ou SSE). Orchestre
  CareerPass → profil → analyseur → rédacteur → INSERT.
- **Import** : `POST /profile/import-cv` retourne **202 + job_id** ; l'agent `parser-pdf`
  (`/extract-profile`) extrait le texte (PyMuPDF) puis structure via Gemini ; brouillon
  éphémère en mémoire (TTL 15 min), **jamais persisté** sans relecture humaine.
- **Agents privés** : appelables uniquement par le backend via jeton d'identité IAM
  (`iam_auth.py` ; `enable_iam_auth` en prod, direct en dev).
- **Dev local** : `docker-compose.yml` avec les 5 services + `db` (base locale `talentious_app`).

## 2. Contrats d'interface (Contract-First)

`contracts/openapi.yaml` (+ `contracts/agents/*.openapi.yaml`) est la **source de vérité
unique**. Les types sont générés des deux côtés :

- Backend : Pydantic dans `backend/app/generated/models.py` (`datamodel-code-generator`).
- Frontend : TypeScript dans `frontend/src/generated/api.ts` (`openapi-typescript`).
- `make generate-types` doit être dans le **même commit** que toute édition de contrat ;
  la **CI `contracts-types` bloque** toute dérive (`git diff --exit-code`).

Le bug historique des 4 contrats divergents (skills/certifications/educations) est résolu :
un `ProfileData` canonique unique, plus aucune transformation runtime.

## 3. Modèle de données (PostgreSQL, migrations Alembic)

- `users` : UUID PK, email unique, `hashed_password` (bcrypt, **nullable** pour comptes Google),
  `google_id` unique, `role` enum USER/ADMIN, `email_verified`, `stripe_customer_id`.
- `user_profiles` : `user_id` PK/FK cascade, `profile_data JSONB`, `updated_at` (tz-aware).
- `career_passes` : `pass_type` enum, `valid_until` (timestamptz), `stripe_payment_id` (nullable).
- `generated_cvs` : `cv_name`, `template_id`, `job_offer_context`, `cv_data_json JSONB`, index `created_at`.
- `cv_jobs` : suivi des jobs de génération asynchrones (un actif par utilisateur).
- `refresh_tokens` : jetons de rafraîchissement hachés (SHA-256), rotation + famille.
- `email_verification` / `password_reset` : jetons JWT à portée dédiée.
- **8 migrations Alembic** (`backend/alembic/versions/`), upgrade/downgrade vérifiés.

## 4. Sécurité

- **Auth** : access JWT HS256 **15 min** + **refresh tokens rotatifs en base** (SHA-256,
  rotation à chaque usage, *family burn* sur détection de réutilisation) en cookie httpOnly
  `talentious_refresh` ; cookie de navigation `__session` (lu par le middleware Next.js).
  Vérification email **obligatoire au login** (403 sinon). **Sign in with Google**
  (`/auth/google`, vérification signature + audience, liaison par email vérifié).
- **Agents privés** : IAM service-to-service, un **service account dédié par service**,
  zéro rôle superflu (remplace le SA compute par défaut à `roles/editor`).
- **Secrets** : Secret Manager (lecture par le seul backend, par secret) ; aucun secret en
  clair ; le défaut de `SECRET_KEY` est interdit hors dev (`config.py`).
- **Erreurs** : **RFC 7807** (`application/problem+json`, `backend/app/core/problem.py`) ;
  debug forcé off en prod (pas de fuite d'internals).
- **Anti-injection de prompt** (entrées PDF non fiables) : neutralisation des fences,
  document traité comme donnée jamais comme instruction, coercition post-LLM en liste
  blanche, relecture humaine finale. Attaque testée et vaincue en conditions réelles.
- **Rate limiting** applicatif : login 5/min, email 3/min, import 5/h (slowapi, en mémoire —
  cohérent grâce au backend mono-instance). Pas de WAF/Cloud Armor (cf. §8).

## 5. Infra & CI/CD

- **Terraform** (`infra/`) : source de vérité de la **forme** de l'infra — les 5 services
  Cloud Run, IAM (SA par service), Secret Manager, Cloud SQL, bucket GCS, Artifact Registry,
  APIs. `lifecycle ignore_changes[image]` (la CI roule les images) et `[password]` (le mot
  de passe SQL est géré hors Terraform, cf. incident 2026-07-26).
- **GitHub Actions** (`deploy-prod.yml`) : sur `main` — tests → build multi-images
  `linux/amd64` → migrations Alembic (Cloud SQL Proxy) → déploiement Cloud Run + purge CDN
  Firebase, le tout via **Workload Identity Federation** (aucune clé JSON, pool verrouillé
  sur le repo). Staging décommissionné.
- Docker : images multi-stage, user non-root (agents).

## 6. Tests

- Backend : ~140 tests (`TEST_DATABASE_URL` Postgres), dont le pipeline CV, l'import async,
  l'auth Google, le billing (Stripe mocké), l'admin, la coercition d'import.
- Agents : tests unitaires de la coercition post-LLM (`parser-pdf`) ; qualité des prompts via
  `backend/evals/` (juge LLM).
- Frontend : suites Jest (smoke + composants clés) + validations e2e Playwright ponctuelles.

## 7. ADR (décisions actées)

| # | Décision | Statut |
|---|---|---|
| ADR-MODEL | `gemini-2.5-pro` en europe-west9 (souveraineté UE) | Actée ; +10 % qualité mesurée vs flash (juge LLM) |
| ADR-SESSION-REFRESH | Access 15 min + refresh rotatif en base, cookies httpOnly | Livrée |
| ADR-RGPD-ERASURE | Suppression de compte complète (DB + GCS) | Livrée |
| ADR-EMAIL | Emails transactionnels Brevo (domaine talentious.app) | Livrée |
| Contract-First | OpenAPI source de vérité, types générés, dérive bloquée en CI | Livrée |
| Async | Génération ET import en jobs (202 + polling) | Livrée (async imposé aussi par la coupure CDN à 60 s) |
| ADR-GENAI-SDK | Migration vers `google-genai` (contrôle du thinking, modèles 3.x) | **À faire** avant oct. 2026 (fin de vie des 2.5) |

## 8. Écarts / dette résiduelle

1. **Logs non structurés** : `logging` standard, pas de JSON ni de corrélation de requête (à traiter).
2. **Pas de WAF/Cloud Armor** : protection DDoS surtout par plafond d'instances (coût borné) +
   rate limiting ; pas de limite globale ni de bannissement au bord. Différé (bêta, faible trafic).
3. **Budget GCP** : alertes posées en console, pas encore dans Terraform.
4. **Dérive de contrat M7** : quelques endpoints (refresh/logout/password) restent à formaliser dans OpenAPI.
5. **Versioning `/v1`** : billing monté hors du préfixe global (à unifier).
6. **Duplication agents** : `prompt_loader.py` / service Vertex copiés entre agents (à mutualiser).
