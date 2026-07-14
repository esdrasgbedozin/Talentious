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

variable "image_tag" {
  description = "Tag des images au premier déploiement (la CI pilote ensuite les images ; Terraform les ignore via lifecycle)"
  type        = string
  default     = "latest"
}

variable "vertex_ai_model" {
  description = "Modèle Vertex AI des agents (ADR-MODEL : gemini-2.5-pro en europe-west9)"
  type        = string
  default     = "gemini-2.5-pro"
}

variable "frontend_public_url" {
  description = "URL publique du frontend (CORS + liens emails). Domaine officiel en prod."
  type        = string
  default     = "https://talentious.app"
}

# IDs de prix Stripe (non sensibles — ce sont des identifiants publics de
# catalogue, pas des clés). Fournis à l'apply : TF_VAR_stripe_price_30_days=...
variable "stripe_price_30_days" {
  description = "ID du prix Stripe du pass 30 jours (price_...)"
  type        = string
  default     = ""
}

variable "stripe_price_90_days" {
  description = "ID du prix Stripe du pass 90 jours (price_...)"
  type        = string
  default     = ""
}
