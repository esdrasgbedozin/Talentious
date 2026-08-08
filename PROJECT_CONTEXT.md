# TALENTIOUS - CONTEXTE DU PROJET & RÈGLES DE DÉVELOPPEMENT

> **Statut (2026-08-08)** : document de **vision/stratégie** historique. La source de
> vérité **technique** est désormais `contracts/openapi.yaml` (Contract-First) ; l'état
> réel du produit est décrit dans `00_BIBLE_PROJET.md` et `01_ARCHITECTURE_TECHNIQUE.md`.
> Talentious est **en production** sur https://talentious.app (europe-west9).

*Les principes de vision, de périmètre et de sécurité ci-dessous restent la ligne directrice.*

---

## 1. VISION PRODUIT & STRATÉGIE

- **Concept** : Une plateforme SaaS B2C qui utilise l'IA (Vertex AI) pour générer des CVs "ultra-professionnels" enrichis et adaptés aux offres d'emploi.
- **Cible** : Chercheurs d'emploi exigeants en Europe (focus France).
- **Valeur Clé** : L'enrichissement sémantique (rewriting) et l'adaptation du contenu sont plus importants que la simple mise en page.
- **Modèle Économique** : **"Pass d'Accès Temporaire"**. Un paiement unique (via Stripe) pour un accès illimité pendant une durée définie (ex: "Pass 30 Jours"). Pas d'abonnement récurrent.

## 2. PÉRIMÈTRE V1 (livré en production)

- **INCLUS EN V1 (livré)** :
  - **Gestion de Compte** : inscription (email vérifié obligatoire), connexion,
    **Sign in with Google**, suppression (RGPD Art. 17), rôle `admin` (accès sans paiement) + vue `/admin/users`.
  - **Onboarding / Profil** : création manuelle et **import IA via PDF (CV ou LinkedIn)**, asynchrone, avec relecture humaine.
  - **Agents IA** : `parser-pdf` (import), `analyseur-offre`, `rédacteur-cv` — privés, Gemini 2.5 Pro.
  - **Design & Rendu** : un template de CV professionnel.
  - **Flux de Génération** : dashboard `/cvs`, saisie de l'offre, génération **asynchrone** (job + polling).
  - **Éditeur** : édition du CV généré.
  - **Export** : téléchargement en PDF (rendu client).
  - **Paiement** : Stripe Checkout + webhook signé (mode `test` en bêta gratuite, `live` au SIRET).
- **HORS V1 (v1.1 / v2)** :
  - Génération de Lettre de Motivation.
  - Multiples templates de CV.
  - Suivi de candidature.
  - Système de feedback in-app.

---

## 3. ARCHITECTURE TECHNIQUE (NON NÉGOCIABLE)

### 3.1. Stack & Infrastructure (GCP - `europe-west9` ONLY)
- **Frontend** : Next.js (React) -> Déployé sur Cloud Run.
- **Backend Principal** : FastAPI (Python 3.11+) -> Déployé sur Cloud Run.
- **Agents IA (Microservices)** : FastAPI (Python) -> Déployés sur Cloud Run (services privés).
- **Database** : PostgreSQL 15+ -> Cloud SQL (Géré).
- **File Storage** : Google Cloud Storage (Bucket régional standard).
- **AI Model** : Vertex AI **`gemini-2.5-pro`**, région `europe-west9` (souveraineté UE).

### 3.2. Règles de Communication
- Le Frontend ne communique qu'avec le Backend Principal.
- Le Backend Principal authentifie toutes les requêtes via JWT.
- Les Agents IA n'acceptent que les requêtes du Service Account du Backend Principal.

---

## 4. MODÈLE DE DONNÉES (PostgreSQL)

*Note : La structure exacte des champs `JSONB` (`profile_data` et `cv_data_json`) sera définie et validée par des modèles Pydantic dans le code du backend (FastAPI). Ces modèles serviront de "contrat de données" strict.*

