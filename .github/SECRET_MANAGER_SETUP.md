# GCP Secret Manager Setup Guide

This guide explains how to configure Google Cloud Secret Manager for the Talentious backend application.

## Overview

We use Google Cloud Secret Manager to securely store sensitive configuration values:
- **JWT_SECRET_KEY**: Secret key for signing JWT tokens
- **DATABASE_URL**: Connection string for Cloud SQL PostgreSQL database

## Prerequisites

- Google Cloud SDK (gcloud) installed and configured
- Appropriate IAM permissions to create and manage secrets
- Cloud Run service account with Secret Manager access

## Step 1: Generate Secrets

### Generate JWT Secret Key

Generate a strong random secret key for JWT signing:

```bash
# Generate a 64-character random string
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

Save this value - you'll use it in the next step.

### Prepare Database URL

Your Cloud SQL database URL should follow this format:

```
postgresql+asyncpg://USERNAME:PASSWORD@/DATABASE?host=/cloudsql/PROJECT_ID:REGION:INSTANCE_NAME
```

For example:
```
postgresql+asyncpg://talentious:YOUR_DB_PASSWORD@/talentious?host=/cloudsql/talentious-project:europe-west9:talentious-db
```

**Important**: For Cloud Run with Cloud SQL Proxy, use the Unix socket path format shown above.

## Step 2: Create Secrets in Secret Manager

### Enable Secret Manager API

```bash
gcloud services enable secretmanager.googleapis.com
```

### Create JWT_SECRET_KEY Secret

```bash
# Set your project ID
export PROJECT_ID="talentious-project"

# Create the secret (use the value generated in Step 1)
echo -n "YOUR_GENERATED_SECRET_KEY" | \
  gcloud secrets create JWT_SECRET_KEY \
    --project=$PROJECT_ID \
    --replication-policy="automatic" \
    --data-file=-
```

### Create DATABASE_URL Secret

```bash
# Create the secret with your Cloud SQL connection string
echo -n "postgresql+asyncpg://talentious:YOUR_DB_PASSWORD@/talentious?host=/cloudsql/talentious-project:europe-west9:talentious-db" | \
  gcloud secrets create DATABASE_URL \
    --project=$PROJECT_ID \
    --replication-policy="automatic" \
    --data-file=-
```

### Verify Secrets Created

```bash
gcloud secrets list --project=$PROJECT_ID
```

You should see both `JWT_SECRET_KEY` and `DATABASE_URL` in the list.

## Step 3: Grant Secret Access to Cloud Run Service Account

Find your Cloud Run service account (usually `PROJECT_NUMBER-compute@developer.gserviceaccount.com`):

```bash
# Get project number
gcloud projects describe $PROJECT_ID --format="value(projectNumber)"

# Or find the service account directly
gcloud iam service-accounts list --project=$PROJECT_ID
```

Grant Secret Manager access:

```bash
# Set the service account email
export SERVICE_ACCOUNT="PROJECT_NUMBER-compute@developer.gserviceaccount.com"

# Grant access to JWT_SECRET_KEY
gcloud secrets add-iam-policy-binding JWT_SECRET_KEY \
  --project=$PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/secretmanager.secretAccessor"

# Grant access to DATABASE_URL
gcloud secrets add-iam-policy-binding DATABASE_URL \
  --project=$PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/secretmanager.secretAccessor"
```

## Step 4: Update Cloud Run Deployment

The secrets are automatically loaded as environment variables via the GitHub Actions workflow. The relevant configuration is in `.github/workflows/backend-staging.yml`:

```yaml
- name: Deploy to Cloud Run
  run: |
    gcloud run deploy backend-staging \
      --image ${{ env.REGISTRY }}/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/backend:${{ github.sha }} \
      --region ${{ env.REGION }} \
      --platform managed \
      --allow-unauthenticated \
      --set-secrets="SECRET_KEY=JWT_SECRET_KEY:latest,DATABASE_URL=DATABASE_URL:latest" \
      --add-cloudsql-instances=${{ secrets.CLOUD_SQL_CONNECTION_NAME }}
