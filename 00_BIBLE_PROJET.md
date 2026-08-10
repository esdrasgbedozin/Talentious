# 00 — BIBLE DU PROJET « TALENTIOUS »

> **Statut** : document vivant, mis à jour le 2026-08-08 pour refléter l'état
> **en production**. Talentious est déployé et ouvert sur https://talentious.app
> (API `api.talentious.app`), région GCP `europe-west9` (Paris). Régime de
> **bêta gratuite** (paiement Stripe en mode test tant que la structure
> juridique n'est pas créée). Source de vérité technique : `contracts/openapi.yaml`.

---

## 1. Vision & problème

- **Produit** : plateforme SaaS B2C de génération de CV assistée par IA.
- **Problème adressé** : adapter un CV à chaque offre d'emploi est long et mal fait ;
  la valeur est dans le **rewriting sémantique** (sélection des expériences pertinentes,
  verbes d'action, alignement avec les mots-clés de l'offre), pas dans la mise en page.
- **Cible** : chercheurs d'emploi exigeants en Europe, focus France (produit 100 % en français).
- **Contrainte souveraineté** : toutes les données et tous les traitements IA confinés à
  la région GCP `europe-west9` (Paris) — exigence RGPD explicite et appliquée dans le code
  (Vertex AI initialisé sur `europe-west9`, modèle `gemini-2.5-pro`).

## 2. Modèle économique

- **« Pass d'Accès Temporaire »** : paiement unique Stripe Checkout → accès illimité pendant
  une durée fixe (`PASS_30_DAYS`, `PASS_90_DAYS`). Pas d'abonnement récurrent.
- Rôle `admin` : accès sans paiement (bypass du CareerPass, implémenté dans `cv.py`).
- **État réel** : intégration Stripe complète (Checkout + webhook signé qui crée le
  CareerPass) livrée et fonctionnelle. Tourne en **mode test** en attendant le SIRET
  (choix juridique, pas une lacune technique) : le régime actuel est une bêta gratuite.

## 3. Personas

| Persona | Besoin | Parcours |
|---|---|---|
| **Le candidat pressé** | Un CV adapté à une offre rapidement | Import PDF/LinkedIn → génération → export PDF |
| **Le candidat méticuleux** | Contrôler chaque ligne du CV généré | Profil manuel → génération → éditeur |
| **L'admin (fondateur)** | Tester/dépanner sans payer, superviser les inscrits | Rôle `admin`, bypass paiement, vue `/admin/users` |

## 4. Périmètre V1 (livré en production)

| Capacité | État réel du code |
|---|---|
| Inscription / connexion | ✅ Email + mot de passe **avec vérification email obligatoire au login** (anti-usurpation d'adresse) |
| Connexion Google | ✅ « Se connecter avec Google » (Sign in with Google, `POST /auth/google`, comptes sans mot de passe possibles) |
| Sessions | ✅ Access JWT 15 min + **refresh tokens rotatifs en base** (rotation + family burn), cookie `__session` |
| Profil maître (JSONB) + CRUD | ✅ Fait et testé |
| Import PDF du profil (CV / LinkedIn) | ✅ **Livré** : extraction structurée par l'agent `parser-pdf` (`/extract-profile`, Gemini), **asynchrone** (job + polling), brouillon soumis à relecture humaine — rien n'est persisté sans validation |
| Analyse d'offre (agent IA) | ✅ Agent `analyseur-offre` (Gemini 2.5 Pro) |
| Génération de CV (agent IA) | ✅ **Asynchrone** (202 + job_id + polling/SSE), agent `redacteur-cv` (Gemini 2.5 Pro) |
| Dashboard « Mes CV » | ✅ Route `/cvs` |
| Éditeur | ✅ Édition du CV généré |
| Template CV + export PDF | ✅ Export PDF (rendu client) |
| Paiement Stripe | ✅ Checkout + webhook signé (mode test, bêta gratuite) |
| Vue admin | ✅ `/admin/users` (lecture seule : comptes, pass, volumétrie CV) |
| Suppression de compte (RGPD Art. 17) | ✅ `DELETE /users/me` + UI |
| Pages légales + emails transactionnels | ✅ CGU/Confidentialité/Mentions ; emails Brevo (domaine talentious.app, DKIM/DMARC) |
| Hors V1 (v1.1+) | Lettre de motivation, multi-templates, suivi de candidatures, système de feedback in-app |

## 5. Ubiquitous Language (ancré dans le code)

| Terme | Définition | Ancrage code |
|---|---|---|
| **Profil Maître** (`ProfileData`) | Source de vérité des données carrière d'un utilisateur, stockée en JSONB | `user_profiles.profile_data`, `backend/app/schemas/profile.py` |
| **CareerPass** | Droit d'accès temporel à la génération, acheté via Stripe | `career_passes`, `check_career_pass_or_admin()` |
| **Offre** / **Analyse d'offre** (`AnalysisResult`) | Texte d'une offre d'emploi et son extraction structurée (hard/soft skills, séniorité, responsabilités, ton) | agent `analyseur-offre` |
| **CV Généré** (`GeneratedCVData`) | CV optimisé pour une offre : résumé réécrit, expériences sélectionnées, compétences priorisées | `generated_cvs.cv_data_json`, agent `redacteur-cv` |
| **Import / Brouillon** | Extraction d'un CV/LinkedIn PDF en brouillon de profil, jamais persisté sans relecture | agent `parser-pdf` (`/extract-profile`), `import_jobs` |
| **Agent** | Microservice Cloud Run privé (auth IAM service-to-service) encapsulant un appel Vertex AI avec son prompt | `agents/{parser-pdf, analyseur-offre, redacteur-cv}` |
| **Skills hard/soft** | Structure canonique des compétences `{hard: string[], soft: string[]}`, unifiée via le contrat OpenAPI (fin du bug historique des 4 contrats divergents) | `contracts/openapi.yaml` → types générés back + front |
| **Evals** | Harnais de test qualité des prompts (profil × offre → CV) avec juge LLM | `backend/evals/` |

## 6. Parcours utilisateur cible (Écrans)

0. **Landing** publique → 1. **Onboarding** import CV/LinkedIn PDF (ou saisie manuelle) →
2. **Profil** relecture/édition → 3. **Dashboard `/cvs`** hub des CV →
4. **Éditeur** + export PDF. Le paiement se présente **avant** la saisie de l'offre
(vérification du pass au clic sur « Générer ») ; interception 402 côté serveur en garde-fou.

## 7. Identité visuelle (actée et implémentée)

- Palette : primaire anthracite `#2D3748`, action vert menthe `#38A169` ; police **Inter** ;
  logo « T Architectural » (assets dans `frontend/public/logos/`).

## 8. Décisions tranchées (anciennes questions ouvertes)

1. **Modèle économique** : « Pass temporaire » retenu (pas de freemium). ✅
2. **Import** : CV PDF **et** export LinkedIn PDF livrés (l'agent `parser-pdf` gère les deux). ✅
3. **Export PDF** : rendu **côté client** retenu pour la V1. ✅
4. **Rôle admin** : promotion manuelle en base (aucun parcours utilisateur n'y mène — voulu). ✅
5. **Budget GCP** : ~10 €/mois d'infra fixe (scale-to-zero partout, backend max 1 instance,
   Cloud SQL `db-f1-micro` seul toujours-actif), alertes budget à 20 €. ✅

## 9. Chantiers ouverts (backlog V1.1)

- **ADR-GENAI-SDK** : migration vers le SDK `google-genai` (contrôle du « thinking »,
  accès aux modèles 3.x) — échéance : fin de vie des modèles 2.5 en octobre 2026.
- Système de feedback utilisateurs (remplacer les avis de la landing par du réel).
- Logs structurés JSON (aujourd'hui logging standard).
- Durcissement facultatif face au DDoS volumétrique (WAF/Cloud Armor) — différé tant
  que le trafic et le revenu ne le justifient pas.
