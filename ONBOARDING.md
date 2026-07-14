# ONBOARDING — Reprise du projet Talentious

> Analyse du 2026-07-08 sur `esdrasgbedozin/Talentious@main` (commit `743eac1`, 2026-06-28).
> ⚠️ **Le dossier local `~/Documents/GitHub/Talentious` est un squelette vide** (dossiers sans
> fichiers, pas de repo git). La première action matérielle est de re-cloner le dépôt.

---

## 1. Ce qu'est le projet (en 5 lignes)

SaaS B2C français de génération de CV optimisés par IA (Vertex AI Gemini 2.5 Flash, Paris).
Monorepo : frontend Next.js 16, backend FastAPI, 3 micro-agents IA (parser-pdf, analyseur-offre,
rédacteur-cv), PostgreSQL/JSONB, cible GCP Cloud Run `europe-west9`, CI GitHub Actions.
Monétisation prévue par « Pass » Stripe à durée limitée. Phases 0-3 de la roadmap réalisées
(auth, profil, agents IA, orchestration) ; phases 4-6 (dashboard, éditeur, export PDF, Stripe, prod) **non commencées**.

## 2. État de santé global : 🟠 fondations réelles, cœur de valeur cassé, produit non livrable en l'état

Ce qui est solide : auth JWT testée, CRUD profil testé, agents IA individuellement fonctionnels,
Docker/CI staging bien structurés, souveraineté `europe-west9` respectée, harnais d'evals des prompts.

## 3. Pourquoi « la génération de CV ne fonctionnait pas » — diagnostic

Quatre causes indépendantes, par ordre de certitude :

1. **Bug bloquant certain — `NameError: timezone`** : `backend/app/routes/cv.py:101` appelle
   `datetime.now(timezone.utc)` mais la ligne 7 n'importe que `datetime`. Tout utilisateur
   **non-admin** appelant `POST /cv/generate` déclenche un crash → 500 « CV generation failed:
   name 'timezone' is not defined », avant même de vérifier son CareerPass. Aucun test ne couvre ce module.
2. **Rupture de contrat certifications** : le backend envoie `issuing_organization`/`issue_date`
   (schéma `profile.py`), l'agent rédacteur exige `issuer` (champ requis de `Certification`,
   `agents/redacteur-cv/app/models.py:88-95`) → **422 pour tout profil contenant une certification**.
   Même famille de bug que le conflit skills « résolu » en nov. 2025 (transformation runtime dans
   `cv.py`, qui ne traite QUE les skills).
3. **Sorties IA sur-contraintes** : `GeneratedCVData` exige `graduation_date`/`issue_date` en `str`
   requis alors que les entrées sont optionnelles → validation 422 aléatoire selon la réponse de Gemini
   (retry ×3 puis échec).
4. **Pas de CareerPass attribuable** : aucune route Stripe ni seed admin → en production, personne
   ne peut franchir le contrôle 402 (seul un UPDATE SQL manuel du rôle le permet).

À cela s'ajoute : **aucune UI de génération** (pas de dashboard ni de bouton « Générer ») — le
pipeline n'est déclenchable que via curl/Swagger.

## 4. Les 3 risques majeurs

1. **Contrats implicites divergents (risque produit n°1)** : 4 définitions concurrentes du profil
   (frontend TS, backend Pydantic, entrée agents, sortie agents), synchronisées « à la main » et par
   une couche de transformation partielle. Chaque évolution recassera la génération. → Formaliser un
   contrat unique (OpenAPI + schémas partagés) avant tout nouveau code.
2. **Sécurité pré-V1** : JWT en localStorage, cookie de session client spoofable, CORS backend limité
   à localhost (staging probablement cassé ou ouvert à la main), `SECRET_KEY` avec défaut faible,
   erreurs 500 qui exposent les exceptions, exposition IAM réelle des agents Cloud Run non vérifiée.
3. **Chaîne de livraison morte** : la branche `develop` a été supprimée → plus aucun workflow ne se
   déclenche ; aucun pipeline de production n'existe ; Cloud Run hors Terraform (dérive IaC) ;
   coût/état réel de l'infra GCP inconnu **[audit gcloud en lecture seule recommandé]**.

## 5. Par où commencer (ordre recommandé)

1. **Re-cloner le dépôt** dans le dossier local (le squelette actuel est vide) et recréer `develop`.
2. **Hotfix testé du pipeline** (~2 h, TDD) : import `timezone` dans `cv.py` + test rouge/vert sur
   `POST /cv/generate` (mock des agents) ; corriger le mapping certifications ; assouplir les champs
   requis de `GeneratedCVData`.
