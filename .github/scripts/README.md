# Deployment Scripts

This directory contains helper scripts for deploying and managing the Talentious backend on Google Cloud Platform.

## Available Scripts

### `create-secrets.sh`

Creates and configures secrets in Google Cloud Secret Manager.

**Usage:**
```bash
cd .github/scripts
./create-secrets.sh
```

**What it does:**
1. Enables Secret Manager API
2. Generates a secure JWT secret key
3. Creates `JWT_SECRET_KEY` secret
4. Creates `DATABASE_URL` secret with Cloud SQL connection string
5. Grants access to Cloud Run service account
6. Displays setup instructions

**Prerequisites:**
- Google Cloud SDK (`gcloud`) installed
- Authenticated to GCP: `gcloud auth login`
- Project configured: `gcloud config set project talentious-project`
- Cloud SQL instance created

### `verify-secrets.sh`

Verifies that Secret Manager is properly configured.

**Usage:**
```bash
cd .github/scripts
./verify-secrets.sh
```

**What it checks:**
1. Secret Manager API is enabled
2. `JWT_SECRET_KEY` secret exists
3. `DATABASE_URL` secret exists
4. Service account has proper IAM permissions
5. Cloud Run service configuration (if deployed)

**Exit codes:**
- `0`: All checks passed
- `1`: One or more checks failed

## First-Time Setup Workflow

1. **Create Cloud SQL instance** (if not already created):
   ```bash
   gcloud sql instances create talentious-db \
     --database-version=POSTGRES_15 \
     --tier=db-f1-micro \
     --region=europe-west9 \
     --network=default \
     --database-flags=cloudsql.iam_authentication=on
   ```

2. **Set database password**:
   ```bash
   gcloud sql users set-password talentious \
     --instance=talentious-db \
     --password=YOUR_SECURE_PASSWORD
   ```

3. **Run the secrets creation script**:
   ```bash
   ./create-secrets.sh
   ```

4. **Configure GitHub Secrets**:
   - Go to GitHub repository settings
   - Add secrets:
     - `GCP_SA_KEY`: Service account JSON key
     - `CLOUD_SQL_CONNECTION_NAME`: From script output
     - `DATABASE_URL`: From script output (for migrations)

5. **Verify configuration**:
   ```bash
   ./verify-secrets.sh
   ```

6. **Deploy to staging**:
   ```bash
   git push origin develop
   ```

## Troubleshooting

### "Permission denied" error
Make scripts executable:
```bash
chmod +x create-secrets.sh verify-secrets.sh
```

### "Project not set" error
Configure your GCP project:
```bash
gcloud config set project talentious-project
```

### "API not enabled" error
Enable required APIs:
```bash
gcloud services enable secretmanager.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable sqladmin.googleapis.com
```

### Secret already exists
The `create-secrets.sh` script will add a new version if the secret exists. To completely recreate:
```bash
gcloud secrets delete JWT_SECRET_KEY --project=talentious-project
gcloud secrets delete DATABASE_URL --project=talentious-project
./create-secrets.sh
```

## Security Notes

- **Never commit** `.env` files with real credentials
- **Rotate secrets** regularly (at least every 90 days)
- **Use different secrets** for staging and production
- **Monitor access** via Cloud Logging
- **Limit permissions** - only grant what's necessary

## Additional Resources

- [Secret Manager Documentation](https://cloud.google.com/secret-manager/docs)
- [Cloud Run Secrets Integration](https://cloud.google.com/run/docs/configuring/secrets)
- [Service Account Best Practices](https://cloud.google.com/iam/docs/best-practices-service-accounts)
