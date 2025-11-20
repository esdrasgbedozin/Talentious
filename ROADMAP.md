# Roadmap du Projet "Talentious"

Ce document est la feuille de route stratégique et technique pour le développement de "Talentious". Il est conçu pour un développeur solo et intègre les meilleures pratiques pour un cycle de développement structuré et efficace.

---

## 1. Stratégie de Développement & Workflow Git

Pour garantir la stabilité et l'organisation du code, nous adopterons un workflow basé sur des branches de fonctionnalités (`feature branches`).

### 1.1. Modèle de Branches

- **`main`** :
  - **Rôle** : Branche de production. Contient le code qui est actuellement en ligne et utilisé par les utilisateurs.
  - **Règle** : **Aucun push direct n'est autorisé.** Les mises à jour se font uniquement via des Pull Requests depuis la branche `develop`.
  - **Automatisation** : Une fusion (merge) sur `main` déclenche le pipeline de déploiement en **production**.

- **`develop`** :
  - **Rôle** : Branche d'intégration principale. C'est ici que toutes les nouvelles fonctionnalités sont fusionnées. Elle représente l'état "presque prêt pour la production".
  - **Règle** : Les mises à jour se font uniquement via des Pull Requests depuis les branches de fonctionnalités.
  - **Automatisation** : Un push ou une fusion sur `develop` déclenche le pipeline de déploiement sur l'environnement de **staging** (test).

- **Branches de Fonctionnalités (`feature/`, `fix/`, `chore/`)** :
  - **Rôle** : Chaque nouvelle fonctionnalité, correction de bug ou tâche technique est développée dans sa propre branche.
  - **Création** : Toujours créées à partir de la branche `develop`.
  - **Convention de nommage** :
    - `feature/user-authentication`
    - `fix/login-form-validation`
    - `chore/update-react-version`
  - **Processus** : Une fois le travail terminé, vous créez une **Pull Request (PR)** de votre branche vers `develop`.

### 1.2. Votre Workflow au Quotidien

1.  **Synchroniser** : Avant de commencer, assurez-vous que votre branche `develop` locale est à jour : `git checkout develop && git pull origin develop`.
2.  **Créer une branche** : Créez une branche pour votre tâche : `git checkout -b feature/nom-de-la-feature`.
3.  **Développer** : Écrivez votre code, faites des commits réguliers et descriptifs.
4.  **Créer une Pull Request** : Une fois la fonctionnalité terminée, poussez votre branche (`git push origin feature/nom-de-la-feature`) et ouvrez une Pull Request sur GitHub vers `develop`.
5.  **Auto-Relecture & CI** : La PR va lancer les tests automatiques (CI). Même en solo, prenez 5 minutes pour relire votre propre PR. C'est une excellente habitude pour repérer des erreurs.
6.  **Fusionner** : Une fois la PR validée, fusionnez-la dans `develop`. L'environnement de staging se mettra à jour.
7.  **Nettoyer** : Supprimez votre branche de fonctionnalité.
8.  **Mise en Production** : Lorsque `develop` est stable et que vous êtes prêt à lancer, créez une PR de `develop` vers `main`. La fusionner déploiera en production.

---

## 2. Roadmap Détaillée par Phases

### Phase 0 : Fondations & Infrastructure (Durée estimée : 3-4 jours)
> **Branche pour cette phase :** `feature/project-foundations` (à créer depuis `develop`)
> 
> **Workflow :**
> 1. `git checkout develop`
> 2. `git pull`
> 3. `git checkout -b feature/project-foundations`
> 4. Effectuez toutes les tâches de la Phase 0 dans cette branche.
> 5. Une fois terminé, créez une Pull Request de `feature/project-foundations` vers `develop`.
*Objectif : Mettre en place un squelette de projet fonctionnel et automatisé.*

#### 0.1. Gestion de Projet & Versioning
- [x] Créer le dépôt GitHub privé `Talentious`.
- [x] Initialiser le dépôt localement avec `git init`.
- [x] Créer la structure de branches initiale :
  - [x] Créer la branche `main`.
  - [x] Créer la branche `develop` à partir de `main`.
- [x] Configurer les protections de branches sur GitHub :
  - [x] Bloquer les pushs directs sur `main` (require PR).
  - [x] Bloquer les pushs directs sur `develop` (require PR).
- [x] Ajouter les fichiers de documentation :
  - [x] Copier `PROJECT_CONTEXT.md` à la racine.
  - [x] Copier `ROADMAP.md` à la racine.
  - [x] Créer un fichier `README.md` avec la description du projet.
- [x] Créer un fichier `.gitignore` global pour Python et Node.js.

#### 0.2. Environnement de Développement Local (Docker Compose)
- [x] Créer un fichier `docker-compose.yml` à la racine du projet.
- [x] Configurer le service PostgreSQL local :
  - [x] Utiliser l'image officielle `postgres:15`.
  - [x] Définir les variables d'environnement (POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB).
  - [x] Mapper le port `5432` pour l'accès local.
  - [x] Créer un volume pour persister les données localement.
- [x] Configurer le service Backend (FastAPI) :
  - [x] Définir le Dockerfile pour le backend (image Python 3.11).
  - [x] Configurer le hot-reload avec `uvicorn --reload`.
  - [x] Mapper le port `8000` pour l'API.
  - [x] Lier le service à PostgreSQL local.
- [x] Configurer le service Frontend (Next.js) :
  - [x] Définir le Dockerfile pour le frontend (image Node 20).
  - [x] Configurer le hot-reload avec `next dev`.
  - [x] Mapper le port `3000` pour l'interface.
- [x] Tester le lancement de l'ensemble avec `docker-compose up`.
- [x] Créer un fichier `Makefile` ou un script `dev.sh` pour simplifier les commandes courantes.

#### 0.3. Infrastructure GCP (via Terraform)

**Pré-requis manuels :**
- [x] Créer un nouveau projet GCP via la console (ex: `talentious-project`).
- [x] Activer la facturation sur le projet.
- [x] Activer les APIs nécessaires (Cloud Run, Cloud SQL, Storage, Artifact Registry, Secret Manager, Vertex AI).
- [x] Installer Terraform sur votre machine locale.
- [x] Installer et configurer le CLI `gcloud` sur votre machine locale.
- [x] Authentifier `gcloud` : `gcloud auth login`.
- [x] Définir le projet par défaut : `gcloud config set project talentious-project`.
- [x] Créer manuellement un bucket GCS pour stocker l'état Terraform :
  - [x] Nom : `talentious-tf-state` (doit être globalement unique).
  - [x] Région : `europe-west9`.
  - [x] Activer le versioning sur ce bucket.
  - [x] Commande : `gcloud storage buckets create gs://talentious-tf-state-1000 --location=europe-west9 --uniform-bucket-level-access`.
  - [x] Activer le versioning : `gcloud storage buckets update gs://talentious-tf-state-1000 --versioning`.

**Configuration Terraform :**
- [x] Créer le dossier `infra/` à la racine du projet.
- [x] Créer le fichier `infra/variables.tf` :
  - [x] Définir les variables : `project_id`, `region` (default: `europe-west9`), `db_password` (sensitive).
- [x] Créer le fichier `infra/terraform.tfvars` :
  - [x] Définir `project_id = "talentious-project"`.
  - [x] Définir `region = "europe-west9"`.
  - [x] Définir `db_password` avec un mot de passe fort.
  - [x] Ajouter `*.tfvars` au `.gitignore` pour ne pas commiter les secrets.
- [x] Créer le fichier `infra/main.tf` :
  - [x] Configurer le provider Google Cloud.
  - [x] Configurer le backend GCS pour l'état Terraform (utiliser le bucket `talentious-tf-state`).
  - [x] Activer les APIs nécessaires via `google_project_service`.
  - [x] Créer l'instance Cloud SQL PostgreSQL 15 :
    - [x] Nom : `talentious-db-prod`.
    - [x] Région : `europe-west9`.
    - [x] Tier : `db-f1-micro`.
    - [x] `deletion_protection = false` pour le dev (passer à `true` en production).
  - [x] Créer la base de données `talentious` dans l'instance SQL.
  - [x] Créer l'utilisateur `talentious-app` avec le mot de passe de `var.db_password`.
  - [x] Créer le bucket Cloud Storage :
    - [x] Nom : `${var.project_id}-cvs` pour garantir l'unicité.
    - [x] Région : `europe-west9`.
    - [x] Activer le versioning.
    - [x] `uniform_bucket_level_access = true`.
    - [x] `force_destroy = true` pour le dev (passer à `false` en production).
  - [x] Créer le repository Artifact Registry :
    - [x] Nom : `talentious-images`.
    - [x] Format : `DOCKER`.
    - [x] Région : `europe-west9`.
- [x] Créer le fichier `infra/outputs.tf` :
  - [x] Définir des outputs pour : connection string de la BDD, nom du bucket, URL du registry.

**Déploiement de l'infrastructure :**
- [x] Dans le dossier `infra/`, exécuter `terraform init`.
- [x] Exécuter `terraform plan` et vérifier la liste des ressources à créer.
- [x] Exécuter `terraform apply` et confirmer pour créer l'infrastructure.
- [x] Noter les outputs affichés (connection string, etc.) dans un gestionnaire de mots de passe sécurisé.
- [x] Vérifier dans la console GCP que toutes les ressources sont bien créées.

#### 0.4. Initialisation des Projets (Code)
- [x] Créer la structure du monorepo :
  ```
  /
  ├── backend/
  ├── frontend/
  ├── agents/
  │   ├── parser-pdf/
  │   ├── analyseur-offre/
  │   └── redacteur-cv/
  ├── docker-compose.yml
  ├── PROJECT_CONTEXT.md
  ├── ROADMAP.md
  └── README.md
  ```
- [x] Initialiser le projet **Backend (FastAPI)** :
  - [x] Créer la structure de base :
    ```
    backend/
    ├── app/
    │   ├── __init__.py
    │   ├── main.py
    │   ├── config.py
    │   ├── models/
    │   ├── schemas/
    │   ├── routes/
    │   └── services/
    ├── tests/
    ├── alembic/
    ├── Dockerfile
    ├── requirements.txt
    └── .env.example
    ```
  - [x] Créer un endpoint de test `GET /health` dans `main.py`.
  - [x] Mettre à jour le fichier `requirements.txt` avec toutes les dépendances nécessaires.
  - [x] Créer `config.py` avec Pydantic Settings pour la configuration.
  - [x] Créer `.env.example` avec les variables d'environnement.
  - [x] Créer les fichiers `__init__.py` pour tous les packages Python.
  - [x] Créer `tests/test_main.py` avec un test basique du endpoint health.
  - [x] Créer `pytest.ini` pour la configuration des tests.
