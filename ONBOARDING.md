# ONBOARDING — Projet Talentious

> Mis à jour le 2026-08-08. Talentious est **en production** sur https://talentious.app
> (API `api.talentious.app`). Ce guide sert à reprendre le projet rapidement.

---

## 1. Ce qu'est le projet (en 5 lignes)

SaaS B2C français de génération de CV optimisés par IA (Vertex AI **Gemini 2.5 Pro**, Paris).
Monorepo : frontend Next.js, backend FastAPI, 3 agents IA privés (parser-pdf = import,
analyseur-offre, rédacteur-cv), PostgreSQL/JSONB, **5 services Cloud Run** en `europe-west9`,
CI/CD GitHub Actions (Workload Identity Federation). Monétisation par « Pass » Stripe à durée
limitée (mode test, bêta gratuite en attendant le SIRET). **Développeur solo** (le fondateur).

## 2. État de santé global : 🟢 en production, parcours complet fonctionnel

Livré et vérifié en prod : inscription (email vérifié + Sign in with Google), profil,
**import CV/LinkedIn PDF par IA** (asynchrone, relecture humaine), **génération de CV
asynchrone** ciblée offre, éditeur, export PDF, paiement Stripe (Checkout + webhook),
vue admin, suppression RGPD, pages légales, emails transactionnels. Contract-First
(OpenAPI source de vérité, dérive bloquée en CI). ~140 tests backend.

## 3. Architecture en un coup d'œil

Voir `01_ARCHITECTURE_TECHNIQUE.md` pour le détail. L'essentiel :
- Génération et import sont **asynchrones** (202 + job_id + polling) — imposé notamment
  par la coupure à 60 s de la façade CDN Firebase.
- Les 3 agents sont **privés** (auth IAM service-to-service), appelés par le seul backend.
- Sessions : access JWT 15 min + **refresh tokens rotatifs en base** (family burn),
  cookie `__session`. Vérification email obligatoire au login.
- Le mot de passe Cloud SQL de prod se gère **hors Terraform** (`gcloud sql users
  set-password` + secrets) — cf. incident du 2026-07-26.

## 4. Points de vigilance connus

- **Base runtime** : la base applicative de PROD s'appelle `talentious` (utilisateur SQL
  `talentious-app`) ; en LOCAL docker c'est `talentious_app`. Ne pas confondre.
- **Modèles IA 2.5** : leur « thinking » (non désactivable avec le SDK actuel) consomme le
  budget de sortie — d'où `max_output_tokens=32k` sur l'extracteur. Migration `google-genai`
  planifiée (ADR-GENAI-SDK) avant la fin de vie des 2.5 en octobre 2026.
- **DDoS** : pas de WAF/Cloud Armor ; protection par plafond d'instances + rate limiting.
- Build frontend de prod = `frontend/Dockerfile.prod` (tout build-arg `NEXT_PUBLIC_*`
  doit y être déclaré).

## 5. Lancer le pipeline en local (smoke test)

Prérequis : Postgres up (`docker compose up -d db`), venv backend (`backend/.venv-py312`).

```bash
# 1. Migrations sur la base locale talentious_app
DATABASE_URL=postgresql+asyncpg://talentious:talentious@localhost:5432/talentious_app \
  backend/.venv-py312/bin/python -m alembic upgrade head

# 2. Compte admin (débloque la génération sans Stripe)
ADMIN_EMAIL=admin@talentious.local ADMIN_PASSWORD=adminpassword \
  backend/.venv-py312/bin/python -m scripts.seed_admin

# 3. Lancer backend + les 3 agents (Vertex AI nécessite des credentials GCP / ADC)
docker compose up backend analyseur-offre redacteur-cv parser-pdf

# 4. Flux génération : login admin -> POST /cv/generate {cv_name, offer_text}
#    -> 202 {job_id} -> polling GET /cv/jobs/{job_id} jusqu'à "succeeded" -> GET /cv/{cv_id}
# 5. Flux import : POST /profile/import-cv (PDF) -> 202 {job_id}
#    -> polling GET /profile/import-cv/jobs/{job_id} -> brouillon (non persisté)
```

La suite `pytest` valide tout le pipeline avec agents mockés (~140 tests) — aucun credential requis.

## 6. Tester le paiement Stripe en local (mode test)

Même code qu'en production ; seules les clés changent (test vs live). La prod tourne
d'ailleurs en **mode test** (bêta gratuite, pas de SIRET).

1. **Dashboard Stripe (mode test)** → `sk_test_...` + 2 Produits/Prix (pass 30/90 j) → `price_...`.
2. **Stripe CLI** : `stripe listen --forward-to localhost:8000/billing/webhook` → `whsec_...`.
3. Backend avec les clés de test :
   ```bash
   STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_... \
   STRIPE_PRICE_30_DAYS=price_... STRIPE_PRICE_90_DAYS=price_... \
   docker compose up -d backend
   ```
4. Flux : `POST /billing/checkout-session {pass_type:"PASS_30_DAYS"}` → `checkout_url`
   → carte de test `4242 4242 4242 4242` → webhook `checkout.session.completed` → `CareerPass`
   créé → `GET /billing/status` renvoie `has_active_pass: true`.

## 7. Repères rapides

| Sujet | Où regarder |
|---|---|
| Contrat canonique (source de vérité) | `contracts/openapi.yaml` → `backend/app/generated/`, `frontend/src/generated/` |
| Génération async | `backend/app/routes/cv.py` + `backend/app/services/cv_worker.py` |
| Import PDF async | `backend/app/routes/profile.py` + `app/services/import_jobs.py` + agent `agents/parser-pdf/` |
| Auth (Google, refresh, email) | `backend/app/routes/auth.py`, `app/services/{google_auth,refresh}.py` |
| Prompts IA | `agents/*/prompts/*.txt` |
| Evals qualité prompts (juge LLM) | `backend/evals/` |
| Infra (source de vérité de la forme) | `infra/*.tf` + `.github/workflows/deploy-prod.yml` |
| Runbook de déploiement / pièges | `docs/DEPLOY_RUNBOOK.md` |
| Roadmap & décisions | `04_ROADMAP.md`, ADR dans `docs/adr/` |
