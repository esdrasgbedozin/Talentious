# Déploiement des Agents IA - Guide

## 📋 Vue d'ensemble

Les agents IA de Talentious sont déployés en tant que services Cloud Run indépendants pour permettre :
- **Scalabilité indépendante** : Chaque agent scale selon sa charge
- **Déploiement isolé** : Un bug dans un agent n'affecte pas les autres
- **Coûts optimisés** : Pay-per-use avec min-instances=0
- **Testing sécurisé** : Environnement staging séparé

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    STAGING ENVIRONMENT                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Frontend Staging                                           │
│       ↓                                                      │
│  Backend Staging  ──→  Parser-PDF Staging (8001)           │
│                   ──→  Analyseur-Offre Staging (8002)      │
│                   ──→  Rédacteur-CV Staging (8003)         │
│       ↓                                                      │
│  Cloud SQL (PostgreSQL)                                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   PRODUCTION ENVIRONMENT                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Frontend Prod                                              │
│       ↓                                                      │
│  Backend Prod  ──→  Parser-PDF Prod (8001)                 │
│                ──→  Analyseur-Offre Prod (8002)            │
│                ──→  Rédacteur-CV Prod (8003)               │
│       ↓                                                      │
│  Cloud SQL (PostgreSQL)                                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Workflow de Déploiement

### Déclenchement Automatique

Le workflow `.github/workflows/agents-staging.yml` se déclenche sur :
- **Branch** : `develop`
- **Paths** : Changements dans `agents/**` ou le workflow lui-même

### Étapes de Déploiement

1. **Build & Push Parser-PDF**
   - Build de l'image Docker
   - Push vers Artifact Registry
   - Déploiement sur Cloud Run

2. **Build & Push Analyseur-Offre**
   - Build de l'image Docker
   - Push vers Artifact Registry
   - Déploiement sur Cloud Run avec Vertex AI

3. **Build & Push Rédacteur-CV**
   - Build de l'image Docker
   - Push vers Artifact Registry
   - Déploiement sur Cloud Run avec Vertex AI

4. **Mise à jour Backend**
   - Récupération des URLs des agents
   - Mise à jour des variables d'environnement du backend

## ⚙️ Configuration des Services

### Parser-PDF Staging
```yaml
Service: parser-pdf-staging
Region: europe-west9
Port: 8001
Memory: 512Mi
CPU: 1
Timeout: 60s
Min Instances: 0
Max Instances: 10
```

### Analyseur-Offre Staging
```yaml
Service: analyseur-offre-staging
Region: europe-west9
Port: 8002
Memory: 1Gi
CPU: 1
Timeout: 300s (5 min)
Min Instances: 0
Max Instances: 10
Environment:
  - GCP_PROJECT_ID: talentious-project
  - GCP_LOCATION: europe-west9
  - VERTEX_AI_MODEL: gemini-2.5-flash
```

### Rédacteur-CV Staging
```yaml
Service: redacteur-cv-staging
Region: europe-west9
Port: 8003
Memory: 1Gi
CPU: 1
Timeout: 600s (10 min)
Min Instances: 0
Max Instances: 10
Environment:
  - GCP_PROJECT_ID: talentious-project
  - GCP_LOCATION: europe-west9
  - VERTEX_AI_MODEL: gemini-2.5-flash
```

## 🔐 Sécurité

### Authentification (TODO pour Production)

Pour la production, il est recommandé d'utiliser :

```yaml
# Option 1: IAM Authentication (Recommandé)
--no-allow-unauthenticated
--service-account=agents-invoker@talentious-project.iam.gserviceaccount.com

# Option 2: API Keys
--set-env-vars="API_KEY_REQUIRED=true"
```

### Variables Sensibles

Les prompts et configurations sensibles doivent utiliser Secret Manager :

```yaml
--set-env-vars="USE_SECRET_MANAGER=true"
--set-secrets="PROMPT_TEMPLATE=analyseur-prompt:latest"
```

## 💰 Estimation des Coûts

### Cloud Run (Staging)
- **3 services** × ~10-20€/mois = **30-60€/mois**
- Min instances = 0 pour réduire les coûts
- Facturation à l'utilisation réelle

### Vertex AI (Staging)
- **Gemini 2.5 Flash** : ~0.075$ / 1M tokens input
- Estimation : **20-50€/mois** selon le volume de tests

### Total Staging : **50-110€/mois**

## 📊 Monitoring

### Logs
```bash
# Logs Parser-PDF
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=parser-pdf-staging" --limit 50

# Logs Analyseur-Offre
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=analyseur-offre-staging" --limit 50

# Logs Rédacteur-CV
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=redacteur-cv-staging" --limit 50
```

### Métriques
```bash
# Requêtes par service
gcloud monitoring time-series list \
  --filter='metric.type="run.googleapis.com/request_count"' \
  --filter='resource.labels.service_name="parser-pdf-staging"'
```

## 🧪 Testing

### Health Checks

Chaque agent expose un endpoint `/health` :

```bash
# Parser-PDF
curl https://parser-pdf-staging-xxx.run.app/health

# Analyseur-Offre
curl https://analyseur-offre-staging-xxx.run.app/health

# Rédacteur-CV
curl https://redacteur-cv-staging-xxx.run.app/health
```

### Tests End-to-End

```bash
# Via Backend Staging
curl -X POST https://backend-staging-xxx.run.app/cv/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cv_name": "Test CV",
    "offer_text": "..."
  }'
```

## 🔄 Rollback

En cas de problème, rollback vers la version précédente :

```bash
# Lister les révisions
gcloud run revisions list --service=parser-pdf-staging --region=europe-west9

# Rollback
gcloud run services update-traffic parser-pdf-staging \
  --to-revisions=parser-pdf-staging-00042-xxx=100 \
  --region=europe-west9
```

## 📝 Prochaines Étapes

- [ ] Ajouter authentication IAM entre services
- [ ] Implémenter rate limiting
- [ ] Configurer Cloud Armor pour DDoS protection
- [ ] Ajouter alertes Cloud Monitoring
- [ ] Créer workflows pour production
- [ ] Implémenter blue/green deployment
- [ ] Configurer backup et disaster recovery

## 🆘 Troubleshooting

### Service ne démarre pas
```bash
# Vérifier les logs
gcloud run services logs read parser-pdf-staging --region=europe-west9 --limit=100

# Vérifier la configuration
gcloud run services describe parser-pdf-staging --region=europe-west9
```

### Erreurs Vertex AI
```bash
# Vérifier les quotas
gcloud alpha billing quotas list \
  --consumer=projects/talentious-project \
  --service=aiplatform.googleapis.com

# Vérifier les permissions
gcloud projects get-iam-policy talentious-project
```

### Performance lente
```bash
# Augmenter CPU/Memory
gcloud run services update redacteur-cv-staging \
  --memory=2Gi \
  --cpu=2 \
  --region=europe-west9
```

## 📚 Ressources

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Vertex AI Pricing](https://cloud.google.com/vertex-ai/pricing)
- [Best Practices for Cloud Run](https://cloud.google.com/run/docs/tips)
