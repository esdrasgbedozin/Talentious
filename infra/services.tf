# =============================================================================
# Services de production (Cloud Run v2) + identités + secrets — source de vérité
# =============================================================================
# Principes (cf. 05_AUDIT_INFRA_GCP.md, PAH-4 validé) :
# - Moindre privilège : un service account PAR service, zéro rôle superflu.
#   (remplace le SA compute par défaut qui portait roles/editor — risque n°3)
# - Moindre coût : scale-to-zero partout ; backend max=1 (rate-limit in-memory
#   assumé en bêta, pas de Redis) ; pas de Load Balancer (domain mapping en M6-T06).
# - Les agents IA sont PRIVÉS : seuls backend-sa (invoker) peut les appeler.
# - Les VALEURS de secrets ne passent jamais par Terraform ni par l'assistant :
#   seuls les conteneurs Secret Manager sont déclarés ; les versions sont créées
#   par le fondateur (gcloud secrets versions add / console).
# - CI/CD déploie les nouvelles images ; Terraform ignore le champ image
#   (lifecycle.ignore_changes) pour ne pas se battre avec le pipeline.

locals {
  registry = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker_repo.repository_id}"
  # Les 5 secrets applicatifs. JWT_SECRET_KEY et DATABASE_URL existent déjà
  # (à importer) ; STRIPE_* et BREVO_API_KEY sont nouveaux (paiement + email
  # étaient non déployables — écart n°8 de l'audit).
  app_secrets = toset([
    "JWT_SECRET_KEY",
    "DATABASE_URL",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "BREVO_API_KEY",
  ])
}

# --------------------------------------------------------------------------
# Service accounts dédiés (un par service)
# --------------------------------------------------------------------------

resource "google_service_account" "backend" {
  account_id   = "backend-sa"
  display_name = "Cloud Run backend (API Talentious)"
}

resource "google_service_account" "frontend" {
  account_id   = "frontend-sa"
  display_name = "Cloud Run frontend (aucun privilège)"
}

resource "google_service_account" "parser" {
  account_id   = "parser-sa"
  display_name = "Agent parser-pdf (aucun privilège GCP)"
}

resource "google_service_account" "analyseur" {
  account_id   = "analyseur-sa"
  display_name = "Agent analyseur-offre (Vertex AI)"
}

resource "google_service_account" "redacteur" {
  account_id   = "redacteur-sa"
  display_name = "Agent redacteur-cv (Vertex AI)"
}

# Rôles projet — strictement le nécessaire.
resource "google_project_iam_member" "backend_cloudsql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_project_iam_member" "analyseur_vertex" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.analyseur.email}"
}

# M8-T01 : le parser structure désormais les CV via Gemini (/extract-profile).
resource "google_project_iam_member" "parser_vertex" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.parser.email}"
}

resource "google_project_iam_member" "redacteur_vertex" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.redacteur.email}"
}

# --------------------------------------------------------------------------
# Secret Manager — conteneurs seulement (valeurs ajoutées hors Terraform)
# --------------------------------------------------------------------------

resource "google_secret_manager_secret" "app" {
  for_each  = local.app_secrets
  secret_id = each.key
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

# Seul le backend lit les secrets — accès par secret, pas au niveau projet.
resource "google_secret_manager_secret_iam_member" "backend_reads" {
  for_each  = local.app_secrets
  secret_id = google_secret_manager_secret.app[each.key].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.backend.email}"
}

# --------------------------------------------------------------------------
# Agents IA — privés, appelés uniquement par le backend
# --------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "parser" {
  name     = "parser-pdf"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL" # l'auth est portée par IAM (pas de binding allUsers)

  template {
    service_account = google_service_account.parser.email
    # 120 s : /extract-profile inclut un appel Gemini (~10-40 s) après le parsing.
    timeout = "120s"
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    containers {
      image = "${local.registry}/parser-pdf:${var.image_tag}"
      ports {
        container_port = 8001
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi" # SDK Vertex embarqué (M8-T01)
        }
      }
      env {
        name  = "LOG_LEVEL"
        value = "INFO"
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "GCP_LOCATION"
        value = var.region
      }
      env {
        name  = "VERTEX_AI_MODEL"
        value = var.vertex_ai_model
      }
      env {
        name  = "USE_SECRET_MANAGER"
        value = "false"
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image] # la CI pilote les images
  }
  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service" "analyseur" {
  name     = "analyseur-offre"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.analyseur.email
    timeout         = "300s"
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    containers {
      image = "${local.registry}/analyseur-offre:${var.image_tag}"
      ports {
        container_port = 8002
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "GCP_LOCATION"
        value = var.region
      }
      env {
        name  = "VERTEX_AI_MODEL"
        value = var.vertex_ai_model
      }
      env {
        name  = "USE_SECRET_MANAGER"
        value = "false"
      }
      env {
        name  = "LOG_LEVEL"
        value = "INFO"
      }
      env {
        name  = "PARSER_SERVICE_URL"
        value = google_cloud_run_v2_service.parser.uri
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }
  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service" "redacteur" {
  name     = "redacteur-cv"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.redacteur.email
    timeout         = "600s" # la rédaction est l'étape la plus longue du pipeline
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    containers {
      image = "${local.registry}/redacteur-cv:${var.image_tag}"
      ports {
        container_port = 8003
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "GCP_LOCATION"
        value = var.region
      }
      env {
        name  = "VERTEX_AI_MODEL"
        value = var.vertex_ai_model
      }
      env {
        name  = "USE_SECRET_MANAGER"
        value = "false"
      }
      env {
        name  = "LOG_LEVEL"
        value = "INFO"
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }
  depends_on = [google_project_service.apis]
}

# Invoker : SEUL le backend peut appeler les agents (aucun binding allUsers).
resource "google_cloud_run_v2_service_iam_member" "parser_invoker" {
  name     = google_cloud_run_v2_service.parser.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_cloud_run_v2_service_iam_member" "analyseur_invoker" {
  name     = google_cloud_run_v2_service.analyseur.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.backend.email}"
}

