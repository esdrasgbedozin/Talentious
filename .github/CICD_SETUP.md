# Guide de Configuration CI/CD - GitHub Secrets

## 📋 Secrets à configurer dans GitHub

Pour configurer les secrets, allez sur GitHub :
1. Naviguez vers votre repository **Talentious**
2. Cliquez sur **Settings** → **Secrets and variables** → **Actions**
3. Cliquez sur **New repository secret** pour chaque secret ci-dessous

---

## 🔐 Secrets requis

### 1. `GCP_SA_KEY` (OBLIGATOIRE)
**Description** : Clé JSON du Service Account pour authentification GCP

**Comment l'obtenir** :
```bash
# Le fichier est déjà généré ici :
cat ~/ci-cd-deployer-key.json
```

**Action** :
1. Copiez TOUT le contenu du fichier JSON (y compris les `{}`)
2. Dans GitHub Secrets, créez `GCP_SA_KEY`
3. Collez le contenu JSON complet
4. Cliquez sur "Add secret"

⚠️ **IMPORTANT** : Une fois ajouté, supprimez le fichier local pour la sécurité :
```bash
rm ~/ci-cd-deployer-key.json
```

---

### 2. `DATABASE_URL` (OBLIGATOIRE pour le backend)
**Description** : URL de connexion à la base de données Cloud SQL

**Format** :
```
postgresql://talentious-app:VOTRE_MOT_DE_PASSE@/talentious?host=/cloudsql/talentious-project:europe-west9:talentious-db-prod
```

**Comment le construire** :
```bash
# Récupérer le connection name
terraform output -raw db_connection_name

# Votre mot de passe DB est dans infra/terraform.tfvars
cat infra/terraform.tfvars | grep db_password
```

**Résultat** :
```
postgresql://talentious-app:TALENTIOUS_BD_ADMIN#?04@/talentious?host=/cloudsql/talentious-project:europe-west9:talentious-db-prod
```

---

### 3. `SECRET_KEY` (OBLIGATOIRE pour le backend)
**Description** : Clé secrète pour le chiffrement JWT et la sécurité

**Comment le générer** :
```bash
# Option 1 : Avec Python
python3 -c "import secrets; print(secrets.token_urlsafe(32))"

# Option 2 : Avec OpenSSL
openssl rand -base64 32
```

**Action** :
1. Copiez la clé générée
2. Dans GitHub Secrets, créez `SECRET_KEY`
3. Collez la valeur

---

### 4. `NEXT_PUBLIC_API_URL` (OPTIONNEL, sera mis à jour après premier déploiement)
**Description** : URL du backend pour le frontend

**Valeur initiale** :
```
https://backend-staging-PLACEHOLDER.run.app
```

**Note** : Vous mettrez à jour ce secret après le premier déploiement du backend avec l'URL réelle.

---

## ✅ Checklist de configuration

- [ ] `GCP_SA_KEY` - Clé JSON du Service Account
- [ ] `DATABASE_URL` - URL de connexion PostgreSQL
- [ ] `SECRET_KEY` - Clé de chiffrement (32+ caractères)
- [ ] `NEXT_PUBLIC_API_URL` - URL du backend (optionnel au début)

---

## 🧪 Tester la configuration

Une fois tous les secrets configurés, testez le pipeline :

1. **Commitez et poussez vers develop** :
```bash
git add .
git commit -m "feat: Add CI/CD workflows for backend and frontend"
git push origin feature/project-foundations
```

2. **Mergez vers develop** (après PR) :
```bash
git checkout develop
git merge feature/project-foundations
git push origin develop
```

3. **Vérifiez l'exécution** :
- Allez sur GitHub → Actions
- Vous devriez voir les workflows "Backend Staging" et "Frontend Staging" en cours d'exécution
- Vérifiez les logs pour identifier d'éventuelles erreurs

---

## 🔍 Récupérer les URLs des services déployés

Après un déploiement réussi, récupérez les URLs :

```bash
# URL du backend
gcloud run services describe backend-staging \
  --region=europe-west9 \
  --format='value(status.url)'

# URL du frontend
gcloud run services describe frontend-staging \
  --region=europe-west9 \
  --format='value(status.url)'
```

---

## 🚨 Dépannage

### Erreur "Permission denied" dans GitHub Actions
→ Vérifiez que `GCP_SA_KEY` est correctement configuré (JSON complet)

### Erreur de connexion à la base de données
→ Vérifiez le format de `DATABASE_URL` (doit inclure `/cloudsql/`)

### Image Docker ne se construit pas
→ Vérifiez les logs dans GitHub Actions, section "Build Docker image"

### Cloud Run deployment fails
→ Vérifiez que le Service Account a tous les rôles nécessaires
