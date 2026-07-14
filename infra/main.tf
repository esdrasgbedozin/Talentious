terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  backend "gcs" {
    bucket = "talentious-tf-state-1000"
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Activation des APIs nécessaires
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "storage.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "aiplatform.googleapis.com",
    "iam.googleapis.com",
    "cloudbuild.googleapis.com"
  ])
  service            = each.key
  disable_on_destroy = false
}

# Instance Cloud SQL PostgreSQL
# Coût maîtrisé : db-f1-micro (plancher managé), ZONAL, pas de HA — assumé en bêta.
# En revanche les protections de données sont non négociables : deletion
# protection, connexions chiffrées uniquement, backups + PITR 7 jours.
resource "google_sql_database_instance" "main" {
  name                = "talentious-db-prod"
  database_version    = "POSTGRES_15"
  region              = var.region
  deletion_protection = true # garde-fou : interdit un destroy accidentel (MAJ-7)

  settings {
    tier = "db-f1-micro"
    ip_configuration {
      ipv4_enabled = true
      # Refuse les connexions non chiffrées (le Cloud SQL connector/proxy chiffre
      # toujours — ceci ferme seulement la porte aux clients directs en clair).
      ssl_mode = "ENCRYPTED_ONLY"
    }
    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = true # PITR : restauration à la minute près
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 7
      }
    }
  }
  depends_on = [google_project_service.apis]
}

# Base de données
resource "google_sql_database" "database" {
  name     = "talentious"
  instance = google_sql_database_instance.main.name
}

# Utilisateur de la base de données
resource "google_sql_user" "app_user" {
  name     = "talentious-app"
  instance = google_sql_database_instance.main.name
  password = var.db_password
}

# Bucket Cloud Storage pour les CVs
# NOTE : le stockage PDF en GCS n'est pas encore implémenté côté backend
# (gcs_pdf_url jamais renseigné). Le bucket est conservé (coût ~0 vide) mais
# protégé : pas de destruction forcée, et les versions obsolètes sont purgées
# (RGPD : une version supprimée ne doit pas survivre indéfiniment).
resource "google_storage_bucket" "cv_bucket" {
  name          = "${var.project_id}-cvs"
  location      = var.region
  force_destroy = false # garde-fou : un bucket non vide ne peut pas être détruit (MAJ-7)

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  # Purge les versions non courantes après 30 jours (RGPD + coût).
  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      days_since_noncurrent_time = 30
      with_state                 = "ARCHIVED"
    }
  }
}

# Repository Artifact Registry
resource "google_artifact_registry_repository" "docker_repo" {
  location      = var.region
  repository_id = "talentious-images"
  description   = "Images Docker pour Talentious"
  format        = "DOCKER"
  depends_on    = [google_project_service.apis]

  # Coût : ne garder que les images récentes (le repo pèse déjà ~2 Go).
  cleanup_policy_dry_run = false
  cleanup_policies {
    id     = "keep-recent-5"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }
  cleanup_policies {
    id     = "delete-older-than-30d"
    action = "DELETE"
    condition {
      older_than = "2592000s" # 30 jours
    }
  }
}