3. **`/audit` puis `/contrats`** : contre-expertise croisée des documents reconstruits, puis contrat
   OpenAPI unique couvrant backend + agents (source de vérité, types régénérés des deux côtés).
4. **`/roadmap` recalibrée** vers l'objectif « application fonctionnelle sur GCP » : reste ≈ 5 chantiers
   (UI génération/dashboard, template + export PDF, import PDF réellement branché, Stripe ou bypass
   admin propre, durcissement sécurité + IaC Cloud Run + pipeline prod).

## 6. Questions ouvertes pour l'humain

- L'infra GCP (projet `talentious-project`) est-elle toujours active/facturée ? Les services Cloud Run
  staging existent-ils encore ?
- Pourquoi `develop` a-t-elle été supprimée — volonté de repartir de zéro ou accident ?
- Le dossier local vide est-il un reliquat à écraser, ou contenait-il du travail non poussé (perdu) ?
- Confirmez-vous la cible : V1 = génération + éditeur simple + export PDF + Pass Stripe, en production GCP ?
- Génération 2-5 min : accepte-t-on une file asynchrone (polling/SSE) en V1 ? (fortement recommandé)

## 6bis. Lancer le pipeline en local (smoke test — M1)

Prérequis : Postgres up (`docker compose up -d db`), venv backend (`backend/.venv-py312`).

```bash
# 1. Base de test / dev + migrations
docker exec talentious_db psql -U talentious -d talentious -c "CREATE DATABASE talentious" 2>/dev/null || true
cd backend && cp -n .env.example .env
DATABASE_URL=postgresql+asyncpg://talentious:talentious@localhost:5432/talentious .venv-py312/bin/python -m alembic upgrade head

# 2. Compte admin (débloque la génération sans Stripe)
ADMIN_EMAIL=admin@talentious.local ADMIN_PASSWORD=adminpassword .venv-py312/bin/python -m scripts.seed_admin

# 3. Lancer le backend + les 3 agents (Vertex AI nécessite des credentials GCP)
docker compose up backend analyseur-offre redacteur-cv

# 4. Flux : login admin -> POST /cv/generate {cv_name, offer_text}
#    -> 202 {job_id} -> polling GET /cv/jobs/{job_id} jusqu'à "succeeded"
#    -> GET /cv/{cv_id} : le CV contient languages, achievements, is_current,
#       field, expiration_date, credential_url, projects.role (champs jadis perdus).
```

## 6ter. Tester le paiement Stripe en local (mode test — M3)

Même code qu'en production ; seules les clés changent (test vs live).

1. **Dashboard Stripe (mode test)** → récupérer `sk_test_...` et créer 2 Produits/Prix
   (pass 30 j, pass 90 j) → noter les `price_...`.
2. **Stripe CLI** (fournit le webhook secret local) :
   ```bash
   stripe login
   stripe listen --forward-to localhost:8000/billing/webhook
   # -> affiche whsec_... : c'est STRIPE_WEBHOOK_SECRET
   ```
3. Lancer le backend avec les clés de test :
   ```bash
   STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_... \
   STRIPE_PRICE_30_DAYS=price_... STRIPE_PRICE_90_DAYS=price_... \
   docker compose up -d backend
   ```
4. Flux : `POST /billing/checkout-session {pass_type:"PASS_30_DAYS"}` → `checkout_url`
   → payer avec la carte de test `4242 4242 4242 4242` → Stripe envoie
   `checkout.session.completed` au webhook → un `CareerPass` est créé →
   `GET /billing/status` renvoie `has_active_pass: true`.

Aucune clé n'est nécessaire pour la suite de tests (`pytest`) : Stripe y est mocké.

Sans credentials Vertex, la suite de tests (`pytest`) valide tout le pipeline avec agents mockés (33 tests verts).

## 7. Repères rapides

| Sujet | Où regarder |
|---|---|
| Orchestration génération (async, M1) | `backend/app/routes/cv.py` + `backend/app/services/cv_worker.py` |
| Contrat canonique (source de vérité) | `contracts/openapi.yaml` → types générés `backend/app/generated/`, `frontend/src/generated/` |
| Historique du bug skills | `.github/BUG_SKILLS_STRUCTURE_CONFLICT.md` |
| Prompts IA | `agents/*/prompts/*.txt` (+ Secret Manager prévu) |
| Evals qualité prompts | `backend/evals/run_evals.py` |
| Infra | `infra/*.tf` (partiel) + `.github/workflows/*.yml` (le reste) |
| Vision produit historique | `PROJECT_CONTEXT.md`, `ROADMAP.md` (1397 lignes) |
