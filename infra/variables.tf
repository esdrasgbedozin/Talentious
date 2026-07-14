variable "project_id" {
  description = "ID du projet GCP"
  type        = string
  # Valeur non sensible, fixée en dur pour rendre plan/apply déterministe
  # (l'incohérence project_id était l'écart n°1 de l'audit 05).
  default = "talentious-project"
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
