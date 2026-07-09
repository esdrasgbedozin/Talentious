# 01 — ARCHITECTURE TECHNIQUE « TALENTIOUS » (reconstruite par rétro-ingénierie)

> **Statut** : constat du réel au 2026-07-08 (commit `743eac1` sur `main`).
> Ce document décrit ce qui **est**, pas ce qui devrait être. Les écarts sont listés en §7.

---

## 1. Topologie constatée

Monorepo, 5 services conteneurisés + PostgreSQL :

```
Navigateur
   │ HTTPS (JWT localStorage + cookie témoin "talentious_session")
   ▼
Frontend  Next.js 16 / React 19 / Tailwind 4        (Cloud Run public, port 3000)
   │ REST JSON (axios, intercepteur Bearer)
   ▼
Backend   FastAPI 0.104 / SQLAlchemy 2 async        (Cloud Run public, port 8000)
   │  ├── PostgreSQL 15  (Cloud SQL `talentious-db-prod`, JSONB profils & CV)
   │  ├── httpx ──► parser-pdf      FastAPI + PyMuPDF          (port 8001, privé)  [client jamais branché]
   │  ├── httpx ──► analyseur-offre FastAPI + Vertex AI Gemini (port 8002, privé)
   │  └── httpx ──► redacteur-cv    FastAPI + Vertex AI Gemini (port 8003, privé)
   ▼
Vertex AI  gemini-2.5-flash, région europe-west9 (Paris), sortie JSON forcée, retry ×3
```

- **Orchestration** : `POST /cv/generate` (backend `routes/cv.py`) = chef d'orchestre
  séquentiel : CareerPass → profil → transformation skills → analyseur → rédacteur → INSERT.
  Durée constatée 2-5 min, appel HTTP synchrone (pas de job/queue).
- **Dev local** : `docker-compose.yml` avec les 5 services + `db` + conteneur `evals`.

## 2. Contrats d'interface (état : implicites, non formalisés)

Il n'existe **aucun fichier de contrat** (pas d'`openapi.yaml` versionné). Les contrats
vivent dans 4 jeux de modèles Pydantic/TypeScript **divergents** :

| Couche | Skills | Certification | Education |
|---|---|---|---|
| Frontend `types/profile.ts` & Backend `schemas/profile.py` | `{hard: string[], soft: string[]}` | `issuing_organization`, `issue_date` | `field_of_study`, `start_date` requis |
| Backend → agents (transformation runtime dans `cv.py`) | `[{name, level, category}]` (niveaux devinés : hard=advanced, soft=intermediate) | transmis tel quel ❌ | transmis tel quel |
| Agent `redacteur-cv/models.py` (entrée) | `List[Skill]` | **`issuer` requis** ❌, `date` | `field`, dates optionnelles |
| Agent (sortie `GeneratedCVData`) | `HighlightedSkill{name, level, category, importance}` | `SelectedCertification.issue_date: str` **requis** | `SelectedEducation.graduation_date: str` **requis** |

Un script `verify_contracts.sh` (curl manuel) fait office de test de contrat — non exécuté en CI.

## 3. Modèle de données (PostgreSQL, migrations Alembic)

