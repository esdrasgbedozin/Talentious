#!/bin/bash

# Script to verify Secret Manager configuration for Talentious
# Usage: ./verify-secrets.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Secret Manager Verification ===${NC}\n"

# Get project ID
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: No GCP project configured${NC}"
    exit 1
fi

echo -e "${GREEN}Project: $PROJECT_ID${NC}\n"

# Check if Secret Manager API is enabled
echo -e "${YELLOW}Checking Secret Manager API...${NC}"
if gcloud services list --enabled --filter="name:secretmanager.googleapis.com" --format="value(name)" | grep -q secretmanager; then
    echo -e "${GREEN}✓ Secret Manager API is enabled${NC}\n"
else
    echo -e "${RED}✗ Secret Manager API is NOT enabled${NC}"
    echo "Run: gcloud services enable secretmanager.googleapis.com"
    exit 1
fi

# Check JWT_SECRET_KEY exists
echo -e "${YELLOW}Checking JWT_SECRET_KEY secret...${NC}"
if gcloud secrets describe JWT_SECRET_KEY --project="$PROJECT_ID" &>/dev/null; then
    echo -e "${GREEN}✓ JWT_SECRET_KEY exists${NC}"
    VERSION_COUNT=$(gcloud secrets versions list JWT_SECRET_KEY --project="$PROJECT_ID" --filter="state:enabled" --format="value(name)" | wc -l)
    echo -e "  Enabled versions: $VERSION_COUNT"
else
    echo -e "${RED}✗ JWT_SECRET_KEY does NOT exist${NC}"
fi
echo ""

# Check DATABASE_URL exists
echo -e "${YELLOW}Checking DATABASE_URL secret...${NC}"
if gcloud secrets describe DATABASE_URL --project="$PROJECT_ID" &>/dev/null; then
    echo -e "${GREEN}✓ DATABASE_URL exists${NC}"
    VERSION_COUNT=$(gcloud secrets versions list DATABASE_URL --project="$PROJECT_ID" --filter="state:enabled" --format="value(name)" | wc -l)
    echo -e "  Enabled versions: $VERSION_COUNT"
else
    echo -e "${RED}✗ DATABASE_URL does NOT exist${NC}"
fi
echo ""

# Check service account permissions
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo -e "${YELLOW}Checking IAM permissions for: $SERVICE_ACCOUNT${NC}"

# Check JWT_SECRET_KEY permissions
JWT_ACCESS=$(gcloud secrets get-iam-policy JWT_SECRET_KEY --project="$PROJECT_ID" --flatten="bindings[].members" --filter="bindings.members:serviceAccount:$SERVICE_ACCOUNT" --format="value(bindings.role)" 2>/dev/null || echo "")
if [[ $JWT_ACCESS == *"secretAccessor"* ]]; then
    echo -e "${GREEN}✓ Service account has access to JWT_SECRET_KEY${NC}"
else
    echo -e "${RED}✗ Service account does NOT have access to JWT_SECRET_KEY${NC}"
fi

# Check DATABASE_URL permissions
DB_ACCESS=$(gcloud secrets get-iam-policy DATABASE_URL --project="$PROJECT_ID" --flatten="bindings[].members" --filter="bindings.members:serviceAccount:$SERVICE_ACCOUNT" --format="value(bindings.role)" 2>/dev/null || echo "")
if [[ $DB_ACCESS == *"secretAccessor"* ]]; then
    echo -e "${GREEN}✓ Service account has access to DATABASE_URL${NC}"
else
    echo -e "${RED}✗ Service account does NOT have access to DATABASE_URL${NC}"
fi
echo ""

# List all secrets
echo -e "${YELLOW}All secrets in project:${NC}"
gcloud secrets list --project="$PROJECT_ID" --format="table(name,createTime,replication.automatic)"
echo ""

# Check Cloud Run service configuration (if deployed)
echo -e "${YELLOW}Checking Cloud Run service configuration...${NC}"
if gcloud run services describe backend-staging --region=europe-west9 --project="$PROJECT_ID" &>/dev/null; then
    echo -e "${GREEN}✓ backend-staging service exists${NC}"
    
    echo -e "\n${YELLOW}Service secrets configuration:${NC}"
    gcloud run services describe backend-staging \
        --region=europe-west9 \
        --project="$PROJECT_ID" \
        --format="value(spec.template.spec.containers[0].env)" 2>/dev/null || echo "No environment variables configured"
else
    echo -e "${YELLOW}! backend-staging service not yet deployed${NC}"
fi
echo ""

echo -e "${GREEN}=== Verification Complete ===${NC}"
