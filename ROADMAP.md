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
*Objectif : Mettre en place un squelette de projet fonctionnel et automatisé.*

#### 0.1. Gestion de Projet & Versioning
- [ ] Créer le dépôt GitHub privé `Talentious`.
- [ ] Initialiser le dépôt localement avec `git init`.
- [ ] Créer la structure de branches initiale :
  - [ ] Créer la branche `main`.
  - [ ] Créer la branche `develop` à partir de `main`.
- [ ] Configurer les protections de branches sur GitHub :
  - [ ] Bloquer les pushs directs sur `main` (require PR).
  - [ ] Bloquer les pushs directs sur `develop` (require PR).
- [ ] Ajouter les fichiers de documentation :
  - [ ] Copier `PROJECT_CONTEXT.md` à la racine.
  - [ ] Copier `ROADMAP.md` à la racine.
  - [ ] Créer un fichier `README.md` avec la description du projet.
- [ ] Créer un fichier `.gitignore` global pour Python et Node.js.

#### 0.2. Environnement de Développement Local (Docker Compose)
- [ ] Créer un fichier `docker-compose.yml` à la racine du projet.
- [ ] Configurer le service PostgreSQL local :
  - [ ] Utiliser l'image officielle `postgres:15`.
  - [ ] Définir les variables d'environnement (POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB).
  - [ ] Mapper le port `5432` pour l'accès local.
  - [ ] Créer un volume pour persister les données localement.
- [ ] Configurer le service Backend (FastAPI) :
  - [ ] Définir le Dockerfile pour le backend (image Python 3.11).
  - [ ] Configurer le hot-reload avec `uvicorn --reload`.
  - [ ] Mapper le port `8000` pour l'API.
  - [ ] Lier le service à PostgreSQL local.
- [ ] Configurer le service Frontend (Next.js) :
  - [ ] Définir le Dockerfile pour le frontend (image Node 20).
  - [ ] Configurer le hot-reload avec `next dev`.
  - [ ] Mapper le port `3000` pour l'interface.
- [ ] Tester le lancement de l'ensemble avec `docker-compose up`.
- [ ] Créer un fichier `Makefile` ou un script `dev.sh` pour simplifier les commandes courantes.

#### 0.3. Infrastructure GCP
- [ ] Créer un nouveau projet GCP via la console (ex: `talentious-prod`).
- [ ] Activer la facturation sur le projet.
- [ ] Activer les APIs nécessaires :
  - [ ] Cloud Run API.
  - [ ] Cloud SQL Admin API.
  - [ ] Cloud Storage API.
  - [ ] Artifact Registry API.
  - [ ] Secret Manager API.
  - [ ] Vertex AI API.
- [ ] Installer et configurer le CLI `gcloud` sur votre machine locale.
- [ ] Authentifier `gcloud` : `gcloud auth login`.
- [ ] Définir le projet par défaut : `gcloud config set project talentious-prod`.
- [ ] Créer l'instance PostgreSQL sur Cloud SQL :
  - [ ] Choisir PostgreSQL 15.
  - [ ] Région : `europe-west9` (Paris).
  - [ ] Type d'instance : choisir une config économique pour le dev (ex: `db-f1-micro` pour commencer).
  - [ ] Activer le chiffrement au repos.
  - [ ] Noter les identifiants de connexion (host, user, password).
- [ ] Créer le bucket sur Cloud Storage :
  - [ ] Nom du bucket (ex: `talentious-cvs-prod`).
  - [ ] Type : Regional.
  - [ ] Région : `europe-west9`.
  - [ ] Classe de stockage : Standard.
  - [ ] Activer le chiffrement par défaut.
- [ ] Créer le dépôt sur Artifact Registry :
  - [ ] Format : Docker.
  - [ ] Nom (ex: `talentious-images`).
  - [ ] Région : `europe-west9`.

#### 0.4. Initialisation des Projets (Code)
- [ ] Créer la structure du monorepo :
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
- [ ] Initialiser le projet **Backend (FastAPI)** :
  - [ ] `cd backend && python -m venv venv`.
  - [ ] Activer l'environnement virtuel.
  - [ ] Installer FastAPI et Uvicorn : `pip install fastapi uvicorn[standard]`.
  - [ ] Créer la structure de base :
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
  - [ ] Créer un endpoint de test `GET /health` dans `main.py`.
  - [ ] Générer le fichier `requirements.txt` : `pip freeze > requirements.txt`.
