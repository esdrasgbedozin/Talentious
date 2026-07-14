# Runbook — Mise en production sur GCP (M6)

Séquence de go-live, dans l'ordre. Les commandes marquées **[TOI]** manipulent
des secrets ou appliquent l'infra : elles se lancent depuis ton terminal (les
secrets ne transitent jamais par l'assistant). Prérequis déjà faits : budget
20 €, agents privés, Terraform complet (`infra/`), images prod, pipeline WIF.

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

## Post-go-live (rappels)

- Basculer `FRONTEND_BASE_URL` local à `http://localhost:3000` si modifié.
- Décommissionner les services `*-staging` (console ou gcloud, action humaine).
- DMARC : passer `p=none` → `p=quarantine` après quelques semaines.
- Surveiller le budget (alertes 50/80/100 % sur egbedozin@gmail.com).