resource "google_cloud_run_v2_service_iam_member" "redacteur_invoker" {
  name     = google_cloud_run_v2_service.redacteur.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.backend.email}"
}

# --------------------------------------------------------------------------
# Backend (API) — public, secrets via Secret Manager, Cloud SQL par socket
# --------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "backend" {
  name     = "backend"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.backend.email
    timeout         = "300s"
    scaling {
      min_instance_count = 0
      # max=1 ASSUMÉ (bêta) : rend fiable le rate-limit in-memory et l'index
      # « un job actif par utilisateur » sans payer Redis. À revoir à la charge.
      max_instance_count = 1
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [google_sql_database_instance.main.connection_name]
      }
    }

    containers {
      image = "${local.registry}/backend:${var.image_tag}"
      ports {
        container_port = 8000
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        # CPU alloué en continu tant qu'une instance vit : le worker de
        # génération tourne en BackgroundTasks (ADR-ASYNC) et serait étranglé
        # par le throttling hors-requête. Coût nul au repos (scale-to-zero).
        cpu_idle          = false
        startup_cpu_boost = true
      }
      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      # ---- Config non sensible ----
      env {
        name  = "ENVIRONMENT"
        value = "production"
      }
      env {
        # Les agents sont privés : chaque appel backend→agent porte un ID token
        # (helper app/services/iam_auth.py, M5-T01).
        name  = "ENABLE_IAM_AUTH"
        value = "true"
      }
      env {
        # Firebase Hosting (façade domaine) supprime tous les cookies entrants
        # SAUF celui nommé "__session" — le cookie de refresh doit donc porter
        # ce nom en prod, sinon /auth/refresh ne le reçoit jamais.
        name  = "REFRESH_COOKIE_NAME"
        value = "__session"
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "CORS_ORIGINS"
        value = var.frontend_public_url
      }
      env {
        name  = "FRONTEND_BASE_URL"
        value = var.frontend_public_url
      }
      env {
        # URLs de retour du checkout Stripe (succès/annulation). Variable
        # distincte de FRONTEND_BASE_URL dans le code (défaut localhost:3000 —
        # bug vécu : redirection vers localhost après paiement en prod).
        # TODO code : unifier app_base_url et frontend_base_url.
        name  = "APP_BASE_URL"
        value = var.frontend_public_url
      }
      env {
        name  = "EMAIL_ENABLED"
        value = "true"
      }
      env {
        name  = "EMAIL_SENDER_ADDRESS"
        value = "noreply@talentious.app"
      }
      env {
        name  = "EMAIL_SENDER_NAME"
        value = "Talentious"
      }
      env {
        name  = "STRIPE_PRICE_30_DAYS"
        value = var.stripe_price_30_days
      }
      env {
        name  = "STRIPE_PRICE_90_DAYS"
        value = var.stripe_price_90_days
      }
      env {
        name  = "PARSER_SERVICE_URL"
        value = google_cloud_run_v2_service.parser.uri
      }
      env {
        name  = "ANALYZER_SERVICE_URL"
        value = google_cloud_run_v2_service.analyseur.uri
      }
      env {
        name  = "WRITER_SERVICE_URL"
        value = google_cloud_run_v2_service.redacteur.uri
      }

      # ---- Secrets (Secret Manager, jamais en clair) ----
      env {
        name = "SECRET_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.app["JWT_SECRET_KEY"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.app["DATABASE_URL"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "STRIPE_SECRET_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.app["STRIPE_SECRET_KEY"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "STRIPE_WEBHOOK_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.app["STRIPE_WEBHOOK_SECRET"].secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "BREVO_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.app["BREVO_API_KEY"].secret_id
            version = "latest"
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }
  depends_on = [
    google_project_service.apis,
    google_secret_manager_secret_iam_member.backend_reads,
  ]
}

resource "google_cloud_run_v2_service_iam_member" "backend_public" {
  name     = google_cloud_run_v2_service.backend.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers" # API publique (auth applicative JWT)
}

# --------------------------------------------------------------------------
# Frontend — public, aucun privilège GCP (NEXT_PUBLIC_* figés au build)
# --------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "frontend" {
  name     = "frontend"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.frontend.email
    timeout         = "60s"
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }
    containers {
      image = "${local.registry}/frontend:${var.image_tag}"
      ports {
        container_port = 3000
      }
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].containers[0].image]
  }
  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service_iam_member" "frontend_public" {
  name     = google_cloud_run_v2_service.frontend.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# --------------------------------------------------------------------------
# Outputs
# --------------------------------------------------------------------------

output "backend_url" {
  value       = google_cloud_run_v2_service.backend.uri
  description = "URL Cloud Run du backend (avant domain mapping)"
}

output "frontend_url" {
  value       = google_cloud_run_v2_service.frontend.uri
  description = "URL Cloud Run du frontend (avant domain mapping)"
}
