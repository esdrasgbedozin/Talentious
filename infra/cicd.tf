# =============================================================================
# CI/CD — Workload Identity Federation (GitHub Actions → GCP sans clé JSON)
# =============================================================================
# Remplace le secret GCP_SA_KEY (clé de service account longue durée, risque n°5
# de l'audit) par une fédération OIDC : GitHub Actions échange son jeton signé
# contre des identifiants GCP éphémères. Aucune clé à stocker ni à faire fuiter.
# Le provider est VERROUILLÉ sur ce dépôt (attribute_condition) : aucun autre
# repo GitHub ne peut assumer l'identité.

locals {
  github_repository = "esdrasgbedozin/Talentious"
}

resource "google_project_service" "iam_credentials" {
  service            = "iamcredentials.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "sts" {
  service            = "sts.googleapis.com"
  disable_on_destroy = false
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions"
  description               = "Fédération OIDC pour les workflows du dépôt Talentious"
  depends_on                = [google_project_service.iam_credentials, google_project_service.sts]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  # Verrou : seuls les jetons émis pour CE dépôt sont acceptés.
  attribute_condition = "assertion.repository == \"${local.github_repository}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# SA déployeur — ce que la CI a le droit de faire, et rien de plus.
resource "google_service_account" "deployer" {
  account_id   = "github-deployer"
  display_name = "GitHub Actions deployer (WIF, prod)"
}

# La CI peut assumer ce SA via le pool, uniquement depuis notre dépôt.
resource "google_service_account_iam_member" "deployer_wif" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${local.github_repository}"
}

# Rôles projet du déployeur :
# - pousser les images, mettre à jour les services Cloud Run, exécuter les
#   migrations via le Cloud SQL proxy. PAS d'accès aux secrets, PAS d'editor.
resource "google_project_iam_member" "deployer_ar_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_project_iam_member" "deployer_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_project_iam_member" "deployer_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Redéployer la façade Firebase Hosting après chaque rollout : c'est ce qui
# PURGE le cache CDN (Next émet s-maxage=1an sur les pages pré-rendues — sans
# purge, les POP serviraient l'ancien HTML jusqu'à un an après un déploiement).
resource "google_project_iam_member" "deployer_firebase_hosting" {
  project = var.project_id
  role    = "roles/firebasehosting.admin"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# Nécessaire pour déployer des révisions qui tournent sous les SA runtime
# (actAs) — restreint aux 5 SA de service, pas au niveau projet.
resource "google_service_account_iam_member" "deployer_acts_as" {
  for_each = {
    backend   = google_service_account.backend.name
    frontend  = google_service_account.frontend.name
    parser    = google_service_account.parser.name
    analyseur = google_service_account.analyseur.name
    redacteur = google_service_account.redacteur.name
  }
  service_account_id = each.value
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

output "wif_provider" {
  value       = google_iam_workload_identity_pool_provider.github.name
  description = "À renseigner dans le workflow GitHub (workload_identity_provider)"
}

output "deployer_email" {
  value       = google_service_account.deployer.email
  description = "SA que la CI assume via WIF"
}
