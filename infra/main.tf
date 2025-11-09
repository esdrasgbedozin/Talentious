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
resource "google_sql_database_instance" "main" {
  name             = "talentious-db-prod"
  database_version = "POSTGRES_15"
  region           = var.region
  deletion_protection = false

  settings {
    tier = "db-f1-micro"
    ip_configuration {
      ipv4_enabled = true
    }
    backup_configuration {
      enabled = true
      start_time = "03:00"
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
resource "google_storage_bucket" "cv_bucket" {
  name          = "${var.project_id}-cvs"
  location      = var.region
  force_destroy = true

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }
}

# Repository Artifact Registry
resource "google_artifact_registry_repository" "docker_repo" {
  location      = var.region
  repository_id = "talentious-images"
  description   = "Images Docker pour Talentious"
  format        = "DOCKER"
  depends_on    = [google_project_service.apis]
}
