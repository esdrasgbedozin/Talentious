# =============================================================================
# Budgets & alertes de coût (M2-T25). Garde-fous FinOps : un budget mensuel
# global, un budget dédié Vertex AI (poste le plus volatil), et une alerte de
# RYTHME sur les appels LLM — qui se déclenche AVANT que la facture ne monte, là
# où les seuils de budget (facturation non temps réel) ne réagissent qu'au cumul
# a posteriori.
#
# Tout est CONDITIONNEL aux identifiants fournis à l'apply (hors repo) : sans
# eux, aucune de ces ressources n'est créée — un `plan` ordinaire reste neutre,
# y compris le data source (gated lui aussi).
#
# PRÉ-REQUIS APPLY (PAH-M2b, pas un défaut du code — revues sécu/qualité) :
#   - l'identité d'apply doit porter un droit AU NIVEAU DU COMPTE DE FACTURATION
#     (roles/billing.costsManager ou budgets.editor) — le SA CI ne l'a PAS
#     (moindre privilège voulu) → budgets appliqués par le fondateur ;
#   - l'API Budgets exige un quota project (ADC utilisateur → 403 sinon ;
#     un SA porte son propre projet) ;
#   - la devise des budgets DOIT être celle du compte de facturation (EUR ici) ;
#   - le canal e-mail doit être VÉRIFIÉ côté console sinon les alertes ne partent
#     pas ; le `filter` de l'alerte est à confirmer dans Metrics Explorer.
# =============================================================================

locals {
  # Seuils communs aux budgets. On double le 100 % d'un seuil PRÉVISIONNEL
  # (FORECASTED_SPEND) : alerte dès que la TRAJECTOIRE dépasse le plafond, sans
  # attendre la dépense réelle (la prévision se fiabilise après ~10 j).
  budget_thresholds = [
    { percent = 0.5, basis = "CURRENT_SPEND" },
    { percent = 0.8, basis = "CURRENT_SPEND" },
    { percent = 1.0, basis = "CURRENT_SPEND" },
    { percent = 1.2, basis = "CURRENT_SPEND" },
    { percent = 1.0, basis = "FORECASTED_SPEND" },
  ]

  # Canal e-mail à joindre aux budgets (vide si non configuré → seuls les admins
  # de facturation sont notifiés par défaut).
  budget_channels = var.alert_notification_email != "" ? [google_monitoring_notification_channel.email[0].id] : []
}

# Numéro de projet (requis par le filtre de budget : `projects/{NUMÉRO}`).
# Gated sur billing_account pour qu'un `plan` sans budget ne touche aucune API.
data "google_project" "this" {
  count      = var.billing_account != "" ? 1 : 0
  project_id = var.project_id
}

# Canal e-mail des alertes (budget + rythme LLM). Créé seulement si l'e-mail est
# fourni. NB : les budgets notifient de toute façon les admins de facturation ;
# en revanche l'alerte de RYTHME ci-dessous n'existe QUE si ce canal existe.
resource "google_monitoring_notification_channel" "email" {
  count        = var.alert_notification_email != "" ? 1 : 0
  display_name = "Alertes coût Talentious (e-mail)"
  type         = "email"
  labels = {
    email_address = var.alert_notification_email
  }
  depends_on = [google_project_service.apis]
}

# Budget MENSUEL global. Devise = celle du compte de facturation (EUR).
resource "google_billing_budget" "monthly" {
  count           = var.billing_account != "" ? 1 : 0
  billing_account = var.billing_account
  display_name    = "Talentious — budget mensuel (${var.budget_monthly_eur} EUR)"

  budget_filter {
    projects        = ["projects/${data.google_project.this[0].number}"]
    calendar_period = "MONTH"
  }

  amount {
    specified_amount {
      currency_code = "EUR"
      units         = tostring(var.budget_monthly_eur)
    }
  }

  dynamic "threshold_rules" {
    for_each = local.budget_thresholds
    content {
      threshold_percent = threshold_rules.value.percent
      spend_basis       = threshold_rules.value.basis
    }
  }

  dynamic "all_updates_rule" {
    for_each = length(local.budget_channels) > 0 ? [1] : []
    content {
      monitoring_notification_channels = local.budget_channels
      disable_default_iam_recipients   = false # garde aussi les admins de facturation
    }
  }

  depends_on = [google_project_service.apis]
}

# Budget dédié VERTEX AI, filtré sur le service de facturation Vertex. Devise EUR
# (DOIT correspondre au compte de facturation). Un seuil bas à 25 % détecte tôt.
resource "google_billing_budget" "vertex" {
  count           = var.billing_account != "" && var.vertex_billing_service_id != "" ? 1 : 0
  billing_account = var.billing_account
  display_name    = "Talentious — budget Vertex AI (${var.budget_vertex_eur} EUR)"

  budget_filter {
    projects        = ["projects/${data.google_project.this[0].number}"]
    calendar_period = "MONTH"
    services        = ["services/${var.vertex_billing_service_id}"]
  }

  amount {
    specified_amount {
      currency_code = "EUR"
      units         = tostring(var.budget_vertex_eur)
    }
  }

  dynamic "threshold_rules" {
    for_each = concat([{ percent = 0.25, basis = "CURRENT_SPEND" }], local.budget_thresholds)
    content {
      threshold_percent = threshold_rules.value.percent
      spend_basis       = threshold_rules.value.basis
    }
  }

  dynamic "all_updates_rule" {
    for_each = length(local.budget_channels) > 0 ? [1] : []
    content {
      monitoring_notification_channels = local.budget_channels
      disable_default_iam_recipients   = false
    }
  }

  depends_on = [google_project_service.apis]
}

# Alerte de RYTHME : nombre TOTAL de requêtes à l'API Vertex AI par minute.
# Détecte un emballement (boucle de retries, abus) avant l'impact budgétaire.
# Créée seulement si un e-mail est fourni (il faut un canal de notification).
#
# NB (revues) :
#   - le `filter` n'est PAS validé par `terraform validate` (simple chaîne) → à
#     VÉRIFIER dans le Metrics Explorer à l'apply (métrique consumer) ;
#   - le COÛT Vertex dépend des TOKENS, pas du nombre de requêtes : ce rythme est
#     un proxy (détecte surtout une boucle). La vraie butée tokens/coût est
#     app-side (limite de taille d'entrée, max_output_tokens, rate limit) + un
#     éventuel plafond de quota Vertex — hors périmètre de ce ticket.
resource "google_monitoring_alert_policy" "llm_rate" {
  count        = var.alert_notification_email != "" ? 1 : 0
  display_name = "Rythme d'appels Vertex AI (LLM) anormal"
  combiner     = "OR"

  conditions {
    display_name = "Requêtes Vertex AI/min > seuil (total)"
    condition_threshold {
      filter          = "metric.type = \"serviceruntime.googleapis.com/api/request_count\" AND resource.type = \"consumed_api\" AND resource.labels.service = \"aiplatform.googleapis.com\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.llm_rate_threshold_per_min
      duration        = "300s" # soutenu 5 min → évite les faux positifs sur un pic bref
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_SUM"  # somme par minute et par série
        cross_series_reducer = "REDUCE_SUM" # puis somme de TOUTES les séries (méthode/code)
        group_by_fields      = []           # → un seul total, le seuil porte sur l'ensemble
      }
      trigger {
        count = 1
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email[0].id]
  depends_on            = [google_project_service.apis]
}
