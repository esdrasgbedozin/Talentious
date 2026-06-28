# Parser-PDF Agent

Microservice dédié à l'extraction de texte depuis des fichiers PDF pour la plateforme Talentious.

## Objectif

Fournir un service **stateless**, **sécurisé** et **performant** pour parser les CV au format PDF uploadés par les utilisateurs.

## Architecture

- **Framework** : FastAPI (Python 3.11+)
- **Parser PDF** : PyMuPDF (fitz)
- **Déploiement** : Docker + Cloud Run (privé)
- **Authentification** : IAM (Google Service Account) en production

## API Endpoints

### `GET /health`
Health check pour le monitoring et Cloud Run.

**Response:**
```json
{
  "status": "healthy",
  "service": "parser-pdf"
}
```

### `POST /parse`
Parse un fichier PDF et extrait le texte.

**Request:**
- `Content-Type: multipart/form-data`
- `file`: Fichier PDF (max 10MB)

**Response (200 OK):**
```json
{
  "text": "Contenu extrait du PDF...",
  "page_count": 3,
  "character_count": 1234,
  "filename": "cv.pdf"
}
```

**Errors:**
- `400`: Fichier invalide (type, taille, corrompu)
- `422`: PDF vide ou scanné (pas de texte extractible)
- `500`: Erreur serveur

## Développement Local

### Prérequis
- Python 3.11+
- Docker (optionnel mais recommandé)

### Installation

```bash
# Créer un environnement virtuel
python -m venv venv
source venv/bin/activate  # ou venv\Scripts\activate sur Windows

# Installer les dépendances
pip install -r requirements.txt

# Lancer le serveur
python app/main.py
```

Le service sera disponible sur `http://localhost:8001`

### Avec Docker

```bash
# Build l'image
docker build -t parser-pdf:latest .

# Lancer le container
docker run -p 8001:8001 parser-pdf:latest
```

## Sécurité

### Validations
- Type MIME (application/pdf uniquement)
- Taille maximale (10MB)
- Fichiers corrompus (gestion d'erreur PyMuPDF)
- Utilisateur non-root dans le container

### IAM (Production)
En production sur Cloud Run, ce service est **privé** et n'accepte que les requêtes du backend principal via Google Service Account IAM.

## Monitoring

- Endpoint /health pour les health checks
- Logs structurés (JSON en production)
- Métriques Cloud Run (latence, taux d'erreur)

## Tests

```bash
# Tests unitaires (à venir)
pytest

# Test manuel
curl -X POST http://localhost:8001/parse \
  -F "file=@/path/to/cv.pdf"
```

## Déploiement

Le déploiement sur Cloud Run est automatisé via GitHub Actions.

```bash
# Build et push vers Artifact Registry
gcloud builds submit --tag europe-west9-docker.pkg.dev/PROJECT_ID/agents/parser-pdf

# Deploy sur Cloud Run
gcloud run deploy parser-pdf \
  --image europe-west9-docker.pkg.dev/PROJECT_ID/agents/parser-pdf \
  --region europe-west9 \
  --no-allow-unauthenticated
```

## License

Proprietary - Talentious © 2024
