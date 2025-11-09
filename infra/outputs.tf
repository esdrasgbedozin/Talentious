# Database Connection
output "db_connection_name" {
  description = "Nom de connexion Cloud SQL"
  value       = google_sql_database_instance.main.connection_name
}

output "db_instance_ip" {
  description = "Adresse IP publique de l'instance Cloud SQL"
  value       = google_sql_database_instance.main.public_ip_address
}

output "db_name" {
  description = "Nom de la base de données"
  value       = google_sql_database.database.name
}

# Storage
output "cv_bucket_name" {
  description = "Nom du bucket Cloud Storage pour les CVs"
  value       = google_storage_bucket.cv_bucket.name
}

output "cv_bucket_url" {
  description = "URL du bucket Cloud Storage"
  value       = google_storage_bucket.cv_bucket.url
}

# Artifact Registry
output "artifact_registry_url" {
  description = "URL du repository Artifact Registry"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.docker_repo.repository_id}"
}