```

The `--set-secrets` flag maps Secret Manager secrets to environment variables:
- `JWT_SECRET_KEY` → `SECRET_KEY` environment variable
- `DATABASE_URL` → `DATABASE_URL` environment variable

## Step 5: Update GitHub Secrets (CI/CD)

For the CI/CD pipeline to work, you need to add these GitHub repository secrets:

### Required GitHub Secrets

1. **GCP_SA_KEY**: Service account JSON key for authentication
2. **CLOUD_SQL_CONNECTION_NAME**: Format `PROJECT_ID:REGION:INSTANCE_NAME`
3. **DATABASE_URL**: For running migrations (same as Secret Manager value)

### Add GitHub Secrets

1. Go to your GitHub repository
2. Navigate to Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add each secret with its corresponding value

## Step 6: Test the Configuration

### Deploy to Staging

Push to the `develop` branch to trigger deployment:

```bash
git checkout develop
git merge feature/backend-auth-profile
git push origin develop
```

### Verify Deployment

Check Cloud Run logs to ensure secrets are loaded:

```bash
gcloud run services logs read backend-staging \
  --project=$PROJECT_ID \
  --region=europe-west9 \
  --limit=50
```

### Test API Endpoints

```bash
# Get the service URL
SERVICE_URL=$(gcloud run services describe backend-staging \
  --project=$PROJECT_ID \
  --region=europe-west9 \
  --format='value(status.url)')

# Test health endpoint
curl $SERVICE_URL/health

# Test registration
curl -X POST $SERVICE_URL/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"SecurePass123!"}'
```

## Security Best Practices

### ✅ DO:
- Use automatic replication for secrets (handles regional redundancy)
- Rotate secrets regularly (especially JWT_SECRET_KEY)
- Use least privilege for service account permissions
- Monitor secret access with Cloud Logging
- Use different secrets for staging and production

### ❌ DON'T:
- Store secrets in environment variables in docker-compose.yml (local dev only)
- Commit secrets to version control
- Share secrets between environments
- Use weak or predictable secret keys
- Grant broader permissions than needed

## Updating Secrets

To update a secret value:

```bash
# Add a new version
echo -n "NEW_SECRET_VALUE" | \
  gcloud secrets versions add SECRET_NAME \
    --project=$PROJECT_ID \
    --data-file=-

# Cloud Run will automatically use the latest version
# Redeploy to pick up changes
gcloud run services update backend-staging \
  --project=$PROJECT_ID \
  --region=europe-west9
```

## Troubleshooting

### Secret not found error
- Verify secret exists: `gcloud secrets list --project=$PROJECT_ID`
- Check IAM permissions on the secret
- Ensure service account has secretAccessor role

### Database connection fails
- Verify DATABASE_URL format (must use Unix socket for Cloud Run)
- Check Cloud SQL instance connection name is correct
- Ensure Cloud SQL Admin API is enabled
- Verify Cloud SQL instance is in the same region

### JWT token errors
- Verify SECRET_KEY environment variable is set
- Check JWT_SECRET_KEY secret value is not empty
- Ensure secret is properly mapped in Cloud Run configuration

## Monitoring

### View Secret Access Logs

```bash
gcloud logging read "resource.type=secret_version AND protoPayload.serviceName=secretmanager.googleapis.com" \
  --project=$PROJECT_ID \
  --limit=50 \
  --format=json
```

### List Secret Versions

```bash
gcloud secrets versions list JWT_SECRET_KEY --project=$PROJECT_ID
gcloud secrets versions list DATABASE_URL --project=$PROJECT_ID
```

## Local Development

For local development, continue using `.env` files or `docker-compose.yml` environment variables. Secret Manager is only used in Cloud Run (staging/production).

**Note**: Never commit local `.env` files to version control. Add them to `.gitignore`.

## Next Steps

After configuring secrets:
1. Test the staging deployment thoroughly
2. Verify all authentication endpoints work
3. Check database connectivity
4. Monitor logs for any errors
5. Proceed to Phase 2 (Frontend development)