- [x] Initialiser le projet **Frontend (Next.js)** :
  - [x] La structure Next.js est déjà créée avec TypeScript et Tailwind.
  - [x] Installer les dépendances utilitaires : `clsx` et `tailwind-merge`.
  - [x] Créer la structure de base :
    ```
    frontend/
    ├── src/
    │   ├── app/
    │   ├── components/ui/
    │   ├── lib/
    │   └── context/
    ├── public/
    ├── Dockerfile
    ├── package.json
    └── .env.local.example
    ```
  - [x] Créer `.env.local.example` avec les variables d'environnement.
  - [x] Créer `src/lib/api.ts` pour le client API.
  - [x] Créer `src/lib/utils.ts` pour les fonctions utilitaires.
- [x] Créer le dossier `agents/` avec les sous-dossiers :
  - [x] `parser-pdf/` avec README.md
  - [x] `analyseur-offre/` avec README.md
  - [x] `redacteur-cv/` avec README.md
  - [x] `agents/README.md` pour la documentation générale
- [x] Reconstruire et tester les containers Docker.
- [x] Vérifier que tous les services fonctionnent correctement.

#### 0.5. CI/CD (GitHub Actions)
- [x] Créer le dossier `.github/workflows/` à la racine.
- [x] Créer le workflow `backend-staging.yml` :
  - [x] Déclencher sur push vers `develop` (uniquement si des fichiers dans `/backend` ont changé).
  - [x] Étapes :
    - [x] Checkout du code.
    - [x] Setup Python 3.11.
    - [x] Installation des dépendances : `pip install -r backend/requirements.txt`.
    - [x] Lancer les tests : `pytest backend/tests/`.
    - [x] Authentification GCP (via un Service Account).
    - [x] Configurer Docker pour utiliser Artifact Registry.
    - [x] Construire l'image Docker : `docker build -t europe-west9-docker.pkg.dev/talentious-project/talentious-images/backend:$GITHUB_SHA ./backend`.
    - [x] Pousser l'image vers Artifact Registry.
    - [x] Déployer sur Cloud Run (service `backend-staging`, région `europe-west9`).
- [x] Créer le workflow `frontend-staging.yml` (même logique pour le frontend).
- [x] Créer un Service Account GCP dédié au CI/CD :
  - [x] Créer le compte : `ci-cd-deployer@talentious-project.iam.gserviceaccount.com`.
  - [x] Lui attribuer les rôles nécessaires (Cloud Run Admin, Artifact Registry Writer, Storage Admin).
  - [x] Générer une clé JSON.
  - [x] Ajouter cette clé comme secret GitHub (`GCP_SA_KEY`).
- [x] Mettre à jour le Dockerfile du frontend pour supporter les build arguments.
- [x] Créer le guide de configuration `.github/CICD_SETUP.md`.
- [x] Configurer les secrets GitHub (DATABASE_URL, SECRET_KEY, GCP_SA_KEY).
- [x] Tester le pipeline en poussant un commit sur `develop`.

---

### Phase 1 : Cœur Backend - Utilisateurs & Profils (Durée estimée : 5-6 jours)
> **Branche pour cette phase :** `feature/backend-auth-profile` (à créer depuis `develop`)
> 
> **Workflow :**
> 1. `git checkout develop`
> 2. `git pull`
> 3. `git checkout -b feature/backend-auth-profile`
> 4. Effectuez toutes les tâches de la Phase 1.
> 5. Une fois terminé, créez une Pull Request de `feature/backend-auth-profile` vers `develop`.
*Objectif : Avoir un backend capable de gérer des utilisateurs et leurs données de profil de manière sécurisée.*

#### 1.1. Configuration de la Base de Données
- [x] Installer les dépendances nécessaires :
  - [x] `pip install sqlalchemy psycopg2-binary alembic python-dotenv`.
  - [x] Mettre à jour `requirements.txt`.
- [x] Créer le fichier `backend/app/database.py` :
  - [x] Configurer la connexion à PostgreSQL avec SQLAlchemy.
  - [x] Créer un engine asynchrone (`create_async_engine`).
  - [x] Créer une session factory.
  - [x] Définir une dépendance FastAPI `get_db()` pour injecter la session.
- [x] Configurer Alembic pour les migrations :
  - [x] `cd backend && alembic init alembic`.
  - [x] Modifier `alembic/env.py` pour utiliser le modèle SQLAlchemy.
  - [x] Configurer la connexion DB dans `alembic.ini`.

#### 1.2. Modèles de Données (SQLAlchemy)
- [x] Créer `backend/app/models/user.py` :
  - [x] Définir le modèle `User` avec les colonnes : `id (UUID)`, `email`, `hashed_password`, `role` (USER/ADMIN), `stripe_customer_id`, `created_at`.
  - [x] Ajouter les contraintes (UNIQUE sur email, DEFAULT pour role).
- [x] Créer `backend/app/models/user_profile.py` :
  - [x] Définir le modèle `UserProfile` avec : `user_id (PK, FK)`, `profile_data (JSONB)`, `updated_at`.
- [x] Créer `backend/app/models/career_pass.py` :
  - [x] Définir le modèle `CareerPass` avec : `id`, `user_id`, `stripe_payment_id`, `pass_type` (PASS_30_DAYS/PASS_90_DAYS), `valid_until`, `purchased_at`.
  - [x] Ajouter la méthode `is_active()` pour vérifier la validité du pass.
- [x] Créer `backend/app/models/generated_cv.py` :
  - [x] Définir le modèle `GeneratedCV` avec : `id`, `user_id`, `cv_name`, `template_id`, `job_offer_context`, `cv_data_json (JSONB)`, `gcs_pdf_url`, `created_at`, `updated_at`.
  - [x] Ajouter un index sur `created_at` pour optimiser les requêtes.
- [x] Créer le fichier `backend/app/models/__init__.py` pour exporter tous les modèles.

#### 1.3. Schémas Pydantic
- [x] Créer `backend/app/schemas/user.py` :
  - [x] Schéma `UserCreate` (email, password).
  - [x] Schéma `UserLogin` (email, password).
  - [x] Schéma `UserResponse` (id, email, role avec UserRole enum, created_at).
  - [x] Schéma `Token` (access_token, token_type).
  - [x] Schéma `TokenData` (user_id, email).
- [x] Créer `backend/app/schemas/profile.py` :
  - [x] Schéma `PersonalInfo` (first_name, last_name, phone, email, linkedin, address).
  - [x] Schéma `Experience` (id, title, company, start_date, end_date, description, location).
  - [x] Schéma `Education` (id, degree, institution, graduation_date).
  - [x] Schéma `Skill` (name, level).
  - [x] Schéma `Project` (id, name, description, url, completion_date).
  - [x] Schéma `Certification` (id, name, issuer, issue_date, url).
  - [x] Schéma `ProfileData` (personal_info, summary, experiences, educations, skills, projects, certifications).
  - [x] Schéma `ProfileResponse` (user_id, profile_data, updated_at).
  - [x] Schéma `ProfileUpdate` (profile_data).
- [x] Upgradé Pydantic à 2.10.5 pour compatibilité Python 3.11.
- [x] Ajouté email-validator pour validation EmailStr.

#### 1.4. Migrations de Base de Données
- [x] Créer la migration initiale :
  - [x] `docker exec -it talentious_backend alembic revision --autogenerate -m "Initial schema"`.
  - [x] Vérifier le fichier de migration généré.
- [x] Appliquer la migration localement (Docker Compose) :
  - [x] `docker exec -it talentious_backend alembic upgrade head`.
- [x] Vérifier que les tables sont créées dans PostgreSQL local :
  - [x] Tables créées : `users`, `user_profiles`, `career_passes`, `generated_cvs`.
  - [x] Enums PostgreSQL : `UserRole` (USER, ADMIN), `PassType` (PASS_30_DAYS, PASS_90_DAYS).
  - [x] Relations CASCADE configurées.
- [x] **Automatisation CD** : Ajouter une étape au pipeline de déploiement pour exécuter `alembic upgrade head` avant de déployer le nouveau code :
  - [x] Modifier `.github/workflows/backend-staging.yml`.
  - [x] Ajouter une étape pour se connecter à Cloud SQL via le proxy.
  - [x] Exécuter la commande `alembic upgrade head`.
  - [x] Documenter le secret `CLOUD_SQL_CONNECTION_NAME`.

#### 1.5. Authentification & Sécurité
- [x] Installer les dépendances :
  - [x] `pip install python-jose[cryptography] passlib bcrypt python-multipart`.
  - [x] Fixer la compatibilité bcrypt (version 4.0.1).
- [x] Créer `backend/app/services/auth.py` :
  - [x] Fonction `hash_password(password: str) -> str` (utilise bcrypt).
  - [x] Fonction `verify_password(plain_password: str, hashed_password: str) -> bool`.
  - [x] Fonction `create_access_token(data: dict) -> str` (génère un JWT).
  - [x] Fonction `decode_access_token(token: str) -> dict` (valide et décode le JWT).
- [x] Mettre à jour `backend/app/config.py` :
  - [x] Ajouter CORS origins configuration.
  - [x] Ajouter Stripe placeholders pour future intégration.
  - [x] Exposer instance settings globale.
- [x] Créer la dépendance `get_current_user` dans `backend/app/services/dependencies.py` :
  - [x] Extraire le token du header `Authorization: Bearer <token>`.
  - [x] Décoder le token et récupérer l'utilisateur depuis la DB.
  - [x] Lever une exception `HTTPException(401)` si invalide.
  - [x] Créer `get_current_active_user` pour extension future.

#### 1.6. Endpoints d'Authentification
- [x] Créer `backend/app/routes/auth.py` :
  - [x] `POST /auth/register` :
    - [x] Vérifier que l'email n'existe pas déjà.
    - [x] Hasher le mot de passe.
    - [x] Créer l'utilisateur dans la DB (rôle par défaut : `user`).
    - [x] Créer un profil vide associé.
    - [x] Retourner un message de succès.
  - [x] `POST /auth/login` :
    - [x] Vérifier que l'email existe.
    - [x] Vérifier le mot de passe avec `verify_password`.
    - [x] Générer un token JWT.
    - [x] Retourner le token.
  - [x] `GET /auth/me` (protégé) :
    - [x] Utiliser la dépendance `get_current_user`.
    - [x] Retourner les informations de l'utilisateur connecté.
- [x] Intégrer les routes dans `backend/app/main.py`.

#### 1.7. Endpoints de Gestion du Profil
- [x] Créer `backend/app/routes/profile.py` :
  - [x] `GET /profile` (protégé) :
    - [x] Récupérer le profil de l'utilisateur connecté.
    - [x] Retourner `profile_data` (JSONB).
  - [x] `PUT /profile` (protégé) :
    - [x] Valider les données entrantes avec le schéma `ProfileData`.
    - [x] Mettre à jour le champ `profile_data` dans la DB.
    - [x] Mettre à jour `updated_at`.
    - [x] Retourner le profil mis à jour.
