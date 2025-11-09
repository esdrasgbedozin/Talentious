# TALENTIOUS - CONTEXTE DU PROJET & RÈGLES DE DÉVELOPPEMENT

**CE FICHIER EST LA SOURCE DE VÉRITÉ ABSOLUE.**
*Toutes les suggestions de code, architectures et corrections DOIVENT respecter scrupuleusement les contraintes définies ci-dessous.*

---

## 1. VISION PRODUIT & STRATÉGIE

- **Concept** : Une plateforme SaaS B2C qui utilise l'IA (Vertex AI) pour générer des CVs "ultra-professionnels" enrichis et adaptés aux offres d'emploi.
- **Cible** : Chercheurs d'emploi exigeants en Europe (focus France).
- **Valeur Clé** : L'enrichissement sémantique (rewriting) et l'adaptation du contenu sont plus importants que la simple mise en page.
- **Modèle Économique** : **"Pass d'Accès Temporaire"**. Un paiement unique (via Stripe) pour un accès illimité pendant une durée définie (ex: "Pass 30 Jours"). Pas d'abonnement récurrent.

## 2. PÉRIMÈTRE DU MVP (Minimum Viable Product)

- **INCLUS DANS LE MVP** :
  - **Gestion de Compte** : Inscription, connexion, suppression (RGPD), et un rôle `admin` pour un accès "sudo" sans paiement.
  - **Onboarding / Profil** : Création manuelle et **import indispensable via PDF (CV ou LinkedIn)**.
  - **Agents IA (MVP)** : `Parser-PDF`, `Analyseur-Offre`, `Rédacteur-CV`.
  - **Design & Rendu** : **Un seul template de CV** professionnel.
  - **Flux de Génération** : Dashboard simplifié, pop-up pour l'offre, génération du JSON.
  - **Éditeur WYSIWYG** : Éditeur de blocs pour corrections et réorganisation.
  - **Export** : Téléchargement en PDF.
  - **Paiement** : Intégration Stripe avec un mode `test` et un mode `live`.
- **HORS MVP (v1.1 / v2)** :
  - Génération de Lettre de Motivation.
  - Multiples templates de CV.
  - Suivi de candidature.
  - Chat "Juste-à-temps" pour compléter le profil.

---

## 3. ARCHITECTURE TECHNIQUE (NON NÉGOCIABLE)

### 3.1. Stack & Infrastructure (GCP - `europe-west9` ONLY)
- **Frontend** : Next.js (React) -> Déployé sur Cloud Run.
- **Backend Principal** : FastAPI (Python 3.11+) -> Déployé sur Cloud Run.
- **Agents IA (Microservices)** : FastAPI (Python) -> Déployés sur Cloud Run (services privés).
- **Database** : PostgreSQL 15+ -> Cloud SQL (Géré).
- **File Storage** : Google Cloud Storage (Bucket régional standard).
- **AI Model** : Vertex AI (Gemini Pro), appelé depuis un endpoint européen.

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
  - **Authentification** : JWT dans des cookies `HttpOnly`.
  - **Mots de passe** : Hachage avec Bcrypt.
  - **Protection des Prompts** : Stockage dans **GCP Secret Manager**.
- **Conformité RGPD** :
  - Implémentation du consentement explicite, de la transparence (CGU/Politique de Confidentialité), et des droits de rectification, d'accès/portabilité et à l'oubli.

---

## 7. STRATÉGIE DE DÉVELOPPEMENT ET CI/CD

- **Outils** : Git (**GitHub**), GCP Artifact Registry, GCP Cloud Run.
- **Moteur CI/CD** : **GitHub Actions**.
- **Flux de Travail (Pipeline)** :
  - `push` -> Test -> Build (Docker) -> Push (Artifact Registry) -> Deploy (Cloud Run).
- **Gestion des Environnements** :
  - **Staging** : Déploiement depuis la branche `develop`.
  - **Production** : Déploiement depuis la branche `main`.