- `users` : UUID PK, email unique, `hashed_password` (bcrypt), `role` enum USER/ADMIN, `stripe_customer_id`.
- `user_profiles` : `user_id` PK/FK cascade, `profile_data JSONB`, `updated_at` (naïf, `datetime.utcnow()`).
- `career_passes` : `pass_type` enum PASS_30_DAYS/PASS_90_DAYS, `valid_until`, `stripe_payment_id`.
- `generated_cvs` : `cv_name`, `template_id`, `job_offer_context` (texte brut de l'offre), `cv_data_json JSONB`, `gcs_pdf_url` (jamais renseigné), index sur `created_at`.
- 2 migrations : schéma initial + `0a59b3039eea` (normalise skills → `{hard, soft}` ;
  ⚠️ `jsonb_agg` sur tableau vide produit `null` et non `[]`).

## 4. Sécurité (constatée)

- Auth : JWT HS256 30 min (`python-jose`), bcrypt 4.0.1 ; `get_current_active_user` dans `services/dependencies.py`.
- **Token stocké en `localStorage`** (dette actée dans la ROADMAP §2.2) + cookie `talentious_session=true`
  posé **côté client**, uniquement lu par le middleware Next.js → protection de route **cosmétique, spoofable**.
- CORS backend : localhost uniquement dans `config.py` (les URLs staging Cloud Run ne sont pas dans la liste par défaut). Agents : `allow_origins=["*"]`.
- Secrets : `SECRET_KEY`/`DATABASE_URL` via GitHub Secrets + Secret Manager (scripts `.github/scripts/create-secrets.sh`) ; défaut dangereux `"your-secret-key-change-in-production"` dans le code.
- Agents censés être privés (IAM service account) — `parser_client.py` gère un token IAM, mais rien n'atteste que les services Cloud Run agents sont déployés en `--no-allow-unauthenticated` **[à confirmer sur GCP]**.
- Erreurs API : format FastAPI par défaut, **pas de RFC 7807** ; les 500 renvoient `str(e)` (fuite d'internals).

## 5. Infra & CI/CD

- **Terraform** (`infra/`) : APIs, Cloud SQL `db-f1-micro` (deletion_protection=false), bucket GCS `-cvs` versionné, Artifact Registry. **Non géré par Terraform** : services Cloud Run, IAM, Secret Manager, réseau → dérive IaC structurelle (les Cloud Run sont créés par `gcloud run deploy` dans les workflows).
- **GitHub Actions** : 3 workflows staging (backend avec pytest + migration Alembic via Cloud SQL Proxy v2, frontend, agents) déclenchés sur `develop` par filtre de chemin. **Aucun workflow de production**, aucun lint/scan sécurité en CI. ⚠️ La branche `develop` **n'existe plus sur origin** (seul `main` subsiste) : la CI staging est donc actuellement morte.
- Docker : images multi-stage, user non-root (agents).

## 6. Tests

- Backend : 23 tests (auth 12, profile 9, main 2) sur SQLite/`TEST_DATABASE_URL` — **0 test sur `routes/cv.py`**, le module le plus critique et le plus bogué.
- Agents : **0 test unitaire** ; qualité prompts via `backend/evals/run_evals.py` (2 résultats commités).
- Frontend : 3 suites (~20 tests smoke). Pas d'e2e, pas de couverture mesurée.

## 7. ADR rétroactifs (décisions constatées)

| # | Décision | Motivation apparente | Statut |
|---|---|---|---|
| ADR-R1 | Monorepo 3 tiers + microservices IA sur Cloud Run | Isolation des prompts/scaling IA | OK, mais 3 agents ≈ 90 % de code dupliqué (`vertex_ai_service.py`, `prompt_loader.py` copiés-collés) |
| ADR-R2 | `europe-west9` + `gemini-2.5-flash` partout | RGPD / souveraineté FR | Respectée |
| ADR-R3 | Profil & CV en JSONB (schéma validé par Pydantic) | Flexibilité d'itération | OK mais a produit 4 contrats divergents (cf. §2) |
| ADR-R4 | Transformation skills à la volée dans `cv.py` (« Option A », bug 342c31f) | Débloquer vite sans refactorer | **Contredit** la reco du rapport de bug (qui préconisait d'aligner les agents) ; couche fragile |
| ADR-R5 | JWT en localStorage + cookie témoin | Rapidité MVP | Dette actée, migration HttpOnly « avant V1 » jamais faite |
| ADR-R6 | Génération synchrone HTTP 2-5 min (timeout httpx 600 s) | Simplicité | Incompatible Cloud Run/UX ; nécessitera jobs asynchrones ou streaming |
| ADR-R7 | Cloud Run déployé par gcloud CLI, hors Terraform | Rapidité | Dérive IaC à résorber |

## 8. Écarts majeurs vs les 6 piliers

1. **Contract-first inversé** : les contrats sont déduits du code et divergent entre couches (bug CV en est le symptôme direct).
2. **TDD absent sur le cœur** : le pipeline de génération n'a aucun test — un `NameError` a atteint `main`.
3. **Dette volontaire assumée** (« MVP », localStorage, transformation runtime) documentée mais jamais résorbée.
4. **Logs non structurés** : `logging` texte + emojis, pas de JSON, pas de corrélation requête.
5. **IaC partielle** : la moitié de l'infra vit dans des scripts CI.
6. **Roadmap non réaliste** : phases 4-6 (dashboard, éditeur, Stripe, prod) intactes alors que la doc les présente comme « débloquées ».