- [x] Intégrer les routes dans `backend/app/main.py`.

#### 1.8. Tests & Validation
- [x] Installer pytest et les plugins :
  - [x] `pip install pytest pytest-asyncio httpx`.
- [x] Créer `backend/tests/test_auth.py` :
  - [x] Test de l'endpoint `/auth/register` (succès).
  - [x] Test de l'endpoint `/auth/register` (email déjà existant).
  - [x] Test de l'endpoint `/auth/login` (succès).
  - [x] Test de l'endpoint `/auth/login` (mauvais mot de passe).
  - [x] Test de l'endpoint `/auth/me` (avec et sans token valide).
- [x] Créer `backend/tests/test_profile.py` :
  - [x] Test de `GET /profile` (utilisateur authentifié).
  - [x] Test de `PUT /profile` (mise à jour valide).
- [x] Lancer les tests localement : `pytest backend/tests/`.
- [x] Vérifier que le pipeline CI/CD exécute les tests correctement.

#### 1.9. Gestion des Secrets (GCP Secret Manager)
- [x] Créer les secrets dans Secret Manager :
  - [x] `JWT_SECRET_KEY` : Une clé aléatoire forte.
  - [x] `DATABASE_URL` : URL de connexion à Cloud SQL.
- [x] Configurer Cloud Run pour charger ces secrets comme variables d'environnement.
- [x] Tester le déploiement sur l'environnement staging.

---

### Phase 2 : Frontend - Authentification & Gestion du Profil (Durée estimée : 5-6 jours)
> **Branche pour cette phase :** `feature/frontend-auth-profile` (à créer depuis `develop`)
> 
> **Workflow :**
> 1. `git checkout develop`
> 2. `git pull`
> 3. `git checkout -b feature/frontend-auth-profile`
> 4. Effectuez toutes les tâches de la Phase 2.
> 5. Une fois terminé, créez une Pull Request de `feature/frontend-auth-profile` vers `develop`.
*Objectif : Permettre à un utilisateur de créer un compte, se connecter et modifier son profil.*

#### 2.1. Configuration de Base & Design System
- [x] Configurer Tailwind CSS avec les couleurs du projet :
  - [x] Ajouter dans `tailwind.config.js` :
    ```js
    colors: {
      primary: '#2D3748',
      action: '#38A169',
      background: '#FFFFFF',
      'background-light': '#F7FAFC',
      'text-primary': '#1A202C'
    }
    ```
- [x] Installer la police "Inter" :
  - [x] Ajouter via Google Fonts dans `layout.tsx`.
  - [x] Configurer comme police par défaut dans Tailwind.
- [x] Créer un fichier de composants réutilisables :
  - [x] `frontend/src/components/ui/Button.tsx` (variants: primary, secondary, danger).
  - [x] `frontend/src/components/ui/Input.tsx`.
  - [x] `frontend/src/components/ui/Card.tsx`.
  - [x] `frontend/src/components/ui/Modal.tsx`.

##### 2.1.1. Assets & Logos - COMPLÉTÉ

- [x] Logos créés et optimisés dans `frontend/public/logos/`
- [x] Favicons générés pour toutes les plateformes (ico, svg, png)
- [x] PWA manifest configuré avec thème Talentious
- [x] Layout Next.js mis à jour avec métadonnées complètes

#### 2.2. Gestion de l'État & API - COMPLÉTÉ ✅
- [x] Installer les dépendances :
  - [x] `npm install @tanstack/react-query axios`.
- [x] Créer `frontend/src/lib/api.ts` :
  - [x] Configurer une instance Axios avec la base URL du backend.
  - [x] Ajouter un intercepteur pour injecter le token JWT dans les headers.
  - [x] Intercepteur de réponse pour gérer les erreurs 401 (auto-logout).
- [x] Créer `frontend/src/lib/auth.ts` :
  - [x] Fonctions `login(email, password)`, `register(email, password)`.
  - [x] Fonction `getMe()` pour récupérer l'utilisateur connecté.
  - [x] Fonction `logout()`.
  - [x] Fonctions utilitaires `isAuthenticated()`, `getStoredUser()`.
- [x] Créer un Context React pour l'authentification :
  - [x] `frontend/src/context/AuthContext.tsx`.
  - [x] Stocker l'utilisateur connecté et le token (localStorage).
  - [x] Fournir des méthodes pour login, logout, register, refreshUser.
  - [x] Hook personnalisé `useAuth()`.
- [x] Créer `frontend/src/components/providers/QueryProvider.tsx` :
  - [x] Configuration TanStack Query avec staleTime 5min, retry 1.
- [x] Intégrer les providers dans `layout.tsx` :
  - [x] QueryProvider > AuthProvider wrapping children.

> **NOTE SÉCURITÉ (Dette Technique)** :  
> Pour le MVP, le token JWT est stocké dans `localStorage` pour simplicité et rapidité de développement.  
> **Vulnérabilité** : Sensible aux attaques XSS si une dépendance npm malveillante injecte du code.  
> **Recommandation V1 publique** : Migrer vers des **cookies HttpOnly** gérés côté backend pour une sécurité renforcée.  
> Le token ne sera plus accessible au JavaScript, éliminant le risque XSS.  
> **Action requise** : Modifier le backend FastAPI pour renvoyer le token dans un cookie `Set-Cookie: HttpOnly; Secure; SameSite=Strict`.

#### 2.3. Pages Publiques (Landing Page & Auth) - COMPLÉTÉ ✅
- [x] Améliorer `frontend/src/app/page.tsx` (Landing Page - Écran 0) :
  - [x] Section hero avec le nom "Talentious" et un slogan accrocheur.
  - [x] Description des fonctionnalités clés (3 cartes: IA, Rapidité, Sécurité).
  - [x] Boutons "Créer un compte" et "Se connecter" (liens vers `/register` et `/login`).
  - [x] Design épuré avec beaucoup d'espace blanc et gradient.
- [x] Créer `frontend/src/app/register/page.tsx` :
  - [x] Formulaire d'inscription (email, password, confirmation password).
  - [x] Validation des champs côté client (email format, password min 8 chars, matching passwords).
  - [x] Appel à l'API via `useAuth().register()`.
  - [x] Redirection vers `/login?registered=true` en cas de succès.
  - [x] Affichage des erreurs API (email déjà existant, etc.).
  - [x] Écran de succès avec animation avant redirection.
- [x] Créer `frontend/src/app/login/page.tsx` :
  - [x] Formulaire de connexion (email, password).
  - [x] Appel à l'API via `useAuth().login()`.
  - [x] Stockage du token dans AuthContext (automatique).
  - [x] Redirection vers `/onboarding` en cas de succès.
  - [x] Message de succès si arrivée depuis `/register`.
  - [x] Gestion des erreurs (credentials invalides).
  - [x] Wrapping dans Suspense pour `useSearchParams()` (Next.js requirement).
  - [ ] Affichage des erreurs (identifiants incorrects).

#### 2.4. Routes Protégées & Navigation
- [x] Créer un middleware pour protéger les routes :
  - [x] `frontend/src/middleware.ts`.
  - [x] Vérifier la présence d'un cookie de session valide (talentious_session).
  - [x] Rediriger vers `/login` avec paramètre `?redirect` si non authentifié.
  - [x] Protéger `/onboarding`, `/profile`, `/dashboard`.
- [x] Créer un composant de navigation authentifié :
  - [x] `frontend/src/components/Navbar.tsx` - variant `authenticated`.
  - [x] Logo "Talentious" à gauche avec lien vers `/profile`.
  - [x] Navigation desktop : liens vers "Mon Profil" et "Mes CV".
  - [x] Menu utilisateur à droite :
    - [x] Avatar avec initiales depuis l'email.
    - [x] Affichage du nom d'utilisateur et email (desktop).
    - [x] Menu déroulant avec : profil, paramètres, déconnexion.
    - [x] Version mobile responsive avec navigation dans le menu.
    - [x] Click-outside handler pour fermer le dropdown.
- [x] Intégration cookie de session :
  - [x] AuthContext gère le cookie `talentious_session` (max-age 30 jours).
  - [x] Cookie set sur login/init, removed sur logout/error.

**Note de sécurité** : Le système actuel utilise JWT dans localStorage + cookie de session pour le middleware. Migration vers HttpOnly cookies recommandée avant V1 (voir Phase Pré-V1).

#### 2.5. Page d'Onboarding (Écran 1)
- [x] Créer `frontend/src/app/onboarding/page.tsx` :
  - [x] Message d'accueil : "Bienvenue sur Talentious. Importons votre profil pour commencer."
  - [x] Trois options de cartes cliquables :
    - [x] **Option 1** : "Importer un CV (PDF)" (mise en avant visuelle avec badge "Recommandé").
    - [x] **Option 2** : "Importer un profil LinkedIn (PDF)" (avec info-bulle explicative).
    - [x] **Option 3** : "Commencer manuellement" (discret).
  - [x] Pour l'Option 1 et 2 :
    - [x] Zone d'upload drag & drop avec feedback visuel.
    - [x] Validation du fichier : PDF uniquement, max 10MB.
    - [x] Prévisualisation du nom du fichier et taille.
    - [x] Gestion des erreurs avec messages clairs.
    - [x] Bouton "Continuer" qui simulera l'API de parsing (Phase 3 : connexion réelle).
  - [x] Pour l'Option 3 :
    - [x] Redirection directe vers `/profile`.
  - [x] Design ultra-professionnel avec gradients, ombres, animations.
  - [x] Navbar authentifiée intégrée.
  - [x] Route protégée par middleware.

**Note technique** : L'intégration avec l'API de parsing CV (`POST /profile/parse-cv`) sera implémentée en Phase 3.

#### 2.6. Page de Profil (Écran 2)

- [x] Créer `frontend/src/app/profile/page.tsx` :
  - [x] Formulaire structuré par sections (accordéon ou onglets) :
    - [x] **Informations Personnelles** : Prénom, nom, téléphone, email, LinkedIn, adresse.
    - [x] **Résumé** : Textarea pour le résumé professionnel.
    - [x] **Expériences** : Liste dynamique (ajout/suppression/édition).
      - [x] Pour chaque expérience : Poste, entreprise, dates, description, poste actuel.
    - [x] **Formations** : Liste dynamique (ajout/suppression/édition).
      - [x] Pour chaque formation : Diplôme, institution, dates, domaine, mention, description.
    - [x] **Compétences** : Deux sections (hard skills, soft skills).
      - [x] Input avec tags pour ajouter/supprimer des compétences.
    - [x] **Projets** : Liste dynamique (ajout/suppression/édition).
    - [x] **Certifications** : Liste dynamique (ajout/suppression/édition).
  - [x] Bouton "Sauvegarder" :
    - [x] Appel à `PUT /profile`.
    - [x] Affichage d'un message de confirmation.
  - [x] Si le profil est pré-rempli (via parsing), afficher les données existantes.
  - [x] Conformité stricte avec le schéma backend (types TypeScript synchronisés avec Pydantic, structure JSONB, tests backend et frontend validés).