- [ ] Initialiser le projet **Frontend (Next.js)** :
  - [ ] `npx create-next-app@latest frontend --typescript --tailwind --app`.
  - [ ] Installer les dépendances de base : `cd frontend && npm install`.
  - [ ] Configurer Tailwind CSS avec les couleurs du projet (#2D3748, #38A169).
  - [ ] Créer la structure de base :
    ```
    frontend/
    ├── src/
    │   ├── app/
    │   ├── components/
    │   ├── lib/
    │   └── styles/
    ├── public/
    ├── Dockerfile
    ├── package.json
    └── .env.local.example
    ```
  - [ ] Créer une page de test à la racine.

#### 0.5. CI/CD (GitHub Actions)
- [ ] Créer le dossier `.github/workflows/` à la racine.
- [ ] Créer le workflow `backend-staging.yml` :
  - [ ] Déclencher sur push vers `develop` (uniquement si des fichiers dans `/backend` ont changé).
  - [ ] Étapes :
    - [ ] Checkout du code.
    - [ ] Setup Python 3.11.
    - [ ] Installation des dépendances : `pip install -r backend/requirements.txt`.
    - [ ] Lancer les tests : `pytest backend/tests/`.
    - [ ] Authentification GCP (via un Service Account).
    - [ ] Configurer Docker pour utiliser Artifact Registry.
    - [ ] Construire l'image Docker : `docker build -t europe-west9-docker.pkg.dev/talentious-prod/talentious-images/backend:$GITHUB_SHA ./backend`.
    - [ ] Pousser l'image vers Artifact Registry.
    - [ ] Déployer sur Cloud Run (service `backend-staging`, région `europe-west9`).
- [ ] Créer le workflow `frontend-staging.yml` (même logique pour le frontend).
- [ ] Créer un Service Account GCP dédié au CI/CD :
  - [ ] Créer le compte : `ci-cd-deployer@talentious-prod.iam.gserviceaccount.com`.
  - [ ] Lui attribuer les rôles nécessaires (Cloud Run Admin, Artifact Registry Writer, Storage Admin).
  - [ ] Générer une clé JSON.
  - [ ] Ajouter cette clé comme secret GitHub (`GCP_SA_KEY`).
- [ ] Tester le pipeline en poussant un commit sur `develop`.

---

### Phase 1 : Cœur Backend - Utilisateurs & Profils (Durée estimée : 5-6 jours)
*Objectif : Avoir un backend capable de gérer des utilisateurs et leurs données de profil de manière sécurisée.*

#### 1.1. Configuration de la Base de Données
- [ ] Installer les dépendances nécessaires :
  - [ ] `pip install sqlalchemy psycopg2-binary alembic python-dotenv`.
  - [ ] Mettre à jour `requirements.txt`.
- [ ] Créer le fichier `backend/app/database.py` :
  - [ ] Configurer la connexion à PostgreSQL avec SQLAlchemy.
  - [ ] Créer un engine asynchrone (`create_async_engine`).
  - [ ] Créer une session factory.
  - [ ] Définir une dépendance FastAPI `get_db()` pour injecter la session.
- [ ] Configurer Alembic pour les migrations :
  - [ ] `cd backend && alembic init alembic`.
  - [ ] Modifier `alembic/env.py` pour utiliser le modèle SQLAlchemy.
  - [ ] Configurer la connexion DB dans `alembic.ini`.

#### 1.2. Modèles de Données (SQLAlchemy)
- [ ] Créer `backend/app/models/user.py` :
  - [ ] Définir le modèle `User` avec les colonnes : `id (UUID)`, `email`, `hashed_password`, `role`, `stripe_customer_id`, `created_at`.
  - [ ] Ajouter les contraintes (UNIQUE sur email, DEFAULT pour role).
- [ ] Créer `backend/app/models/user_profile.py` :
  - [ ] Définir le modèle `UserProfile` avec : `user_id (PK, FK)`, `profile_data (JSONB)`, `updated_at`.
- [ ] Créer `backend/app/models/career_pass.py` :
  - [ ] Définir le modèle `CareerPass` avec : `id`, `user_id`, `stripe_payment_id`, `pass_type`, `valid_until`, `purchased_at`.
- [ ] Créer `backend/app/models/generated_cv.py` :
  - [ ] Définir le modèle `GeneratedCV` avec : `id`, `user_id`, `cv_name`, `template_id`, `job_offer_context`, `cv_data_json (JSONB)`, `gcs_pdf_url`, `created_at`, `updated_at`.
- [ ] Créer le fichier `backend/app/models/__init__.py` pour exporter tous les modèles.

#### 1.3. Schémas Pydantic
- [ ] Créer `backend/app/schemas/user.py` :
  - [ ] Schéma `UserCreate` (email, password).
  - [ ] Schéma `UserLogin` (email, password).
  - [ ] Schéma `UserResponse` (id, email, role, created_at).
  - [ ] Schéma `Token` (access_token, token_type).
- [ ] Créer `backend/app/schemas/profile.py` :
  - [ ] Schéma `PersonalInfo` (first_name, last_name, phone, email, linkedin, address).
  - [ ] Schéma `Experience` (id, title, company, start_date, end_date, description, location).
  - [ ] Schéma `Education` (id, degree, institution, date).
  - [ ] Schéma `ProfileData` (personal_info, summary, experiences, educations, skills, projects, certifications).
  - [ ] Schéma `ProfileResponse` (user_id, profile_data, updated_at).

#### 1.4. Migrations de Base de Données
- [ ] Créer la première migration :
  - [ ] `cd backend && alembic revision --autogenerate -m "Initial tables"`.
  - [ ] Vérifier le fichier de migration généré.
- [ ] Appliquer la migration localement (Docker Compose) :
  - [ ] `alembic upgrade head`.
- [ ] Vérifier que les tables sont créées dans PostgreSQL local.
- [ ] **Automatisation CD** : Ajouter une étape au pipeline de déploiement pour exécuter `alembic upgrade head` avant de déployer le nouveau code :
  - [ ] Modifier `.github/workflows/backend-staging.yml`.
  - [ ] Ajouter une étape pour se connecter à Cloud SQL via le proxy.
  - [ ] Exécuter la commande `alembic upgrade head`.

#### 1.5. Authentification & Sécurité
- [ ] Installer les dépendances :
  - [ ] `pip install python-jose[cryptography] passlib[bcrypt] python-multipart`.
- [ ] Créer `backend/app/services/auth.py` :
  - [ ] Fonction `hash_password(password: str) -> str` (utilise bcrypt).
  - [ ] Fonction `verify_password(plain_password: str, hashed_password: str) -> bool`.
  - [ ] Fonction `create_access_token(data: dict) -> str` (génère un JWT).
  - [ ] Fonction `decode_access_token(token: str) -> dict` (valide et décode le JWT).
- [ ] Créer `backend/app/config.py` :
  - [ ] Charger les variables d'environnement (SECRET_KEY, DATABASE_URL, etc.).
  - [ ] Utiliser `python-dotenv` pour le développement local.
- [ ] Créer la dépendance `get_current_user` dans `backend/app/services/dependencies.py` :
  - [ ] Extraire le token du header `Authorization: Bearer <token>`.
  - [ ] Décoder le token et récupérer l'utilisateur depuis la DB.
  - [ ] Lever une exception `HTTPException(401)` si invalide.

#### 1.6. Endpoints d'Authentification
- [ ] Créer `backend/app/routes/auth.py` :
  - [ ] `POST /auth/register` :
    - [ ] Vérifier que l'email n'existe pas déjà.
    - [ ] Hasher le mot de passe.
    - [ ] Créer l'utilisateur dans la DB (rôle par défaut : `user`).
    - [ ] Créer un profil vide associé.
    - [ ] Retourner un message de succès.
  - [ ] `POST /auth/login` :
    - [ ] Vérifier que l'email existe.
    - [ ] Vérifier le mot de passe avec `verify_password`.
    - [ ] Générer un token JWT.
    - [ ] Retourner le token.
  - [ ] `GET /auth/me` (protégé) :
    - [ ] Utiliser la dépendance `get_current_user`.
    - [ ] Retourner les informations de l'utilisateur connecté.
- [ ] Intégrer les routes dans `backend/app/main.py`.

#### 1.7. Endpoints de Gestion du Profil
- [ ] Créer `backend/app/routes/profile.py` :
  - [ ] `GET /profile` (protégé) :
    - [ ] Récupérer le profil de l'utilisateur connecté.
    - [ ] Retourner `profile_data` (JSONB).
  - [ ] `PUT /profile` (protégé) :
    - [ ] Valider les données entrantes avec le schéma `ProfileData`.
    - [ ] Mettre à jour le champ `profile_data` dans la DB.
    - [ ] Mettre à jour `updated_at`.
    - [ ] Retourner le profil mis à jour.
- [ ] Intégrer les routes dans `backend/app/main.py`.

#### 1.8. Tests & Validation
- [ ] Installer pytest et les plugins :
  - [ ] `pip install pytest pytest-asyncio httpx`.
- [ ] Créer `backend/tests/test_auth.py` :
  - [ ] Test de l'endpoint `/auth/register` (succès).
  - [ ] Test de l'endpoint `/auth/register` (email déjà existant).
  - [ ] Test de l'endpoint `/auth/login` (succès).
  - [ ] Test de l'endpoint `/auth/login` (mauvais mot de passe).
  - [ ] Test de l'endpoint `/auth/me` (avec et sans token valide).
- [ ] Créer `backend/tests/test_profile.py` :
  - [ ] Test de `GET /profile` (utilisateur authentifié).
  - [ ] Test de `PUT /profile` (mise à jour valide).
- [ ] Lancer les tests localement : `pytest backend/tests/`.
- [ ] Vérifier que le pipeline CI/CD exécute les tests correctement.

#### 1.9. Gestion des Secrets (GCP Secret Manager)
- [ ] Créer les secrets dans Secret Manager :
  - [ ] `JWT_SECRET_KEY` : Une clé aléatoire forte.
  - [ ] `DATABASE_URL` : URL de connexion à Cloud SQL.
- [ ] Configurer Cloud Run pour charger ces secrets comme variables d'environnement.
- [ ] Tester le déploiement sur l'environnement staging.

---

### Phase 2 : Frontend - Authentification & Gestion du Profil (Durée estimée : 5-6 jours)
*Objectif : Permettre à un utilisateur de créer un compte, se connecter et modifier son profil.*

#### 2.1. Configuration de Base & Design System
- [ ] Configurer Tailwind CSS avec les couleurs du projet :
  - [ ] Ajouter dans `tailwind.config.js` :
    ```js
    colors: {
      primary: '#2D3748',
      action: '#38A169',
      background: '#FFFFFF',
      'background-light': '#F7FAFC',
      'text-primary': '#1A202C'
    }
    ```
- [ ] Installer la police "Inter" :
  - [ ] Ajouter via Google Fonts dans `layout.tsx`.
  - [ ] Configurer comme police par défaut dans Tailwind.
- [ ] Créer un fichier de composants réutilisables :
  - [ ] `frontend/src/components/ui/Button.tsx` (variants: primary, secondary, danger).
  - [ ] `frontend/src/components/ui/Input.tsx`.
  - [ ] `frontend/src/components/ui/Card.tsx`.
  - [ ] `frontend/src/components/ui/Modal.tsx`.

#### 2.2. Gestion de l'État & API
- [ ] Installer les dépendances :
  - [ ] `npm install @tanstack/react-query axios`.
- [ ] Créer `frontend/src/lib/api.ts` :
  - [ ] Configurer une instance Axios avec la base URL du backend.
  - [ ] Ajouter un intercepteur pour injecter le token JWT dans les headers.
- [ ] Créer `frontend/src/lib/auth.ts` :
  - [ ] Fonctions `login(email, password)`, `register(email, password)`.
  - [ ] Fonction `getMe()` pour récupérer l'utilisateur connecté.
  - [ ] Fonction `logout()`.
- [ ] Créer un Context React pour l'authentification :
  - [ ] `frontend/src/context/AuthContext.tsx`.
  - [ ] Stocker l'utilisateur connecté et le token.
  - [ ] Fournir des méthodes pour login, logout, et vérifier l'état.

#### 2.3. Pages Publiques (Landing Page & Auth)
- [ ] Créer `frontend/src/app/page.tsx` (Landing Page - Écran 0) :
  - [ ] Section hero avec le nom "Talentious" et un slogan accrocheur.
  - [ ] Description des fonctionnalités clés.
  - [ ] Boutons "Se connecter" et "S'inscrire" (liens vers `/login` et `/register`).
  - [ ] Design épuré avec beaucoup d'espace blanc.
- [ ] Créer `frontend/src/app/register/page.tsx` :
  - [ ] Formulaire d'inscription (email, password, confirmation password).
  - [ ] Validation des champs côté client.
  - [ ] Appel à l'API `/auth/register`.
  - [ ] Redirection vers `/login` en cas de succès.
  - [ ] Affichage des erreurs (email déjà existant, etc.).
- [ ] Créer `frontend/src/app/login/page.tsx` :
  - [ ] Formulaire de connexion (email, password).
  - [ ] Appel à l'API `/auth/login`.
  - [ ] Stockage du token dans le Context.
  - [ ] Redirection vers `/dashboard` en cas de succès.
  - [ ] Affichage des erreurs (identifiants incorrects).

#### 2.4. Routes Protégées & Navigation
- [ ] Créer un middleware pour protéger les routes :
  - [ ] `frontend/src/middleware.ts`.
  - [ ] Vérifier la présence d'un token valide.
  - [ ] Rediriger vers `/login` si non authentifié.
- [ ] Créer un composant de navigation :
  - [ ] `frontend/src/components/Navbar.tsx`.
  - [ ] Logo "Talentious" à gauche.
  - [ ] Menu utilisateur à droite (icône de profil, déconnexion).
  - [ ] Visible uniquement sur les pages authentifiées.

#### 2.5. Page d'Onboarding (Écran 1)
- [ ] Créer `frontend/src/app/onboarding/page.tsx` :
  - [ ] Message d'accueil : "Bienvenue sur Talentious. Importons votre profil pour commencer."
  - [ ] Trois options de cartes cliquables :
    - [ ] **Option 1** : "Importer un CV (PDF)" (mise en avant visuelle).
    - [ ] **Option 2** : "Importer un profil LinkedIn (PDF)" (avec info-bulle).
    - [ ] **Option 3** : "Commencer manuellement" (discret).
  - [ ] Pour l'Option 1 et 2 :
    - [ ] Bouton d'upload de fichier.
    - [ ] Prévisualisation du nom du fichier.
    - [ ] Bouton "Continuer" qui appelle l'API de parsing (Phase 3).
  - [ ] Pour l'Option 3 :
    - [ ] Redirection directe vers `/profile`.

#### 2.6. Page de Profil (Écran 2)
- [ ] Créer `frontend/src/app/profile/page.tsx` :
  - [ ] Formulaire structuré par sections (accordéon ou onglets) :
    - [ ] **Informations Personnelles** : Prénom, nom, téléphone, email, LinkedIn, adresse.
    - [ ] **Résumé** : Textarea pour le résumé professionnel.
    - [ ] **Expériences** : Liste dynamique (ajout/suppression).
      - [ ] Pour chaque expérience : Poste, entreprise, dates, description.
    - [ ] **Formations** : Liste dynamique.
      - [ ] Pour chaque formation : Diplôme, institution, date.
    - [ ] **Compétences** : Deux sections (hard skills, soft skills).
      - [ ] Input avec tags pour ajouter/supprimer des compétences.
    - [ ] **Projets** : Liste dynamique (optionnel).
    - [ ] **Certifications** : Liste dynamique (optionnel).
  - [ ] Bouton "Sauvegarder" :
    - [ ] Appel à `PUT /profile`.
    - [ ] Affichage d'un message de confirmation.
  - [ ] Si le profil est pré-rempli (via parsing), afficher les données existantes.

#### 2.7. Tests Frontend
- [ ] Installer les dépendances de test :
  - [ ] `npm install --save-dev @testing-library/react @testing-library/jest-dom jest`.
- [ ] Créer des tests pour les composants critiques :
  - [ ] Test du formulaire de login.
  - [ ] Test du formulaire de profil (sauvegarde).
- [ ] Lancer les tests : `npm test`.

---

### Phase 3 : Magie IA - Agents & Flux de Génération (Durée estimée : 7-9 jours)
*Objectif : Construire les microservices IA et le flux backend qui génère le contenu d'un CV.*

#### 3.1. Agent `Parser-PDF`
- [ ] Créer la structure du projet :
  - [ ] `agents/parser-pdf/` avec la même structure qu'un projet FastAPI.
- [ ] Installer les dépendances :
  - [ ] `pip install fastapi uvicorn PyMuPDF`.
- [ ] Créer `agents/parser-pdf/app/main.py` :
  - [ ] Endpoint `POST /parse` :
    - [ ] Accepter un fichier PDF en multipart/form-data.
    - [ ] Utiliser PyMuPDF pour extraire le texte.
    - [ ] Retourner le texte brut en JSON : `{"text": "..."}`.
- [ ] Créer un Dockerfile pour cet agent.
- [ ] Déployer sur Cloud Run (service privé) :
  - [ ] Configurer pour n'accepter que les requêtes authentifiées (IAM).
  - [ ] Région : `europe-west9`.
- [ ] Intégrer cet agent dans le backend principal :
  - [ ] Créer `backend/app/services/parser_client.py` :
    - [ ] Fonction `parse_pdf(file_bytes: bytes) -> str`.
    - [ ] Utilise un HTTP client pour appeler le service Cloud Run.
    - [ ] Gère l'authentification IAM.
- [ ] Tester l'intégration avec un PDF de test.

#### 3.2. Agent `Analyseur-Offre`
- [ ] Créer la structure du projet : `agents/analyseur-offre/`.
- [ ] Installer les dépendances :
  - [ ] `pip install fastapi uvicorn google-cloud-aiplatform`.
- [ ] Créer le prompt d'analyse dans Secret Manager :
  - [ ] Nom du secret : `PROMPT_ANALYSEUR_OFFRE`.
  - [ ] Contenu : Le prompt détaillé pour analyser une offre (identifier compétences, ton, niveau requis).
- [ ] Créer `agents/analyseur-offre/app/main.py` :
  - [ ] Endpoint `POST /analyze` :
    - [ ] Accepter `{"offer_text": "..."}` ou `{"offer_pdf": <bytes>}`.
    - [ ] Si PDF, appeler l'Agent Parser-PDF.
    - [ ] Charger le prompt depuis Secret Manager.
    - [ ] Appeler Vertex AI (Gemini Pro) avec le prompt + le texte de l'offre.
    - [ ] Parser la réponse JSON.
    - [ ] Retourner : `{"skills": [...], "tone": "...", "level": "..."}`.
- [ ] Créer un Dockerfile.
- [ ] Déployer sur Cloud Run (service privé, région `europe-west9`).
- [ ] Intégrer dans le backend principal :
  - [ ] `backend/app/services/analyzer_client.py`.

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
- [ ] Créer un dossier `backend/evals/`.
- [ ] Créer des fichiers de test :
  - [ ] `backend/evals/profiles/` : 5 profils JSON types (junior, senior, reconversion, tech, non-tech).
  - [ ] `backend/evals/offers/` : 5 offres texte types.
- [ ] Créer `backend/evals/run_evals.py` :
  - [ ] Script qui charge tous les profils et offres.
  - [ ] Pour chaque combinaison (25 au total) :
    - [ ] Appelle l'Agent Analyseur.
    - [ ] Appelle l'Agent Rédacteur.
    - [ ] Sauvegarde le résultat dans `backend/evals/results/<timestamp>/`.
  - [ ] Génère un rapport simple (nombre de réussites, échecs, avertissements).
- [ ] Documenter dans le README comment lancer les evals avant de valider un changement de prompt.

#### 3.5. Orchestration Backend (Endpoint Principal)
- [ ] Créer la table `generated_cvs` (si pas déjà fait en Phase 1) :
  - [ ] Migration Alembic.
- [ ] Créer `backend/app/routes/cv.py` :
  - [ ] `POST /cv/generate` (protégé) :
    - [ ] **Vérification des permissions** :
      - [ ] Si `user.role == 'admin'` : OK.
      - [ ] Sinon, vérifier qu'il existe un `career_pass` valide : `SELECT * FROM career_passes WHERE user_id = ... AND valid_until > NOW()`.
      - [ ] Si aucun : retourner `402 Payment Required`.
    - [ ] Accepter `{"cv_name": "...", "offer_text": "...", "offer_pdf": <optionnel>}`.
    - [ ] Récupérer le `profile_data` de l'utilisateur.
    - [ ] Appeler l'Agent Analyseur avec l'offre.
    - [ ] Appeler l'Agent Rédacteur avec le profil + l'analyse.
    - [ ] Sauvegarder le résultat dans `generated_cvs` :
      - [ ] `cv_name`, `template_id` (pour l'instant : "modern_v1"), `job_offer_context`, `cv_data_json`.
    - [ ] Retourner le CV généré : `{"cv_id": "...", "cv_data": {...}}`.
  - [ ] `GET /cv` (protégé) :
    - [ ] Lister tous les CVs de l'utilisateur connecté.
  - [ ] `GET /cv/{cv_id}` (protégé) :
    - [ ] Récupérer un CV spécifique (vérifier que `user_id` correspond).
  - [ ] `PUT /cv/{cv_id}` (protégé) :
    - [ ] Mettre à jour le `cv_data_json` (après édition dans le WYSIWYG).
  - [ ] `DELETE /cv/{cv_id}` (protégé) :
    - [ ] Supprimer un CV (et son PDF sur GCS si existant).
- [ ] Intégrer les routes dans `backend/app/main.py`.
- [ ] Écrire des tests pour l'endpoint `/cv/generate`.

---

### Phase 4 : Cœur de l'Application - Dashboard & Éditeur (Durée estimée : 8-11 jours)
*Objectif : L'utilisateur peut générer, voir, éditer et télécharger son CV.*

#### 4.1. Dashboard (Écran 3)
- [ ] Créer `frontend/src/app/dashboard/page.tsx` :
  - [ ] Titre : "Mes CVs".
  - [ ] Bouton principal (en haut à droite) : "+ Générer un nouveau CV" (couleur action).
  - [ ] Si aucun CV n'existe :
    - [ ] Afficher un état vide avec une illustration et un message encourageant.
  - [ ] Si des CVs existent :
    - [ ] Afficher une grille de cartes (3 colonnes sur desktop, 1 sur mobile).
    - [ ] Pour chaque carte :
      - [ ] Nom du CV.
      - [ ] Date de dernière modification.
      - [ ] Boutons d'action : "Éditer", "Télécharger PDF", "Supprimer".
- [ ] Implémenter la logique de récupération des CVs :
  - [ ] Appel à `GET /cv` au chargement de la page.
  - [ ] Utiliser TanStack Query pour gérer le cache et le state.

#### 4.2. Flux de Génération (Pop-up)
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
- [ ] Créer une fonction `renderCV(cvData: object) -> JSX` :
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

#### 5.4. Test End-to-End "Golden Path"
- [ ] Installer Playwright :
  - [ ] `npm install -D @playwright/test`.
  - [ ] `npx playwright install`.
- [ ] Créer `frontend/tests/e2e/golden-path.spec.ts` :
  - [ ] Scénario complet :
    1. [ ] Naviguer vers la landing page.
    2. [ ] Cliquer sur "Créer mon compte".
    3. [ ] Remplir le formulaire d'inscription et soumettre.
    4. [ ] Vérifier la redirection vers `/onboarding`.
    5. [ ] Remplir les 3 écrans d'onboarding.
    6. [ ] Arriver sur le dashboard.
    7. [ ] Cliquer sur "+ Générer un nouveau CV".
    8. [ ] Remplir l'offre d'emploi (en texte).
    9. [ ] Vérifier la popup de paiement (402).
    10. [ ] Simuler l'achat (ou passer par Stripe en mode test).
    11. [ ] Regénérer un CV après achat.
    12. [ ] Vérifier la redirection vers l'éditeur.
    13. [ ] Éditer un texte dans le CV.
    14. [ ] Télécharger le PDF.
  - [ ] Commande pour lancer le test :
    - [ ] `npx playwright test`.
- [ ] Documenter les résultats du test.

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
- [ ] Vérifier que tous les secrets sont bien dans Secret Manager (pas de `.env` en clair).
- [ ] Vérifier que les variables d'environnement de production sont configurées dans Cloud Run.
- [ ] Vérifier que le webhook Stripe pointe vers l'URL de production.
- [ ] Tester le déploiement avec GitHub Actions :
  - [ ] Créer une branche `release/v1.0`.
  - [ ] Merger dans `main`.
  - [ ] Vérifier que le pipeline se lance et déploie correctement.
- [ ] Tester l'application en production :
  - [ ] Inscription d'un utilisateur.
  - [ ] Génération d'un CV.
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
