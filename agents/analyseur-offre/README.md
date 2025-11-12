# Analyseur-Offre Microservice

**Phase 3.2** - Agent d'analyse des offres d'emploi utilisant Vertex AI (Gemini Pro)

## 📋 Vue d'ensemble

Microservice stateless qui analyse les offres d'emploi pour extraire :
- **Hard skills** : compétences techniques (langages, frameworks, outils) avec niveaux et importance
- **Soft skills** : compétences comportementales avec importance optionnelle
- **Niveau de séniorité** : Junior, Mid-level, Senior, Lead
- **Responsabilités clés** : principales missions du poste
- **Ton global** : caractère de l'offre (formel, décontracté, innovant)

## 🏗️ Architecture

```
analyseur-offre/
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI application
│   ├── models.py                  # Pydantic models
│   └── services/
│       ├── __init__.py
│       ├── prompt_loader.py       # Gestion des prompts (local/Secret Manager)
│       ├── parser_client.py       # Client HTTP pour Parser-PDF
│       └── vertex_ai_service.py   # Service Vertex AI (Gemini)
├── prompts/
│   └── analyseur.txt              # Template du prompt (v0.1)
├── Dockerfile                     # Multi-stage build optimisé
├── requirements.txt               # Dépendances Python
├── .env.example                   # Variables d'environnement
└── README.md
```

## 🚀 API Endpoints

### `GET /health`
Health check

**Response:**
```json
{
  "status": "healthy",
  "service": "analyseur-offre",
  "version": "0.1.0"
}
```

### `POST /analyze`
Analyse une offre d'emploi (texte brut)

**Request:**
```json
{
  "text": "We are seeking a Senior Python Developer..."
}
```

**Response:**
```json
{
  "hard_skills": [
    {"name": "Python", "level": "Expert", "importance": "Critical"},
    {"name": "FastAPI", "level": "Intermediate", "importance": "Important"},
    {"name": "Docker", "level": "Intermediate", "importance": "Nice to have"}
  ],
  "soft_skills": [
    {"name": "Team collaboration", "importance": "Critical"},
    {"name": "Problem-solving", "importance": "Important"}
  ],
  "seniority_level": "Senior",
  "key_responsibilities": [
    "Design microservices",
    "Mentor junior developers"
  ],
  "tone": "innovative"
}
```

### `POST /analyze/pdf`
Analyse une offre d'emploi (fichier PDF)

**Request:** `multipart/form-data` avec fichier PDF

**Validations:**
- MIME type : `application/pdf`
- Taille max : 10 MB (géré par Parser-PDF)
- Texte extrait : 50-200,000 caractères (profite de la fenêtre de 1M tokens de Gemini)

**Response:** Identique à `/analyze`

## 🔧 Configuration

### Variables d'environnement

```bash
# Parser-PDF service
PARSER_SERVICE_URL=http://parser-pdf:8001

# Google Cloud Platform
GCP_PROJECT_ID=your-project-id
GCP_LOCATION=europe-west9

# Vertex AI
VERTEX_AI_MODEL=gemini-1.5-flash-002  # ou gemini-1.5-pro

# Prompt Management
USE_SECRET_MANAGER=false  # true en production

# Logging
LOG_LEVEL=INFO
```

## 🐳 Utilisation avec Docker

### Build local
```bash
docker build -t analyseur-offre:latest .
```

### Run standalone
```bash
docker run -p 8002:8002 \
  -e GCP_PROJECT_ID=your-project-id \
  -e PARSER_SERVICE_URL=http://parser-pdf:8001 \
  analyseur-offre:latest
```

### Avec docker-compose
```bash
docker-compose up analyseur-offre
```

## 📦 Dépendances

- **FastAPI** 0.115.5 : Framework web
- **google-cloud-aiplatform** 1.73.0 : SDK Vertex AI
- **httpx** 0.28.1 : Client HTTP async
- **pydantic** 2.10.5 : Validation des données
- **uvicorn** 0.32.1 : Serveur ASGI

## 🧠 Système de Prompts

### Développement (local)
Prompts stockés dans `prompts/analyseur.txt`

### Production (Secret Manager)
Prompts stockés dans GCP Secret Manager :
```
projects/{GCP_PROJECT_ID}/secrets/PROMPT_ANALYSEUR/versions/latest
```

### Avantages
- ✅ Itération sans redéploiement
- ✅ Versioning des prompts
- ✅ Abstraction complète (jamais de prompt hardcodé)

## 🔗 Intégrations

### Parser-PDF
Délégation de l'extraction de texte PDF au service `parser-pdf` (Phase 3.1)

### Vertex AI
Appel au modèle Gemini pour l'analyse structurée

## 🎯 Cas d'usage

1. **Analyse directe** : Offre copiée depuis un site web → `/analyze`
2. **Analyse PDF** : Document PDF téléchargé → `/analyze/pdf`
3. **Pipeline automatisé** : Backend → Analyseur → Rédacteur-CV

## 🔒 Sécurité

- ✅ Conteneur non-root (user `appuser`)
- ✅ Validation stricte des inputs (Pydantic)
- ✅ MIME type checking
- ✅ Timeout sur les appels HTTP
- ✅ Gestion des erreurs avec codes HTTP appropriés

## 📊 Monitoring

### Health check
```bash
curl http://localhost:8002/health
```

### Logs structurés
```
2025-01-27 10:30:15 - app.main - INFO - Analyzing job offer text (1234 characters)
2025-01-27 10:30:16 - app.services.vertex_ai_service - INFO - Job offer analyzed successfully
```

## 🚧 Limitations actuelles

- Texte max : 200,000 caractères (~267 pages) - bien en-deçà de la limite Gemini (1M tokens)
- PDF max : 10 MB (limite Parser-PDF)
- Pas de cache (chaque requête = 1 appel Vertex AI)
- Pas de retry automatique sur les erreurs Vertex AI

## 📝 Version

**v0.1.0** - Phase 3.2 initial implementation

## 📄 Licence

Talentious - Proprietary
