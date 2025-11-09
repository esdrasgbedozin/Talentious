#!/bin/bash

# Script to create secrets in GCP Secret Manager for Talentious backend
# Usage: ./create-secrets.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Talentious - Secret Manager Setup ===${NC}\n"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed${NC}"
    echo "Install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Get project ID
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
    echo -e "${YELLOW}No default project set. Please enter your GCP project ID:${NC}"
    read -p "Project ID: " PROJECT_ID
    gcloud config set project "$PROJECT_ID"
fi

echo -e "${GREEN}Using project: $PROJECT_ID${NC}\n"

# Enable Secret Manager API
echo -e "${YELLOW}Enabling Secret Manager API...${NC}"
gcloud services enable secretmanager.googleapis.com --project="$PROJECT_ID"
echo -e "${GREEN}✓ Secret Manager API enabled${NC}\n"

# Generate JWT Secret Key
echo -e "${YELLOW}Generating JWT Secret Key...${NC}"
JWT_SECRET=$(python3 -c "import secrets; print(secrets.token_urlsafe(64))")
echo -e "${GREEN}✓ Generated 64-character random secret${NC}"
echo -e "${YELLOW}JWT_SECRET_KEY (save this):${NC} $JWT_SECRET\n"

# Ask for database password
echo -e "${YELLOW}Enter your Cloud SQL database password:${NC}"
read -s DB_PASSWORD
echo ""

# Ask for Cloud SQL instance details
echo -e "${YELLOW}Enter Cloud SQL instance name (default: talentious-db):${NC}"
read -p "Instance name: " INSTANCE_NAME
INSTANCE_NAME=${INSTANCE_NAME:-talentious-db}

echo -e "${YELLOW}Enter Cloud SQL region (default: europe-west9):${NC}"
read -p "Region: " REGION
REGION=${REGION:-europe-west9}

echo -e "${YELLOW}Enter database name (default: talentious):${NC}"
read -p "Database: " DB_NAME
DB_NAME=${DB_NAME:-talentious}

echo -e "${YELLOW}Enter database username (default: talentious):${NC}"
read -p "Username: " DB_USER
DB_USER=${DB_USER:-talentious}

# Construct DATABASE_URL
DATABASE_URL="postgresql+asyncpg://${DB_USER}:${DB_PASSWORD}@/${DB_NAME}?host=/cloudsql/${PROJECT_ID}:${REGION}:${INSTANCE_NAME}"
echo -e "${GREEN}✓ Database URL constructed${NC}\n"

# Create JWT_SECRET_KEY secret
echo -e "${YELLOW}Creating JWT_SECRET_KEY secret...${NC}"
if gcloud secrets describe JWT_SECRET_KEY --project="$PROJECT_ID" &>/dev/null; then
    echo -e "${YELLOW}Secret already exists. Adding new version...${NC}"
    echo -n "$JWT_SECRET" | gcloud secrets versions add JWT_SECRET_KEY \
        --project="$PROJECT_ID" \
        --data-file=-
else
    echo -n "$JWT_SECRET" | gcloud secrets create JWT_SECRET_KEY \
        --project="$PROJECT_ID" \
        --replication-policy="automatic" \
        --data-file=-
fi
echo -e "${GREEN}✓ JWT_SECRET_KEY created/updated${NC}\n"

# Create DATABASE_URL secret
echo -e "${YELLOW}Creating DATABASE_URL secret...${NC}"
if gcloud secrets describe DATABASE_URL --project="$PROJECT_ID" &>/dev/null; then
    echo -e "${YELLOW}Secret already exists. Adding new version...${NC}"
    echo -n "$DATABASE_URL" | gcloud secrets versions add DATABASE_URL \
        --project="$PROJECT_ID" \
        --data-file=-
else
    echo -n "$DATABASE_URL" | gcloud secrets create DATABASE_URL \
        --project="$PROJECT_ID" \
        --replication-policy="automatic" \
        --data-file=-
fi
echo -e "${GREEN}✓ DATABASE_URL created/updated${NC}\n"

# Get project number for service account
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo -e "${YELLOW}Granting access to service account: $SERVICE_ACCOUNT${NC}"

# Grant access to JWT_SECRET_KEY
gcloud secrets add-iam-policy-binding JWT_SECRET_KEY \
    --project="$PROJECT_ID" \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet

echo -e "${GREEN}✓ Granted access to JWT_SECRET_KEY${NC}"

# Grant access to DATABASE_URL
gcloud secrets add-iam-policy-binding DATABASE_URL \
    --project="$PROJECT_ID" \
    --member="serviceAccount:$SERVICE_ACCOUNT" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet

echo -e "${GREEN}✓ Granted access to DATABASE_URL${NC}\n"

# List created secrets
echo -e "${GREEN}=== Secrets Created ===${NC}"
gcloud secrets list --project="$PROJECT_ID" --filter="name:JWT_SECRET_KEY OR name:DATABASE_URL"

echo -e "\n${GREEN}=== Setup Complete! ===${NC}\n"
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Add the following secrets to your GitHub repository:"
echo "   - CLOUD_SQL_CONNECTION_NAME: ${PROJECT_ID}:${REGION}:${INSTANCE_NAME}"
echo "   - DATABASE_URL (for migrations): $DATABASE_URL"
echo "   - GCP_SA_KEY: (Your service account JSON key)"
echo ""
echo "2. Deploy to Cloud Run will automatically use these secrets"
echo "3. See .github/SECRET_MANAGER_SETUP.md for detailed documentation"
echo ""
echo -e "${YELLOW}Important:${NC} Save the JWT_SECRET_KEY shown above in a secure location!"