#### 2.7. Tests Frontend

- [x] Installer les dépendances de test :
  - [x] `npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event jest jest-environment-jsdom @types/jest`.
  - [x] Configuration Jest avec Next.js (@next/jest wrapper).
  - [x] Configuration du test environment (jsdom).
- [x] Créer des tests pour les composants critiques :
  - [x] Tests de smoke pour le formulaire de login.
  - [x] Tests de smoke pour la page de profil.
  - [x] Tests unitaires pour les helpers de types profile.
- [x] Lancer les tests : `npm test` (20 tests passés, 3 suites).
- [x] Tests fonctionnels dans l'environnement Docker.

---

### Phase 3 : Magie IA - Agents & Flux de Génération (Durée estimée : 7-9 jours)
> **Branche pour cette phase :** `feature/ai-generation-flow`
> 
> **Status**: 🟢 **EN COURS** (Phase 3.1 ✅ Complétée - 10 Nov 2025)
> 
> **Workflow :**
> 1. `git checkout develop`
> 2. `git pull`
> 3. `git checkout -b feature/ai-generation-flow`
> 4. Effectuez toutes les tâches de la Phase 3.
> 5. Une fois terminé, créez une Pull Request de `feature/ai-generation-flow` vers `develop`.
*Objectif : Construire les microservices IA et le flux backend qui génère le contenu d'un CV.*

#### 3.1. Agent `Parser-PDF` ✅ **COMPLÉTÉ (10 Nov 2025)**
> **Commits**: `333443a`, `fd4afeb`  
> **Documentation**: `agents/parser-pdf/PHASE_3.1_COMPLETION_REPORT.md`

- [x] Créer la structure du projet :
  - [x] `agents/parser-pdf/` avec structure FastAPI complète
  - [x] `app/main.py`, `app/__init__.py`
  - [x] `Dockerfile` (multi-stage optimisé)
  - [x] `requirements.txt`, `.env.example`, `.gitignore`
  - [x] `README.md` (documentation complète)
- [x] Installer les dépendances :
  - [x] `fastapi==0.115.5`
  - [x] `uvicorn[standard]==0.32.1`
  - [x] `pymupdf==1.24.13` (PyMuPDF)
  - [x] `python-multipart==0.0.19`
  - [x] `httpx==0.28.1`
- [x] Créer `agents/parser-pdf/app/main.py` :
  - [x] Endpoint `GET /health` : Health check pour Cloud Run
  - [x] Endpoint `POST /parse` :
    - [x] Accepter fichier PDF via `UploadFile`
    - [x] Validation MIME type strict (`application/pdf`)
    - [x] Validation taille (max 10MB)
    - [x] Gestion fichiers corrompus (PyMuPDF error handling)
    - [x] Utiliser PyMuPDF (fitz) pour extraction texte
    - [x] Retourner JSON: `{"text": "...", "page_count": N, "character_count": N, "filename": "..."}`
- [x] Créer un Dockerfile multi-stage (optimisé ~200MB vs 1.2GB)
  - [x] Utilisateur non-root (UID 1000)
  - [x] Health check intégré
- [x] Intégration environnement local :
  - [x] Ajout dans `docker-compose.yml` (port 8001)
  - [x] Backend dépend de parser-pdf
  - [x] Variable `PARSER_SERVICE_URL` configurée
  - [x] Hot-reload activé
- [x] Intégrer dans le backend principal :
  - [x] Créer `backend/app/services/parser_client.py`
  - [x] Client HTTP asynchrone (`httpx.AsyncClient`)
  - [x] Fonction `parse_pdf(file: UploadFile) -> Dict`
  - [x] Support IAM authentication (Google Service Account)
  - [x] Gestion d'erreurs complète (400/422/500/503/504)
  - [x] Pattern singleton
- [x] Ajouter `google-auth==2.36.0` au backend
- [x] Tester l'intégration :
  - [x] Build Docker: ✅ SUCCESS (254s initial, 11s rebuild)
  - [x] Health check: ✅ `{"status":"healthy","service":"parser-pdf"}`
  - [x] Validation MIME: ✅ Rejette fichiers non-PDF
  - [x] **Test PDF réel**: ✅ PDF 4 pages, 88KB, 3,505 caractères extraits
  - [x] Logs service: ✅ Confirmation extraction complète

**À venir (Déploiement Cloud Run)** :
- [ ] Déployer sur Cloud Run (service privé, région `europe-west9`)
- [ ] Configurer IAM (requêtes authentifiées uniquement)

---

### Phase 3.2 : Agent Analyseur-Offre IA (Vertex AI Gemini)
> **Branche :** `feature/ai-generation-flow`
> 
> **Objectif :** Analyser les offres d'emploi (texte ou PDF) et extraire les compétences, responsabilités, niveau de séniorité, ton, etc. via IA.

#### 3.2.1. Choix du modèle et région
- [x] Modèle utilisé : **gemini-2.5-flash**
- [x] Région GCP : **europe-west9 (Paris)**
- [x] Contexte maximal : **1M tokens (~750K caractères)**
- [x] RGPD : Données traitées en France/EU
- [x] Performance : Réponse < 40s pour 200K caractères

#### 3.2.2. Configuration technique
- [x] Mise à jour de tous les fichiers de configuration :
    - `docker-compose.yml` : modèle/région alignés
    - `.env.example` : documentation à jour
    - `vertex_ai_service.py` : lecture dynamique des variables d'environnement
- [x] Test exhaustif des modèles Gemini 2.0+ dans toutes les régions
- [x] Validation finale par appel API : extraction structurée des compétences et responsabilités

#### 3.2.3. Validation
- [x] Test curl : réponse JSON complète, hard/soft skills, responsabilités, ton
- [x] Commit : "feat(ai): switch to gemini-2.5-flash in europe-west9 (Paris) for Analyseur-Offre agent. RGPD compliant, 1M token context, optimal performance."

---

#### 3.3. Agent `Rédacteur-CV` (Cœur de l'IA)
- [ ] Créer la structure du projet : `agents/redacteur-cv/`.
- [ ] Installer les dépendances : identiques à l'analyseur.
- [ ] Créer le prompt de rédaction dans Secret Manager :
  - [ ] Nom du secret : `PROMPT_REDACTEUR_CV`.
  - [ ] Contenu : Le prompt complexe (votre "sauce secrète") :
    - [ ] Instructions pour sélectionner les expériences pertinentes.
    - [ ] Instructions pour réécrire avec des verbes d'action et des métriques.
    - [ ] Instructions pour ne pas inventer d'informations.
    - [ ] Format de sortie JSON strict.
- [ ] Créer `agents/redacteur-cv/app/main.py` :
  - [ ] Endpoint `POST /generate` :
    - [ ] Accepter `{"profile_data": {...}, "offer_analysis": {...}}`.
    - [ ] Charger le prompt depuis Secret Manager.
    - [ ] Construire le prompt final en injectant les données.
    - [ ] Appeler Vertex AI (Gemini Pro).
    - [ ] Parser la réponse JSON.
    - [ ] Retourner le CV structuré : `{"cv_data": {...}}`.
- [ ] Créer un Dockerfile.
- [ ] Déployer sur Cloud Run (service privé, région `europe-west9`).
- [ ] Intégrer dans le backend principal :
  - [ ] `backend/app/services/writer_client.py`.

#### 3.4. Qualité & Test des Prompts (Evals)
- [x] **Correction Stratégique : Traduction du Prompt Rédacteur**
  - [x] **Problème identifié** : Prompt en anglais alors que toutes les entrées/sorties sont en français
  - [x] **Impact** : Risque de "franglais" et tournures maladroites dans les CV générés
  - [x] **Solution implémentée** :
    - [x] Traduction complète de `agents/redacteur-cv/prompts/redacteur.txt` en français professionnel
    - [x] Conservation de la structure technique (schéma JSON, placeholders)
    - [x] Passage de 6815 → 7767 caractères (prompt plus détaillé en français)
    - [x] Rebuild du service Docker et validation du chargement
  - [x] **Résultat** : L'IA "pense" maintenant en français, amélioration attendue du ton et de la qualité linguistique

