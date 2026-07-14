# Runbook — Mise en production sur GCP (M6)

Séquence de go-live, dans l'ordre. Les commandes marquées **[TOI]** manipulent
des secrets ou appliquent l'infra : elles se lancent depuis ton terminal (les
secrets ne transitent jamais par l'assistant).

## ÉTAT D'AVANCEMENT (mis à jour 2026-07-14)

| Étape | État |
|---|---|
| Pré-requis : budget 20 € + alertes, agents staging privés, Terraform complet, images prod, pipeline WIF écrit | ✅ FAIT |
| **Étape 1** — Import + plan + **`terraform apply`** (40 ressources : 5 Cloud Run prod, 6 SA, WIF, secrets, IAM) | ✅ **FAIT** — vérifié : backend `/health` 200, frontend 200, agents 403 (privés), SA dédiés. Reprise nécessaire : vieilles images `:latest` (arm64 + code obsolète) remplacées par les images prod buildées en `--platform linux/amd64` et poussées manuellement |
| **Étape 2** — Valeurs des secrets (STRIPE_SECRET_KEY, BREVO_API_KEY) | ✅ FAIT — sauf `STRIPE_WEBHOOK_SECRET` = **placeholder volontaire** (vrai `whsec_` à l'étape 4 bis) |
| **Étape 3** — Variable GitHub `NEXT_PUBLIC_API_URL` | ⬜ À FAIRE |
| **Étape 4** — Merge → `main` (1er run du pipeline : tests, images amd64, **migrations Alembic prod**, rollout, smoke) | ⬜ À FAIRE — ⚠️ la base prod n'a pas encore les tables récentes (refresh_tokens…) : le login prod échoue tant que ce n'est pas fait |
| **Étape 4 bis** — Webhook Stripe prod + vrai `whsec_` | ⬜ À FAIRE |
| **Étape 5** — Domain mapping `talentious.app` / `api.talentious.app` + DNS web | ⬜ À FAIRE — ⚠️ aucun enregistrement web ne pointe vers Cloud Run (les DNS déjà posés ne concernent que l'email DKIM/DMARC). Le frontend prod étant compilé avec `NEXT_PUBLIC_API_URL=https://api.talentious.app`, **il ne joint pas l'API tant que ce mapping n'existe pas** |
| **Étape 6** — Décommission `*-staging` + smoke complet + **[PAH-5]** | ⬜ À FAIRE |

---

## Étape 1 — Terraform : import de l'existant + plan [TOI]

```bash
cd infra
terraform init   # backend d'état GCS déjà configuré (talentious-tf-state-1000)

# Les 2 secrets créés jadis par script (hors TF) doivent être importés :
terraform import 'google_secret_manager_secret.app["JWT_SECRET_KEY"]' projects/talentious-project/secrets/JWT_SECRET_KEY
terraform import 'google_secret_manager_secret.app["DATABASE_URL"]'   projects/talentious-project/secrets/DATABASE_URL

# Plan (le mot de passe DB actuel, celui de l'instance existante) :
export TF_VAR_db_password='<mot de passe talentious-app actuel>'
export TF_VAR_stripe_price_30_days='<price_... du pass 30j>'
export TF_VAR_stripe_price_90_days='<price_... du pass 90j>'
terraform plan -out=tf.plan
```

**⛔ POINT D'ARRÊT [PAH]** : colle le résumé du plan dans la session — je le
relis ligne à ligne avant que tu fasses `terraform apply tf.plan`.
Attendu : créations (5 Cloud Run, 6 SA, WIF, 3 secrets STRIPE/BREVO, IAM),
modifications (SQL durcie, bucket, AR cleanup), **0 destruction**.

## Étape 2 — Valeurs des 3 nouveaux secrets [TOI]

Après l'apply (les conteneurs de secrets existent alors) :

```bash
printf '%s' 'sk_test_...'    | gcloud secrets versions add STRIPE_SECRET_KEY    --data-file=-
printf '%s' 'whsec_...'      | gcloud secrets versions add STRIPE_WEBHOOK_SECRET --data-file=-
printf '%s' 'xkeysib-...'    | gcloud secrets versions add BREVO_API_KEY        --data-file=-
```

Notes :
- `STRIPE_WEBHOOK_SECRET` : créer d'abord l'endpoint webhook **prod** dans le
  dashboard Stripe (URL : `https://<backend>/billing/webhook`, événement
  `checkout.session.completed`) → il fournit le `whsec_...`.
- Stripe reste en **mode test** tant que l'immatriculation n'est pas faite
  (prérequis légal M7-T08).

## Étape 3 — GitHub : variable d'environnement front [TOI]

- Secret `CLOUD_SQL_DB_PASSWORD` : existe déjà (pipelines staging).
- Variable de repo `NEXT_PUBLIC_API_URL` : à créer après l'étape 5 avec l'URL
  API finale (`https://api.talentious.app` si le domain mapping est actif,
  sinon l'URL run.app du backend).

## Étape 4 — Premier déploiement

Merger `restructuration/v1-foundations` → `main` (via PR). Le workflow
`deploy-prod.yml` : tests → build des 5 images prod → migrations → rollout →
smoke. (Au premier run, les services existent déjà via l'apply de l'étape 1.)

## Étape 5 — Domaine talentious.app [TOI]

1. Vérifier la propriété du domaine auprès de Google (Search Console) si
   demandé par Cloud Run.
2. Mappings :
   ```bash
   gcloud beta run domain-mappings create --service=frontend --domain=talentious.app       --region=europe-west9
   gcloud beta run domain-mappings create --service=backend  --domain=api.talentious.app   --region=europe-west9
   ```
   (si les domain mappings ne sont pas disponibles en europe-west9, plan B
   gratuit : proxy Cloudflare devant les URLs run.app — pas de Load Balancer payant.)
3. Ajouter chez le registrar les enregistrements DNS que la commande affiche
   (A/AAAA pour l'apex, CNAME `ghs.googlehosted.com.` pour `api`).
4. Rebuilder le frontend avec `NEXT_PUBLIC_API_URL=https://api.talentious.app`
   (relancer le workflow) une fois le mapping actif.

## Étape 6 — Smoke test complet puis PAH-5 [TOI + assistant]

Parcours réel sur https://talentious.app : inscription (email de vérification
reçu), profil, génération d'un CV, export PDF, paiement test Stripe, suppression
de compte. **⛔ [PAH-5]** : validation humaine avant toute communication publique.

## Pièges appris (2026-07-14)

- **Jamais appliquer un `tf.plan` périmé** : si un déploiement pipeline est passé
  entre le `plan` et l'`apply`, l'apply rejoue l'ancienne image capturée dans le
  plan (rollback silencieux constaté sur le frontend). Toujours re-`plan` juste
  avant d'`apply`.
- **CDN Firebase** : Next émet `s-maxage=1an` sur les pages pré-rendues ; toute
  purge manuelle (`firebase deploy --only hosting`) doit se faire APRÈS que la
  bonne révision Cloud Run est en service, sinon le CDN re-cache l'ancienne.
- **GitHub Actions** : `actions/checkout` nettoie le workspace — il doit précéder
  `google-github-actions/auth` (sinon le fichier de credentials WIF est effacé).

## Post-go-live (rappels)

- Basculer `FRONTEND_BASE_URL` local à `http://localhost:3000` si modifié.
- Décommissionner les services `*-staging` (console ou gcloud, action humaine).
- DMARC : passer `p=none` → `p=quarantine` après quelques semaines.
- Surveiller le budget (alertes 50/80/100 % sur egbedozin@gmail.com).
