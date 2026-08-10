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
  description = "IGNORÉ depuis l'incident 2026-07-26 (lifecycle ignore_changes) : le mot de passe est géré hors Terraform. N'importe quelle valeur convient au prompt."
  type        = string
  sensitive   = true
  default     = "ignored-managed-out-of-band"
}

variable "image_tag" {
  description = "Tag des images au premier déploiement (la CI pilote ensuite les images ; Terraform les ignore via lifecycle)"
  type        = string
  default     = "latest"
}

variable "vertex_ai_model" {
  description = "Modèle Vertex AI des agents (ADR-GENAI-SDK : gemini-3.5-flash sur endpoint UE)"
  type        = string
  default     = "gemini-3.5-flash"
}

# Région des APPELS Gemini — distincte de var.region (qui pilote Cloud Run/SQL/
# bucket, restés en europe-west9). Multi-région `eu` : Gemini 3.x avec résidence
# des données UE (ADR-GENAI-SDK ; l'endpoint in-country europe-west9 pour 2.5
# est retiré le 2027-08-06). Le stockage reste en France ; seul le calcul IA
# se fait dans l'UE.
variable "vertex_ai_location" {
  description = "Région/multi-région des appels Vertex AI Gemini (résidence UE)"
  type        = string
  default     = "eu"
}

variable "frontend_public_url" {
  description = "URL publique du frontend (CORS + liens emails). Domaine officiel en prod."
  type        = string
  default     = "https://talentious.app"
}

# Client ID OAuth Google (PUBLIC — pas un secret : il sert uniquement à
# vérifier l'audience des jetons d'identité). Vide tant que le fondateur n'a
# pas créé l'identifiant dans la console → Sign in with Google inactif.
variable "google_oauth_client_id" {
  description = "Client ID OAuth Google (Sign in with Google), format *.apps.googleusercontent.com"
  type        = string
  default     = "968343134767-lheffarmp2cgtqq07or313l2946su70j.apps.googleusercontent.com"
}

# IDs de prix Stripe (non sensibles — ce sont des identifiants publics de
# catalogue, pas des clés — sans valeur par défaut, un apply sans TF_VAR_...
# effaçait les IDs posés en prod et cassait le checkout.
variable "stripe_price_30_days" {
  description = "ID du prix Stripe du pass 30 jours (price_...)"
  type        = string
  default     = "price_1TryiVLgApLstvmEf1vOvl0K"
}

variable "stripe_price_90_days" {
  description = "ID du prix Stripe du pass 90 jours (price_...)"
  type        = string
  default     = "price_1TryiWLgApLstvmEzswHD8Bm"
}