- [x] **Système d'Évaluation End-to-End**
  - [x] Créer la structure `backend/evals/` :
    - [x] `profiles/` : Profils utilisateur JSON (basés sur `UserProfileData`)
    - [x] `offers/` : Offres d'emploi texte (fichiers `.txt`)
    - [x] `results/` : Résultats des tests (générés automatiquement)
  
  - [x] **Fichiers de test d'exemple** :
    - [x] `01_junior_dev.json` : Profil développeuse junior avec 3 expériences, 13 compétences, Master Informatique
    - [x] `01_tech_lead.txt` : Offre Tech Lead Full-Stack fintech Paris (5 ans d'expérience minimum)
    - [x] Structure réaliste et complète pour servir de modèle
  
  - [x] **Script d'évaluation `run_evals.py`** :
    - [x] Chargement automatique de tous les profils (`.json`) et offres (`.txt`)
    - [x] Boucle sur toutes les combinaisons (Profil × Offre)
    - [x] Pour chaque combinaison :
      - [x] **Étape 1** : Appel `POST http://analyseur-offre:8002/analyze` avec le texte de l'offre
      - [x] **Étape 2** : Appel `POST http://redacteur-cv:8003/generate` avec profil + analyse
      - [x] **Sauvegarde** : `backend/evals/results/result_01_01.json` avec métadonnées complètes
    - [x] Affichage formaté avec couleurs ANSI (✅, ❌, ℹ️, ⚠️)
    - [x] Rapport final : taux de succès, détail des erreurs, statistiques
    - [x] Timeout configurable (120s par défaut pour Gemini)
    - [x] Gestion d'erreurs robuste (HTTP, exceptions, KeyboardInterrupt)
  
  - [x] **Documentation complète** :
    - [x] `backend/evals/README.md` : Guide complet d'utilisation
    - [x] Prérequis : Docker, services lancés, dépendances Python
    - [x] Format des données (profils, offres, résultats)
    - [x] Exemples de commandes d'analyse des résultats (jq, ls, cat)
    - [x] Section dépannage (Connection refused, Timeout, HTTP 500)
    - [x] Métriques de qualité futures (score pertinence, cohérence linguistique)
  
  - [x] **Dépendances** :
    - [x] `requirements.txt` : `httpx==0.27.0` pour les appels HTTP asynchrones
  
  - [x] **Prêt pour expansion** :
    - [ ] Ajouter 4 profils supplémentaires (senior backend, data scientist, devops, product manager)
    - [ ] Ajouter 4 offres supplémentaires (fullstack, ml engineer, infra, pm)
    - [ ] Total prévu : 25 combinaisons (5 profils × 5 offres)

**🎯 Objectifs des Evals :**
1. **Validation qualité** : CVs cohérents et pertinents
2. **Tests de régression** : Détecter les régressions après modifications
3. **Benchmarking** : Mesurer les performances (temps, taux de succès)
4. **Analyse qualitative** : Amélioration itérative des prompts

**📊 Utilisation :**
```bash
# Installer les dépendances
pip install -r backend/evals/requirements.txt

# Lancer les tests (services Docker requis)
python backend/evals/run_evals.py

# Analyser un résultat
cat backend/evals/results/result_01_01.json | jq .
```

#### 3.5. Orchestration Backend (Endpoint Principal) ✅
**Status:** COMPLETED (2025-11-11)
- [x] Créer la table `generated_cvs` (déjà existante depuis Phase 1)
- [x] Créer `backend/app/services/writer_client.py`
  - [x] Client HTTP async pour Rédacteur-CV (httpx.AsyncClient)
  - [x] Méthode `generate_cv(user_profile, offer_analysis)` → dict
  - [x] Timeout 600s (10 min pour génération IA)
  - [x] Gestion erreurs HTTP (502/503/504)
- [x] Mise à jour `docker-compose.yml`
  - [x] Variable d'environnement `WRITER_SERVICE_URL: http://redacteur-cv:8003`
  - [x] Dépendance backend → redacteur-cv
- [x] Créer `backend/app/routes/cv.py` (Chef d'Orchestre Principal)
  - [x] **POST /cv/generate** (protégé par JWT) :
    - [x] Vérification permissions CareerPass :
      - [x] Admin bypass automatique
      - [x] Sinon : `SELECT * FROM career_passes WHERE user_id = X AND valid_until > NOW()`
      - [x] Si aucun pass actif : `402 Payment Required`
    - [x] Récupération `UserProfile.profile_data` depuis BDD
    - [x] Appel Analyseur-Offre : `analyzer_client.analyze_text(offer_text)`
    - [x] Appel Rédacteur-CV : `writer_client.generate_cv(profile_data, analysis_result.to_dict())`
    - [x] Sauvegarde dans `generated_cvs` :
      - [x] Fields: `user_id`, `cv_name`, `template_id="modern_v1"`, `job_offer_context`, `cv_data_json`
    - [x] Retour : `{"cv_id": UUID, "cv_data": {...}, "message": "CV generated successfully"}`
  - [x] **GET /cv** (protégé) :
    - [x] Liste tous les CVs de l'utilisateur (ORDER BY created_at DESC)
    - [x] Retour lightweight (sans cv_data_json pour performances)
  - [x] **GET /cv/{cv_id}** (protégé) :
    - [x] Récupération d'un CV spécifique avec cv_data_json complet
    - [x] Vérification autorisation (user_id ou admin)
  - [x] **PUT /cv/{cv_id}** (protégé) :
    - [x] Mise à jour `cv_name` et/ou `cv_data_json`
    - [x] Vérification autorisation
  - [x] **DELETE /cv/{cv_id}** (protégé) :
    - [x] Suppression du CV
    - [x] Vérification autorisation
- [x] Intégrer dans `backend/app/main.py`
  - [x] Import `from app.routes import cv`
  - [x] `app.include_router(cv.router)`

**Performance Notes:**
- ⏱️ Génération: 2-5 minutes (Gemini API + retry logic)
- ⚠️ Optimisation différée à Phase 4 (streaming, min-instances)
- ✅ Comportement attendu en dev local (cold starts, appels séquentiels)

**Commits:**
- `48ed30c`: Phases 3.1-3.4 (Parser, Analyzer, Writer, Evals)
- `29f63ff`: Phase 3.5 (Backend Orchestration)

---

### Phase 4 : Cœur de l'Application - Dashboard & Éditeur (Durée estimée : 8-11 jours)
> **Branche pour cette phase :** `feature/dashboard-and-editor` (à créer depuis `develop`)
> 
> **Workflow :**
> 1. `git checkout develop`
> 2. `git pull`
> 3. `git checkout -b feature/dashboard-and-editor`
> 4. Effectuez toutes les tâches de la Phase 4.
> 5. Une fois terminé, créez une Pull Request de `feature/dashboard-and-editor` vers `develop`.
*Objectif : L'utilisateur peut générer, voir, éditer et télécharger son CV.*

#### 4.1. Dashboard (Écran 3) ✅ TERMINÉ
- [x] Créer `frontend/src/app/dashboard/page.tsx` :
  - [x] Titre : "Mes CVs".
  - [x] Bouton principal (en haut à droite) : "+ Générer un nouveau CV" (couleur action).
  - [x] Si aucun CV n'existe :
    - [x] Afficher un état vide avec une illustration et un message encourageant.
  - [x] Si des CVs existent :
    - [x] Afficher une grille de cartes (3 colonnes sur desktop, 1 sur mobile).
    - [x] Pour chaque carte :
      - [x] Nom du CV.
      - [x] Date de dernière modification.
      - [x] Boutons d'action : "Éditer", "Télécharger PDF", "Supprimer".
- [x] Implémenter la logique de récupération des CVs :
  - [x] Appel à `GET /cv` au chargement de la page.
  - [x] Utiliser TanStack Query pour gérer le cache et le state.
- [x] **BONUS** : Système Toast + ConfirmDialog (remplace alert/confirm).

#### 4.2. Flux de Génération (Pop-up) 🚧 EN COURS
- [ ] Créer un composant `frontend/src/components/GenerateCVModal.tsx` :
  - [ ] S'ouvre quand on clique sur "+ Générer un nouveau CV".
  - [ ] Champs du formulaire :
    - [ ] Input texte : "Nom de ce CV" (ex: "CV - Développeur React - Google").
    - [ ] Textarea : "Collez le texte de l'offre d'emploi" (optionnel).
    - [ ] Upload : "Ou uploadez l'offre en PDF" (optionnel).
  - [ ] Validation : Au moins l'un des deux (texte ou PDF) doit être rempli.
  - [ ] Bouton "Générer mon CV".
- [ ] Implémenter la logique de génération :
  - [ ] Appel à `POST /cv/generate`.
  - [ ] Gestion du cas `402 Payment Required` :
    - [ ] Fermer le modal de génération.
    - [ ] Ouvrir automatiquement le modal de paiement Stripe (Phase 5).
  - [ ] Si succès :
    - [ ] Afficher un écran de chargement avec des messages dynamiques :
      - [ ] "Analyse de l'offre en cours..."
      - [ ] "Identification des compétences clés..."
      - [ ] "Mise en valeur de vos expériences..."
      - [ ] "Génération du CV final..."
    - [ ] Rediriger vers l'éditeur : `/cv/{cv_id}/edit`.

#### 4.3. Template de CV (HTML/CSS)
- [ ] Créer un template HTML/CSS pour le CV :
  - [ ] `frontend/src/components/cv-templates/ModernTemplate.tsx`.
  - [ ] Design :
    - [ ] En-tête avec les informations personnelles (nom, email, téléphone, LinkedIn).
    - [ ] Section "Résumé" (si présent).
    - [ ] Section "Expériences" (liste avec titre, entreprise, dates, description en bullet points).
    - [ ] Section "Formations".
    - [ ] Section "Compétences" (deux colonnes : hard, soft).
    - [ ] Sections optionnelles : Projets, Certifications.
  - [ ] Couleurs du thème (#2D3748, #38A169).
  - [ ] Police : Inter.
  - [ ] Mise en page : Maximiser la densité d'information tout en gardant de la respiration.
- [ ] Créer une fonction `renderCV(cvData: object) -> JSX` :docker
  - [ ] Prend le JSON `cv_data` et le transforme en HTML.

#### 4.4. Éditeur WYSIWYG (Tâche Complexe)
- [ ] Choisir une approche pour l'édition :
  - [ ] **Option A** (recommandée pour le MVP) : Bibliothèque d'édition par blocs.
    - [ ] Installer `@editorjs/editorjs` ou une alternative comme `react-beautiful-dnd` + `contentEditable`.
  - [ ] **Option B** : Solution custom avec `contentEditable` et gestion manuelle de l'état.
- [ ] Créer `frontend/src/app/cv/[id]/edit/page.tsx` :
  - [ ] **Header de la page** :
    - [ ] Bouton "← Retour au Dashboard".
    - [ ] Nom du CV (éditable inline ou via modal).
    - [ ] Indicateur de sauvegarde : "Sauvegardé" ou "Sauvegarde en cours...".
    - [ ] Bouton "Télécharger PDF" (couleur action).
  - [ ] **Zone principale** :
    - [ ] Rendu du CV basé sur le template (50% de l'écran).
    - [ ] Panneau latéral pour la structure (30% de l'écran).
  - [ ] **Panneau latéral** :
    - [ ] Onglet "Structure" :
      - [ ] Liste des blocs du CV (Résumé, Expériences, Formations, Compétences).
      - [ ] Drag & drop pour réorganiser l'ordre des sections.
    - [ ] Onglet "Design" (pour v2) :
      - [ ] Sélecteur de template (pour l'instant désactivé).
- [ ] Implémenter l'édition inline :
  - [ ] Clic sur un texte dans le rendu du CV -> devient éditable (`contentEditable`).
  - [ ] Modification du texte -> mise à jour de l'état local.
  - [ ] Bouton "Enregistrer" ou sauvegarde auto (debounced) -> appel à `PUT /cv/{id}`.
- [ ] Implémenter le drag & drop des blocs :
  - [ ] Utiliser une bibliothèque comme `react-beautiful-dnd`.
  - [ ] Réorganisation -> mise à jour de l'ordre dans `cv_data_json` -> sauvegarde.

#### 4.5. Export PDF
- [ ] Choisir une méthode d'export :
  - [ ] **Méthode 1** (Côté client - rapide) :
    - [ ] Installer `html2pdf.js` ou `jsPDF`.
    - [ ] Clic sur "Télécharger PDF" -> convertir le HTML du CV en PDF dans le navigateur.
  - [ ] **Méthode 2** (Côté serveur - meilleure qualité) :
    - [ ] Créer un endpoint `POST /cv/{id}/export` dans le backend.
    - [ ] Utiliser `WeasyPrint` ou `Puppeteer` pour générer un PDF à partir du HTML.
    - [ ] Sauvegarder le PDF dans le bucket GCS.
    - [ ] Mettre à jour `gcs_pdf_url` dans la table.
    - [ ] Retourner l'URL signée pour le téléchargement.
- [ ] **Recommandation** : Commencer avec la Méthode 1 pour le MVP, passer à la Méthode 2 pour la qualité "ultra-pro".
- [ ] Implémenter la logique choisie.
- [ ] Tester le téléchargement.

---

### Phase 5 : Monétisation & Lancement (Durée estimée : 4-5 jours)
> **Branche pour cette phase :** `feature/monetization-stripe` (à créer depuis `develop`)
> 
> **Workflow :**
> 1. `git checkout develop`
> 2. `git pull`
> 3. `git checkout -b feature/monetization-stripe`
> 4. Effectuez toutes les tâches de la Phase 5.
> 5. Une fois terminé, créez une Pull Request de `feature/monetization-stripe` vers `develop`.
>
> **Mise en production :** Une fois cette PR fusionnée et testée sur staging, créez une PR de `develop` vers `main` pour le lancement.
*Objectif : L'utilisateur peut acheter le Pass 30 Jours pour continuer à générer des CVs. L'application est prête pour la production.*

#### 5.1. Intégration Stripe (Backend)
- [ ] Créer un compte Stripe et récupérer les clés API :
  - [ ] Créer un compte sur https://stripe.com/.
  - [ ] Aller dans "Developers" > "API Keys" et copier :
    - [ ] Clé secrète (pour le backend).
    - [ ] Clé publique (pour le frontend).
  - [ ] Ajouter `STRIPE_SECRET_KEY` à Secret Manager :
    - [ ] `gcloud secrets create stripe-secret-key --data-file=<fichier_contenant_la_clé>`.
    - [ ] Mettre à jour le service backend pour lire ce secret.
- [ ] Installer la bibliothèque Stripe dans le backend :
  - [ ] `poetry add stripe` (dans le dossier backend).
- [ ] Créer un produit "Pass 30 Jours" dans le dashboard Stripe :
  - [ ] Aller dans "Products" > "Add Product".
  - [ ] Nom : "Pass Talentious - 30 Jours".
  - [ ] Prix : 4,99 € (ou votre prix choisi).
  - [ ] Type : "One-time payment".
  - [ ] Copier l'ID du produit (ex: `price_123abc`).
- [ ] Créer un endpoint `POST /payment/create-checkout-session` :
  - [ ] Fichier : `backend/api/routes/payment.py`.
  - [ ] Logique :
    - [ ] Récupérer l'utilisateur authentifié.
    - [ ] Créer une session de checkout Stripe :
      ```python
      session = stripe.checkout.Session.create(
          payment_method_types=['card'],
          line_items=[{
              'price': 'price_123abc',  # ID du produit
              'quantity': 1,
          }],
          mode='payment',
          success_url=f'{FRONTEND_URL}/payment/success?session_id={{CHECKOUT_SESSION_ID}}',
          cancel_url=f'{FRONTEND_URL}/payment/cancel',
          client_reference_id=str(user.id),
      )
      ```
    - [ ] Retourner `session.url` (l'URL de redirection vers Stripe).
- [ ] Créer un endpoint `POST /payment/webhook` :
  - [ ] Fichier : `backend/api/routes/payment.py`.
  - [ ] Configurer le webhook dans Stripe :
    - [ ] Aller dans "Developers" > "Webhooks" > "Add Endpoint".
    - [ ] URL : `https://<votre-backend-url>/payment/webhook`.
    - [ ] Événements à écouter : `checkout.session.completed`.
    - [ ] Copier le secret du webhook (ex: `whsec_123abc`).
  - [ ] Logique du webhook :
    - [ ] Vérifier la signature du webhook :
      ```python
      sig_header = request.headers.get('Stripe-Signature')
      event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
      ```
    - [ ] Si l'événement est `checkout.session.completed` :
      - [ ] Récupérer `client_reference_id` (l'ID de l'utilisateur).
      - [ ] Mettre à jour la table `users` :
        - [ ] `pass_expires_at = now() + 30 jours`.
      - [ ] Logger l'achat.

#### 5.2. Intégration Stripe (Frontend)
- [ ] Ajouter la clé publique Stripe dans `frontend/.env.local` :
  - [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...`.
- [ ] Installer la bibliothèque Stripe dans le frontend :
  - [ ] `npm install @stripe/stripe-js`.
- [ ] Créer un composant modal de paiement : `frontend/src/components/PaymentModal.tsx` :
  - [ ] Déclenchement : Quand `402 Payment Required` est retourné par `/cv/generate`.
  - [ ] Contenu du modal :
    - [ ] Titre : "Acheter le Pass 30 Jours".
    - [ ] Description : "Générez autant de CVs que vous voulez pendant 30 jours pour seulement 4,99 €."
    - [ ] Bouton "Acheter maintenant".
  - [ ] Logique :
    - [ ] Appel à `POST /payment/create-checkout-session`.
    - [ ] Récupérer `session.url`.
    - [ ] Rediriger l'utilisateur vers `session.url` :
      ```tsx
      window.location.href = session.url;
      ```
- [ ] Créer une page de succès : `frontend/src/app/payment/success/page.tsx` :
  - [ ] Vérifier le paramètre `session_id` dans l'URL.
  - [ ] Appel optionnel à un endpoint `GET /payment/verify-session?session_id=...` pour confirmation.
  - [ ] Afficher un message de succès : "Merci pour votre achat ! Vous pouvez maintenant générer vos CVs.".
  - [ ] Bouton "Retour au Dashboard".
- [ ] Créer une page d'annulation : `frontend/src/app/payment/cancel/page.tsx` :
  - [ ] Message : "Votre paiement a été annulé. Vous pouvez réessayer à tout moment.".
  - [ ] Bouton "Retour au Dashboard".

#### 5.3. Test du Parcours de Paiement
- [ ] Tester le parcours complet en mode Stripe Test :
  - [ ] Créer un nouvel utilisateur.
  - [ ] Essayer de générer un CV sans pass -> 402.
  - [ ] Cliquer sur "Acheter".
  - [ ] Utiliser une carte de test Stripe : `4242 4242 4242 4242`.
  - [ ] Vérifier la redirection vers `/payment/success`.
  - [ ] Vérifier que le webhook a bien mis à jour `pass_expires_at` dans la BDD.
  - [ ] Regénérer un CV -> succès.
- [ ] Tester le parcours d'annulation :
  - [ ] Cliquer sur "Acheter", puis "Annuler" dans le formulaire Stripe.
  - [ ] Vérifier la redirection vers `/payment/cancel`.
  - [ ] Vérifier que le Pass n'est pas activé.
  - [ ] Vérifier que le message d'erreur est affiché.

#### 5.4. Tests End-to-End & Tests d'Intégration Complets

**Objectif** : Valider l'ensemble des flux utilisateurs critiques avec Playwright et atteindre minimum 70% de couverture de code.

##### 5.4.1. Configuration Playwright
- [ ] Installer Playwright et ses dépendances :
  ```bash
  cd frontend
  npm install -D @playwright/test
  npx playwright install
  npx playwright install-deps
  ```
- [ ] Créer `frontend/playwright.config.ts` :
  - [ ] Configuration des navigateurs (Chromium, Firefox, WebKit).
  - [ ] Configuration de la base URL (`http://localhost:3000` en dev).
  - [ ] Configuration des retries (2 tentatives en cas d'échec).
  - [ ] Configuration des timeouts (30s par défaut).
  - [ ] Configuration des traces et screenshots en cas d'échec.
- [ ] Créer la structure de dossiers de tests :
  ```
  frontend/tests/
  ├── e2e/                    # Tests end-to-end
  │   ├── auth.spec.ts
  │   ├── onboarding.spec.ts
  │   ├── profile.spec.ts
  │   ├── cv-generation.spec.ts
  │   ├── payment.spec.ts
  │   └── golden-path.spec.ts
  ├── integration/            # Tests d'intégration
  │   ├── api/
  │   │   ├── auth.test.ts
  │   │   └── profile.test.ts
  │   └── components/
  │       ├── login-flow.test.ts
  │       └── profile-forms.test.ts
  └── fixtures/               # Données de test
      ├── users.json
      ├── profiles.json
      └── test-cv.pdf
  ```

##### 5.4.2. Tests d'Authentification E2E
- [ ] Créer `frontend/tests/e2e/auth.spec.ts` :
  - [ ] **Test : Inscription utilisateur**
    - [ ] Naviguer vers `/register`.
    - [ ] Remplir email, mot de passe, confirmation.
    - [ ] Vérifier validation frontend (email format, mot de passe fort).
    - [ ] Soumettre le formulaire.
    - [ ] Vérifier redirection vers `/onboarding`.
    - [ ] Vérifier que le token JWT est stocké.
  - [ ] **Test : Connexion utilisateur**
    - [ ] Naviguer vers `/login`.
    - [ ] Remplir identifiants valides.
    - [ ] Vérifier connexion réussie.
    - [ ] Vérifier redirection vers `/dashboard` ou `/onboarding`.
  - [ ] **Test : Gestion erreurs authentification**
    - [ ] Tester email invalide → message d'erreur affiché.
    - [ ] Tester mot de passe incorrect → message d'erreur.
    - [ ] Tester compte inexistant → message d'erreur.
  - [ ] **Test : Déconnexion**
    - [ ] Se connecter.
    - [ ] Cliquer sur "Déconnexion".
    - [ ] Vérifier redirection vers `/login`.
    - [ ] Vérifier suppression du token.

##### 5.4.3. Tests Onboarding E2E
- [ ] Créer `frontend/tests/e2e/onboarding.spec.ts` :
  - [ ] **Test : Parcours complet onboarding**
    - [ ] Écran 1 : Informations personnelles (nom, prénom, téléphone).
    - [ ] Écran 2 : Objectifs professionnels (titre souhaité, salaire).
    - [ ] Écran 3 : Upload CV (optionnel) ou saisie manuelle.
    - [ ] Vérifier la progression (barre de progression).
    - [ ] Vérifier sauvegarde à chaque étape.
    - [ ] Vérifier redirection finale vers `/dashboard`.
  - [ ] **Test : Validation des champs obligatoires**
    - [ ] Tenter de passer à l'étape suivante sans remplir les champs.
    - [ ] Vérifier messages d'erreur.
  - [ ] **Test : Upload PDF parsing**
    - [ ] Upload un CV PDF de test.
    - [ ] Vérifier appel API `/profile/parse-cv`.
    - [ ] Vérifier pré-remplissage du profil.

##### 5.4.4. Tests Profil E2E
- [ ] Créer `frontend/tests/e2e/profile.spec.ts` :
  - [ ] **Test : Affichage du profil**
    - [ ] Naviguer vers `/profile`.
    - [ ] Vérifier affichage des informations personnelles.
    - [ ] Vérifier affichage des expériences, formations, compétences.
  - [ ] **Test : Modification du profil**
    - [ ] Cliquer sur "Modifier" pour chaque section.
    - [ ] Modifier les champs.
    - [ ] Sauvegarder.
    - [ ] Vérifier appel API `PUT /profile`.
    - [ ] Vérifier affichage du message de confirmation.
    - [ ] Recharger la page → vérifier persistance des données.
  - [ ] **Test : Ajout d'expérience**
    - [ ] Cliquer sur "+ Ajouter une expérience".
    - [ ] Remplir titre, entreprise, dates, description.
    - [ ] Ajouter des achievements.
    - [ ] Sauvegarder.
    - [ ] Vérifier ajout dans la liste.
  - [ ] **Test : Suppression d'expérience**
    - [ ] Supprimer une expérience existante.
    - [ ] Confirmer la suppression.
    - [ ] Vérifier retrait de la liste.
  - [ ] **Test : Validation des dates**
    - [ ] Tenter d'entrer date de fin < date de début.
    - [ ] Vérifier message d'erreur.

##### 5.4.5. Tests Génération CV E2E
- [ ] Créer `frontend/tests/e2e/cv-generation.spec.ts` :
  - [ ] **Test : Génération sans Pass (erreur 402)**
    - [ ] Naviguer vers dashboard.
    - [ ] Cliquer sur "+ Générer un nouveau CV".
    - [ ] Remplir l'offre d'emploi.
    - [ ] Soumettre.
    - [ ] Vérifier affichage popup paiement (402 Payment Required).
  - [ ] **Test : Génération avec Pass valide**
    - [ ] Simuler achat de Pass (injecter pass_expires_at dans le profil).
    - [ ] Cliquer sur "+ Générer un nouveau CV".
    - [ ] Remplir l'offre d'emploi.
    - [ ] Soumettre.
    - [ ] Vérifier appel aux agents IA.
    - [ ] Vérifier redirection vers `/editor/[cv_id]`.
    - [ ] Vérifier affichage du CV généré.

##### 5.4.6. Tests Paiement Stripe E2E
- [ ] Créer `frontend/tests/e2e/payment.spec.ts` :
  - [ ] **Test : Parcours d'achat complet (mode test Stripe)**
    - [ ] Déclencher popup paiement.
    - [ ] Remplir carte de test Stripe (`4242 4242 4242 4242`).
    - [ ] Valider le paiement.
    - [ ] Vérifier redirection vers `/payment/success`.
    - [ ] Vérifier mise à jour du profil (pass_expires_at).
    - [ ] Vérifier possibilité de générer un CV.
  - [ ] **Test : Annulation du paiement**
    - [ ] Déclencher popup paiement.
    - [ ] Cliquer sur "Annuler".
    - [ ] Vérifier redirection vers `/payment/cancel`.
    - [ ] Vérifier que le Pass n'est pas activé.
    - [ ] Vérifier que le message d'erreur est affiché.
  - [ ] **Test : Gestion erreur paiement**
    - [ ] Utiliser une carte refusée (`4000 0000 0000 0002`).
    - [ ] Vérifier message d'erreur.

##### 5.4.7. Test Golden Path Complet
- [ ] Créer `frontend/tests/e2e/golden-path.spec.ts` :
  - [ ] **Scénario complet de bout en bout** :
    1. [ ] Inscription d'un nouvel utilisateur.
    2. [ ] Complétion des 3 écrans d'onboarding.
    3. [ ] Arrivée sur le dashboard.
    4. [ ] Modification du profil (ajout expérience + compétences).
    5. [ ] Tentative de génération CV → popup paiement (402).
    6. [ ] Achat du Pass avec carte de test Stripe.
    7. [ ] Vérification webhook Stripe (attendre 5s).
    8. [ ] Génération d'un CV avec une offre d'emploi.
    9. [ ] Édition du CV dans l'éditeur.
    10. [ ] Téléchargement du PDF final.
    11. [ ] Déconnexion.
  - [ ] Durée estimée du test : ~2-3 minutes.
  - [ ] Prendre des screenshots à chaque étape critique.

##### 5.4.8. Tests d'Intégration API
- [ ] Créer `frontend/tests/integration/api/auth.test.ts` :
  - [ ] Tester `POST /auth/register` avec données valides/invalides.
  - [ ] Tester `POST /auth/login` avec credentials valides/invalides.
  - [ ] Tester `POST /auth/logout` avec/sans token.
  - [ ] Tester `GET /auth/me` avec token valide/invalide/expiré.
- [ ] Créer `frontend/tests/integration/api/profile.test.ts` :
  - [ ] Tester `GET /profile` avec utilisateur authentifié.
  - [ ] Tester `PUT /profile` avec données valides.
  - [ ] Tester validation des données (schéma Pydantic).
  - [ ] Tester `POST /profile/parse-cv` avec PDF valide/invalide.

##### 5.4.9. Tests de Composants avec Interactions
- [ ] Créer `frontend/tests/integration/components/login-flow.test.ts` :
  - [ ] Test complet du flux de connexion avec React Testing Library.
  - [ ] Mock des appels API avec MSW (Mock Service Worker).
  - [ ] Vérifier gestion des états (loading, success, error).
  - [ ] Vérifier redirections après connexion.
- [ ] Créer `frontend/tests/integration/components/profile-forms.test.ts` :
  - [ ] Tester ExperienceForm avec toutes les interactions.
  - [ ] Tester EducationForm avec validation des dates.
  - [ ] Tester SkillsInput avec ajout/suppression.
  - [ ] Tester sauvegarde et gestion des erreurs.

##### 5.4.10. Configuration CI/CD pour les Tests
- [ ] Mettre à jour `.github/workflows/ci.yml` :
  - [ ] Ajouter job pour tests Playwright :
    ```yaml
    playwright-tests:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v3
        - uses: actions/setup-node@v3
        - name: Install dependencies
          run: cd frontend && npm ci
        - name: Install Playwright
          run: cd frontend && npx playwright install --with-deps
        - name: Run E2E tests
          run: cd frontend && npx playwright test
        - name: Upload test results
          if: always()
          uses: actions/upload-artifact@v3
          with:
            name: playwright-report
            path: frontend/playwright-report/
    ```
  - [ ] Configurer execution des tests sur PR et push vers develop/main.
  - [ ] Bloquer les merges si les tests échouent.

##### 5.4.11. Rapport de Couverture et Documentation
- [ ] Générer rapport de couverture :
  - [ ] `npm test -- --coverage` pour tests Jest.
  - [ ] Générer rapport HTML : `npm test -- --coverage --coverageReporters=html`.
  - [ ] Viser minimum **70% de couverture** globale.
- [ ] Créer `frontend/tests/README.md` :
  - [ ] Documentation de la stratégie de test.
  - [ ] Instructions pour lancer les tests localement.
  - [ ] Liste des scénarios couverts.
  - [ ] Instructions pour déboguer les tests qui échouent.
- [ ] Documenter les résultats des tests E2E :
  - [ ] Capturer screenshots/vidéos du Golden Path.
  - [ ] Documenter les temps d'exécution.
  - [ ] Identifier les points d'amélioration.

#### 5.5. CGU, Mentions Légales & Politique de Confidentialité
- [ ] Créer `frontend/src/app/legal/terms.tsx` (CGU) :
  - [ ] Utiliser un template adapté aux SaaS français (RGPD-compliant).
  - [ ] Mentionner : Nom de l'entreprise, adresse, SIRET, contact.
  - [ ] Préciser les conditions d'utilisation du service.
- [ ] Créer `frontend/src/app/legal/privacy.tsx` (Politique de confidentialité) :
  - [ ] Expliquer quelles données sont collectées (email, nom, prénom, téléphone, etc.).
  - [ ] Expliquer où elles sont stockées (GCP, région europe-west9).
  - [ ] Préciser les droits de l'utilisateur (accès, rectification, suppression).
- [ ] Créer `frontend/src/app/legal/mentions-legales.tsx` (Mentions légales) :
  - [ ] Informations légales obligatoires (éditeur, hébergeur).
- [ ] Ajouter les liens dans le footer de toutes les pages.

#### 5.6. Préparation pour le Déploiement en Production

##### 5.6.1. Sécurisation des Prompts (Secret Manager)
**Contexte** : En développement, nos agents IA lisent les prompts depuis des fichiers locaux (`prompts/*.txt`). Pour la production, ces prompts doivent être sécurisés dans GCP Secret Manager pour éviter toute exposition ou modification non autorisée.

- [ ] **Créer les secrets dans GCP Secret Manager** :
  - [ ] Se connecter à GCP Console > Security > Secret Manager.
  - [ ] Créer les secrets suivants (un par agent et par langue) :
    - [ ] `PROMPT_PARSER_PDF_FR` (Parser-PDF en français)
    - [ ] `PROMPT_ANALYSEUR_OFFRE_FR` (Analyseur-Offre en français)
    - [ ] `PROMPT_REDACTEUR_CV_FR` (Rédacteur-CV en français)
  - [ ] Pour chaque secret, créer une première version vide (sera remplie à l'étape suivante).

- [ ] **Copier le contenu des prompts dans Secret Manager** :
  - [ ] Ouvrir `agents/parser-pdf/prompts/*.txt` (si applicable).
  - [ ] Copier le contenu complet du fichier.
  - [ ] Dans GCP Secret Manager, ouvrir le secret `PROMPT_PARSER_PDF_FR`.
  - [ ] Créer une nouvelle version et coller le contenu du prompt.
  - [ ] Répéter pour `PROMPT_ANALYSEUR_OFFRE_FR` :
    - [ ] Source : `agents/analyseur-offre/prompts/analyseur.txt`
  - [ ] Répéter pour `PROMPT_REDACTEUR_CV_FR` :
    - [ ] Source : `agents/redacteur-cv/prompts/redacteur.txt`
  - [ ] **Important** : Vérifier que le contenu copié est identique au fichier local (pas de caractères manquants ou mal encodés).

- [ ] **Configurer les permissions IAM** :
  - [ ] Identifier les Service Accounts utilisés par les agents en production :
    - [ ] Exemple : `analyseur-offre-sa@PROJECT_ID.iam.gserviceaccount.com`
    - [ ] Exemple : `redacteur-cv-sa@PROJECT_ID.iam.gserviceaccount.com`
  - [ ] Pour chaque Service Account, accorder le rôle `Secret Manager Secret Accessor` :
    - [ ] GCP Console > IAM & Admin > IAM
    - [ ] Ou via gcloud CLI :
      ```bash
      gcloud secrets add-iam-policy-binding PROMPT_ANALYSEUR_OFFRE_FR \
        --member="serviceAccount:analyseur-offre-sa@PROJECT_ID.iam.gserviceaccount.com" \
        --role="roles/secretmanager.secretAccessor"
      ```
  - [ ] Répéter pour chaque secret et chaque Service Account concerné.

- [ ] **Mettre à jour les variables d'environnement de production** :
  - [ ] Dans Cloud Run, éditer les services suivants (PRODUCTION uniquement) :
    - [ ] `analyseur-offre-production`
    - [ ] `redacteur-cv-production`
  - [ ] Ajouter la variable d'environnement :
    - [ ] Nom : `USE_SECRET_MANAGER`
    - [ ] Valeur : `true`
  - [ ] Ajouter les variables d'environnement pour les noms des secrets :
    - [ ] `SECRET_PROMPT_NAME=PROMPT_ANALYSEUR_OFFRE_FR` (pour analyseur-offre)
    - [ ] `SECRET_PROMPT_NAME=PROMPT_REDACTEUR_CV_FR` (pour redacteur-cv)
  - [ ] **Ne PAS activer** `USE_SECRET_MANAGER` en staging/développement (continuer à utiliser les fichiers locaux).

- [ ] **Vérifier le code de chargement des prompts** :
  - [ ] S'assurer que les agents vérifient la variable `USE_SECRET_MANAGER` :
    ```python
    if os.getenv("USE_SECRET_MANAGER") == "true":
        # Charger depuis Secret Manager
        prompt = load_prompt_from_secret_manager(secret_name)
    else:
        # Charger depuis fichier local
        prompt = load_prompt_from_file("prompts/xxx.txt")
    ```
  - [ ] Tester en local avec `USE_SECRET_MANAGER=false` (comportement par défaut).

- [ ] **Tester en production** :
  - [ ] Déployer les agents en production avec les nouvelles variables d'environnement.
  - [ ] Vérifier les logs Cloud Run pour confirmer que les prompts sont bien chargés depuis Secret Manager.
  - [ ] Générer un CV de test pour valider le bon fonctionnement.
  - [ ] En cas d'erreur, vérifier :
    - [ ] Les permissions IAM (Secret Accessor).
    - [ ] Le nom du secret (sensible à la casse).
    - [ ] Le contenu du secret (caractères spéciaux, encodage UTF-8).

**Documentation** :
- [ ] Documenter dans `README.md` ou `DEPLOYMENT.md` la procédure de mise à jour des prompts en production :
  - [ ] Comment modifier un prompt : Créer une nouvelle version du secret dans Secret Manager.
  - [ ] Comment rollback : Activer une version précédente du secret.
  - [ ] Comment tester : Utiliser une variable d'environnement différente en staging (`PROMPT_ANALYSEUR_OFFRE_FR_STAGING`).

##### 5.6.2. Vérifications Pré-Déploiement
- [ ] Vérifier que tous les autres secrets sont bien dans Secret Manager (pas de `.env` en clair).
- [ ] Vérifier que les variables d'environnement de production sont configurées dans Cloud Run.
- [ ] Vérifier que le webhook Stripe pointe vers l'URL de production.
- [ ] Tester le déploiement avec GitHub Actions :
  - [ ] Créer une branche `release/v1.0`.
  - [ ] Merger dans `main`.
  - [ ] Vérifier que le pipeline se lance et déploie correctement.

##### 5.6.3. Tests Finaux en Production
- [ ] Tester l'application en production :
  - [ ] Inscription d'un utilisateur.
  - [ ] Génération d'un CV (vérifier que les prompts Secret Manager fonctionnent).
  - [ ] Achat d'un Pass avec une vraie carte Stripe (mode live).
- [ ] Configurer les logs et monitoring (Cloud Logging, Cloud Monitoring).
- [ ] Configurer des alertes pour :
  - [ ] Erreurs 5xx.
  - [ ] Latence élevée.
  - [ ] Échecs de paiement.

#### 5.7. Lancement Officiel
- [ ] Activer le domaine custom (ex: `talentious.fr`) :
  - [ ] Acheter le domaine si nécessaire.
  - [ ] Configurer Cloud Run pour utiliser un domaine custom.
  - [ ] Configurer le DNS pour pointer vers Cloud Run.
- [ ] Annoncer le lancement sur les réseaux sociaux.
- [ ] Collecter les premiers retours utilisateurs.

---

### Phase 6 : Post-Lancement & Itérations (Continu)
> **Branches pour cette phase :** `fix/nom-du-bug` ou `feature/nom-de-l-iteration` (à créer depuis `develop`)
> 
> **Workflow :** Le cycle de développement normal reprend. Chaque bug ou petite amélioration a sa propre branche et sa propre PR vers `develop`. Les mises en production se font en groupant plusieurs fonctionnalités/corrections dans une PR de `develop` vers `main`.
*Objectif : Surveiller la production, recueillir les retours utilisateurs et préparer les évolutions futures.*

#### 6.1. Monitoring & Alertes
- [ ] Configurer Google Cloud Monitoring :
  - [ ] Créer un dashboard personnalisé :
    - [ ] Métrique : Nombre de requêtes par minute (toutes les routes).
    - [ ] Métrique : Latence moyenne (p50, p95, p99).
    - [ ] Métrique : Taux d'erreur (4xx, 5xx).
    - [ ] Métrique : Nombre de générations de CV par jour.
    - [ ] Métrique : Nombre d'achats de Pass par jour.
  - [ ] Accéder au dashboard : Cloud Console > Monitoring > Dashboards.
- [ ] Créer des alertes :
  - [ ] Alerte si taux d'erreur 5xx > 1% sur 5 minutes.
  - [ ] Alerte si latence p95 > 3 secondes.
  - [ ] Alerte si échec de paiement Stripe détecté.
  - [ ] Configurer les notifications par email.
- [ ] Configurer Cloud Logging :
  - [ ] Vérifier que tous les logs des services sont bien centralisés.
  - [ ] Créer des filtres pour isoler les logs d'erreur.

#### 6.2. Collecte de Feedback Utilisateur
- [ ] Ajouter un bouton "Feedback" dans le dashboard :
  - [ ] Créer un composant `frontend/src/components/FeedbackButton.tsx`.
  - [ ] Ouvrir un modal avec un formulaire simple :
    - [ ] "Que pensez-vous de Talentious ?" (textarea).
    - [ ] "Note sur 5 étoiles" (optionnel).
  - [ ] Envoyer le feedback à un endpoint `POST /feedback`.
- [ ] Backend : Créer `backend/app/routes/feedback.py` :
  - [ ] Sauvegarder les feedbacks dans une table `feedbacks` (user_id, message, rating, created_at).
  - [ ] Ou envoyer les feedbacks directement par email (via SendGrid ou Gmail API).
- [ ] Consulter régulièrement les feedbacks pour identifier les bugs et les demandes de fonctionnalités.

#### 6.3. Analyse des Données
- [ ] Créer un tableau de bord interne pour suivre les KPIs :
  - [ ] Nombre d'utilisateurs inscrits.
  - [ ] Taux de conversion (inscription -> génération de CV).
  - [ ] Taux de conversion (génération gratuite -> achat de Pass).
  - [ ] Nombre de CVs générés par utilisateur.
- [ ] Utiliser SQL directement sur Cloud SQL ou un outil de BI (Looker, Metabase) pour visualiser ces données.

#### 6.4. Itérations & Corrections de Bugs
- [ ] Traiter les bugs remontés par les utilisateurs :
  - [ ] Créer des issues GitHub pour chaque bug.
  - [ ] Prioriser les bugs critiques (bloquants pour l'utilisateur).
  - [ ] Déployer les correctifs rapidement en production.
- [ ] Améliorer l'UX en fonction des retours :
  - [ ] Exemple : Si beaucoup d'utilisateurs abandonnent l'onboarding, simplifier le processus.
  - [ ] Exemple : Si le temps de génération est jugé trop long, optimiser les appels aux agents IA.

#### 6.5. Planification de la v1.1 (Lettre de Motivation)
- [ ] Identifier la prochaine fonctionnalité à développer :
  - [ ] Selon le PROJECT_CONTEXT.md, la v1.1 introduira le **générateur de Lettre de Motivation**.
- [ ] Créer un nouveau document de spécifications pour la v1.1 :
  - [ ] Définir le flux UX pour la génération de lettres de motivation.
  - [ ] Décider si un nouvel agent IA est nécessaire ou si l'agent Rédacteur peut être réutilisé.
  - [ ] Définir le modèle de données pour stocker les lettres de motivation.
- [ ] Créer une nouvelle branche `feature/lettre-motivation` à partir de `develop`.
- [ ] Appliquer le même processus de développement en phases :
  - [ ] Phase A : Modèles backend + endpoint.
  - [ ] Phase B : Interface frontend.
  - [ ] Phase C : Agent IA pour la rédaction.
  - [ ] Phase D : Tests & déploiement.

#### 6.6. Optimisations Continues
- [ ] Optimiser les prompts des agents IA :
  - [ ] Utiliser les résultats des evals pour identifier les faiblesses.
  - [ ] Tester de nouvelles formulations.
  - [ ] Relancer les evals après chaque modification.
- [ ] Optimiser les performances :
  - [ ] Analyser les requêtes SQL lentes (logs Postgres).
  - [ ] Ajouter des indexes si nécessaire.
  - [ ] Mettre en cache les données fréquemment consultées (Redis si besoin).
- [ ] Réduire les coûts :
  - [ ] Surveiller les coûts d'utilisation de Vertex AI.
  - [ ] Optimiser le nombre de tokens envoyés par requête.
  - [ ] Surveiller les coûts de Cloud Run (CPU, mémoire).

#### 6.7. Communication & Marketing
- [ ] Publier des mises à jour sur les réseaux sociaux :
  - [ ] Annoncer les nouvelles fonctionnalités.
  - [ ] Partager des témoignages d'utilisateurs.
- [ ] Créer du contenu éducatif :
  - [ ] Articles de blog : "Comment rédiger un CV efficace avec l'IA".
  - [ ] Tutoriels vidéo pour utiliser Talentious.
- [ ] Recueillir des avis utilisateurs sur Product Hunt ou des forums spécialisés.

---

## Récapitulatif Final

Vous venez de parcourir une roadmap exhaustive pour construire **Talentious** de A à Z, de la configuration initiale au lancement en production, et même au-delà avec les itérations post-lancement.

**Résumé des durées estimées :**
- **Phase 0** : 3-4 jours (Infrastructure & CI/CD)
- **Phase 1** : 5-6 jours (Backend - Auth & Profils)
- **Phase 2** : 5-6 jours (Frontend - Auth & Profils)
- **Phase 3** : 7-9 jours (Agents IA & Génération de CV)
- **Phase 4** : 8-11 jours (Dashboard & Éditeur WYSIWYG)
- **Phase 5** : 4-5 jours (Monétisation & Lancement)
- **Phase 6** : Continu (Post-lancement)

**Durée totale estimée pour le MVP : 32-41 jours de travail effectif.**

En tant que développeur solo travaillant à temps plein, vous pouvez viser un lancement en **6 à 8 semaines** en comptant les imprévus, les phases de test et les ajustements.

**Prochaines étapes immédiates :**
1. Cloner ce repo et créer la structure de dossiers (Phase 0.1).
2. Configurer Docker Compose pour le développement local (Phase 0.2).
3. Créer un projet GCP et activer les services nécessaires (Phase 0.3).
4. Commencer le développement du backend (Phase 1).

**Bon courage, et que Talentious devienne une réussite !**
