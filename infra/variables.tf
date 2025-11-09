variable "project_id" {
  description = "ID du projet GCP"
  type        = string
}

variable "region" {
  description = "Région GCP par défaut"
  type        = string
  default     = "europe-west9"
}

variable "db_password" {
  description = "Mot de passe pour l'utilisateur de la base de données"
  type        = string
  sensitive   = true
}
