# 05 — AUDIT INFRA & GCP (M6-T01, PAH-4)

- **Date** : 2026-07-14 · **Méthode** : double audit lecture seule (cartographie du repo + inventaire `gcloud` du projet réel `talentious-project`, impersonation SA `claude-mcp-readonly@`, roles/viewer). Aucune ressource modifiée.
- **Objectif** : fonder le déploiement V1 sur `talentious.app` à **moindre coût**, sans bâcler sécurité ni garde-fous.

---

## 1. Ce qui facture AUJOURD'HUI (état réel)

| Ressource | État | Coût estimé/mois |
|---|---|---|
| **Cloud SQL `talentious-db-prod`** (db-f1-micro, 10 Go SSD, RUNNABLE 24/7) | ✅ seule ressource always-on | **~9–11 €** |
| Artifact Registry `talentious-images` (~2 Go) | stockage | ~0,20 € |
| 2 buckets GCS (cvs, tf-state) | quasi vides | ~0,05 € |
| Cloud Run ×5 (`*-staging`) | **min-instances 0 → 0 € au repos** | ~0 € (à l'invocation) |
| Vertex AI (Gemini) | à l'usage (tokens) | variable, 0 € dormant |

**Total dormant : ~10 €/mois.** Aucune VM, IP réservée, Redis, LB ou scheduler (APIs désactivées). C'est déjà proche du plancher GCP avec un Postgres managé.

⚠️ **Angle mort financier** : l'API Cloud Billing est désactivée → **aucune alerte de budget n'existe (ou n'est vérifiable)**. Si un service IA public est abusé (voir §2.1), rien ne préviendrait avant la facture.

## 2. Écarts IaC ↔ réel — constats majeurs

### 2.1 Sécurité (bloquants avant prod)
1. **Les 5 Cloud Run sont PUBLICS** (`allUsers` invoker), y compris les 3 agents internes (parser, analyseur, rédacteur). N'importe qui sur Internet peut invoquer les endpoints **Vertex AI (coût LLM) sans auth**. Confirme BLK-4 de l'audit initial.
2. **Identité runtime = SA compute par défaut avec roles/editor** sur les 5 services : un service compromis a Editor sur tout le projet.
3. **Cloud SQL** : IP publique, `requireSsl=false` (connexions non chiffrées acceptées), `deletion_protection=false`, PITR off.
4. **2 comptes Owner** : `egbedozin@gmail.com` et `Ozesde04@gmail.com` (+ billing manager les deux). → à confirmer par le fondateur.
5. Auth CI par **clé JSON longue durée** (`GCP_SA_KEY`) au lieu de Workload Identity Federation.

### 2.2 Dérive IaC (Terraform ≠ réalité)
- Terraform ne gère que : APIs, Cloud SQL, DB/user, bucket cvs, Artifact Registry. **Tout Cloud Run + IAM + Secret Manager est hors TF** (créé par CI/scripts).
- `var.project_id` sans défaut ni tfvars versionné ; noms d'instance incohérents entre TF, scripts et config.
- Bucket cvs : `force_destroy=true`, versioning sans lifecycle, et **aucun code backend ne l'utilise** (fonctionnalité PDF GCS non implémentée).

### 2.3 Chaîne de déploiement cassée / incomplète
- Les 3 workflows de déploiement ne partent que de **`develop`** → le travail courant (`restructuration/v1-foundations`, à merger dans `main`) **ne se déploie jamais**. Aucun pipeline de production.
- Dockerfiles **backend et frontend = dev** (root, `uvicorn --reload`, `npm install`, mono-stage) — les agents, eux, sont durcis correctement.
- **Secrets prod incomplets** : Secret Manager ne contient que `DATABASE_URL` et `JWT_SECRET_KEY`. **`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `BREVO_API_KEY` ne sont provisionnés nulle part** → paiement et email inertes en déploiement.
- CORS backend = localhost uniquement ; `NEXT_PUBLIC_API_URL` figé au build avec un placeholder jamais remplacé.
- Rate limiting en mémoire → cassé si `max-instances > 1` (pas de Redis, et on n'en veut pas pour le coût).

## 3. Plan de déploiement V1 à moindre coût (proposé)

**Cible coût : ~10–15 €/mois** en bêta (inchangé vs aujourd'hui), avec un budget d'alerte à 20 €.

### Principes d'économie (sans rien bâcler)
- **Scale-to-zero partout** (déjà le cas) : cold start ~2–4 s acceptable en bêta.
- **Une seule instance Cloud SQL db-f1-micro** partagée (bases `talentious` app + rien d'autre) — le plancher Postgres managé. Pas de HA (bêta) mais **PITR + deletion_protection activés** (coût marginal, protection réelle).
- **`max-instances=1` sur le backend** en bêta : règle le rate-limit in-memory **sans payer Redis** (~30 €/mois économisés), suffisant pour le trafic bêta.
- **Pas de Load Balancer global** (~18 €/mois évités) : domaine `talentious.app` branché par **domain mapping Cloud Run** (gratuit) ou proxy Cloudflare gratuit si indisponible en europe-west9.
- Nettoyage : cleanup policy Artifact Registry (garder ~5 dernières images), désactiver l'API containerregistry legacy, **supprimer le bucket cvs inutilisé** (ou le garder vide à ~0 €, décision à l'implémentation TF).
- Vertex : quotas déjà bornés côté app (1 génération active/utilisateur) ; **la privatisation des agents (3.2) est la vraie protection anti-coût**.

### Séquence (tickets M6 existants, ordre coût/sécurité d'abord)
1. **Garde-fous financiers** [action fondateur + M5-T08] : activer Cloud Billing API, créer un **budget 20 €/mois avec alertes 50/80/100 %**.
2. **Sécuriser l'existant** [M5-T01/T02/T07] : agents en `--no-allow-unauthenticated` + invoker réservé au SA backend (le code `ENABLE_IAM_AUTH` existe déjà côté parser, à généraliser) ; SA runtime dédiés par service (fin du compute-Editor) ; `deletion_protection=true`, `requireSsl`, PITR sur Cloud SQL ; `force_destroy=false`.
3. **Réconcilier Terraform** [M6-T02/T03/T04] : importer l'existant (SQL, buckets, AR), déclarer les 5 Cloud Run + IAM + secrets (ajouter STRIPE_*, BREVO_API_KEY), fixer `project_id`, backend d'état versionné.
4. **Images de prod** : Dockerfiles backend/frontend multi-stage non-root sans `--reload` ; healthchecks.
5. **Pipeline prod** [M6-T05] : workflow sur `main` (build → push → deploy), **Workload Identity Federation** (suppression de la clé JSON), smoke test post-deploy.
6. **Domaine & config prod** [M6-T06] : `talentious.app` → frontend, `api.talentious.app` → backend ; CORS + `FRONTEND_BASE_URL` + `NEXT_PUBLIC_API_URL` prod ; DNS chez le registrar.
7. **Smoke prod + PAH-5** [M6-T11/T13] : parcours complet (inscription → email réel → génération → PDF → paiement test) avant ouverture.

## 4. Questions ouvertes — TRANCHÉES par le fondateur (2026-07-14, PAH-4 validé)
1. **`Ozesde04@gmail.com`** = second compte du fondateur → **conservé** (accès de secours).
2. **Budget d'alerte : 20 €/mois** (alertes 50/80/100 %).
3. **Prod seule** : les services `*-staging` seront remplacés par la prod ; le dev/test reste en local (docker-compose).