- **Table `users`** : `id (UUID, PK)`, `email`, `hashed_password`, `role ('user'|'admin')`, `stripe_customer_id`.
- **Table `user_profiles`** : 
  - `user_id (UUID, PK, FK)`, `updated_at`.
  - `profile_data (JSONB)` : Le "Profil Maître" de l'utilisateur. Doit suivre une structure définie, par exemple :
    ```json
    {
      "personal_info": { "first_name": "...", "last_name": "...", ... },
      "summary": "...",
      "experiences": [{ "id": "...", "title": "...", ... }],
      "educations": [{ "id": "...", "degree": "...", ... }],
      "skills": { "hard": [], "soft": [] },
      "projects": [],
      "certifications": []
    }
    ```
- **Table `career_passes`** : `id (UUID, PK)`, `user_id`, `stripe_payment_id`, `pass_type`, `valid_until`.
- **Table `generated_cvs`** : `id (UUID, PK)`, `user_id`, `cv_name`, `template_id`, `job_offer_context`, `cv_data_json (JSONB)`, `gcs_pdf_url`.

---

## 5. DESIGN & EXPÉRIENCE UTILISATEUR (UX/UI)

- **Philosophie UX** : "La Productivité Guidée", "Le Minimalisme Expert", "L'IA comme Partenaire".
- **Identité Visuelle (Choix Finaux)** :
  - **Palette** : Primaire **Gris Anthracite (#2D3748)**, Action **Vert Menthe Vif (#38A169)**.
  - **Typographie** : **Inter** (police Sans Serif).
  - **Logo** : Concept **"T Architectural"** avec ses 3 variantes (complet, logomark, logotype).
- **Parcours Utilisateur (User Flow)** :
  - **Écran 0 : Landing Page Publique**.
  - **Écran 1 : Onboarding** (Import PDF).
  - **Écran 2 : Profil** (Vérification).
  - **Écran 3 : Dashboard** (Hub central).
  - **Écran 4 : Éditeur WYSIWYG**.

---

## 6. SÉCURITÉ & CONFORMITÉ

- **Souveraineté des Données** : Tous les services et données sont confinés à la région GCP **`europe-west9` (Paris)**.
- **Sécurité Technique** :
  - **Authentification** : access JWT court (15 min) + **refresh token rotatif** httpOnly
    (`talentious_refresh`, rotation + family burn) ; cookie de navigation `__session`.
    Vérification email obligatoire au login. Sign in with Google (vérification signature + audience).
  - **Mots de passe** : hachage Bcrypt (nullable pour les comptes Google-only).
  - **Moindre privilège** : un service account par service ; agents privés (IAM service-to-service) ;
    secrets applicatifs dans **Secret Manager** (lus par le seul backend).
  - **Erreurs** : RFC 7807 (`application/problem+json`). **Anti-injection de prompt** en couches sur les imports PDF.
- **Conformité RGPD** :
  - Implémentation du consentement explicite, de la transparence (CGU/Politique de Confidentialité), et des droits de rectification, d'accès/portabilité et à l'oubli.

---

## 7. STRATÉGIE DE DÉVELOPPEMENT ET CI/CD

- **Outils** : Git (**GitHub**), GCP Artifact Registry, GCP Cloud Run.
- **Moteur CI/CD** : **GitHub Actions**.
- **Authentification CI → GCP** : **Workload Identity Federation** (aucune clé JSON, pool verrouillé sur le repo).
- **Flux de Travail (Pipeline `deploy-prod.yml`)** :
  - `push main` -> Test -> Build multi-images (`linux/amd64`) -> Push (Artifact Registry)
    -> Migrations Alembic (Cloud SQL Proxy) -> Deploy (Cloud Run) -> Purge CDN (Firebase Hosting).
- **Gestion des Environnements** :
  - **Production** : déploiement depuis la branche `main`. Staging **décommissionné**.
  - **IaC** : Terraform possède la forme de l'infra ; la CI roule les images
    (`lifecycle ignore_changes[image]`). Le mot de passe Cloud SQL se gère hors Terraform.