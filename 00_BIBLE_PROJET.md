# 00 — BIBLE DU PROJET « TALENTIOUS » (reconstruite par rétro-ingénierie)

> **Statut** : document reconstruit le 2026-07-08 à partir du code réel du dépôt
> `esdrasgbedozin/Talentious` (branche `main`, commit `743eac1`, dernier push 2026-06-28)
> et des documents historiques `PROJECT_CONTEXT.md` / `ROADMAP.md`.
> Les points non vérifiables dans le code sont marqués **[à confirmer]**.

---

## 1. Vision & problème

- **Produit** : plateforme SaaS B2C de génération de CV assistée par IA.
- **Problème adressé** : adapter un CV à chaque offre d'emploi est long et mal fait ;
  la valeur est dans le **rewriting sémantique** (sélection des expériences pertinentes,
  verbes d'action, alignement avec les mots-clés de l'offre), pas dans la mise en page.
- **Cible** : chercheurs d'emploi exigeants en Europe, focus France (produit 100 % en français).
- **Contrainte souveraineté** : toutes les données et tous les traitements IA confinés à
  la région GCP `europe-west9` (Paris) — exigence RGPD explicite et déjà appliquée dans le code
  (Vertex AI initialisé sur `europe-west9`, modèle `gemini-2.5-flash`).

## 2. Modèle économique

- **« Pass d'Accès Temporaire »** : paiement unique Stripe → accès illimité pendant une durée
  fixe (`PASS_30_DAYS`, `PASS_90_DAYS` — enum déjà en base). Pas d'abonnement récurrent.
- Rôle `admin` : accès « sudo » sans paiement (bypass du CareerPass, implémenté dans `cv.py`).
- **État réel** : la table `career_passes` et la vérification 402 existent ; **l'intégration
  Stripe n'est pas commencée** (placeholders dans `config.py`, aucune route de paiement).

## 3. Personas

| Persona | Besoin | Parcours |
|---|---|---|
| **Le candidat pressé** | Un CV adapté à une offre en < 5 min | Import PDF → génération → export PDF |
| **Le candidat méticuleux** | Contrôler chaque ligne du CV généré | Profil manuel → génération → éditeur WYSIWYG |
| **L'admin (fondateur)** | Tester/dépanner sans payer | Rôle `admin`, bypass paiement |

## 4. Périmètre V1 (constaté vs visé)

| Capacité | Visé (MVP) | État réel du code |
|---|---|---|
| Inscription / connexion / JWT | ✅ | ✅ Fait et testé (12 tests) |
| Profil maître (JSONB) + CRUD | ✅ | ✅ Fait et testé (9 tests) |
| Import PDF du profil (CV / LinkedIn) | ✅ « indispensable » | ❌ **Absent** : `parser_client.py` existe côté backend mais **aucune route ne l'utilise** ; l'upload du frontend (`/onboarding`) est une simulation |
| Analyse d'offre (agent IA) | ✅ | ✅ Service `analyseur-offre` fonctionnel (Gemini 2.5 Flash) |
| Génération de CV (agent IA) | ✅ | ⚠️ Service `redacteur-cv` existe mais le pipeline est **cassé en production** (voir ONBOARDING.md §3) |
| Dashboard « Mes CV » | ✅ | ❌ Absent (aucune page `/dashboard`) |
| Éditeur WYSIWYG | ✅ | ❌ Absent |
| Template CV + export PDF | ✅ (1 template) | ❌ Absent (`template_id="modern_v1"` codé en dur, jamais rendu) |
| Paiement Stripe | ✅ | ❌ Absent |
| Suppression de compte (RGPD) | ✅ | ❌ Absent |
| Hors MVP (v1.1+) | Lettre de motivation, multi-templates, suivi de candidatures, chat de complétion | — |

## 5. Ubiquitous Language (inféré du code)

| Terme | Définition | Ancrage code |
|---|---|---|
| **Profil Maître** (`ProfileData`) | Source de vérité des données carrière d'un utilisateur, stockée en JSONB | `user_profiles.profile_data`, `backend/app/schemas/profile.py` |
| **CareerPass** | Droit d'accès temporel à la génération, acheté via Stripe | `career_passes`, `check_career_pass_or_admin()` |
| **Offre** / **Analyse d'offre** (`AnalysisResult`) | Texte d'une offre d'emploi et son extraction structurée (hard/soft skills, séniorité, responsabilités, ton) | agent `analyseur-offre` |
| **CV Généré** (`GeneratedCVData`) | CV optimisé pour une offre : résumé réécrit, expériences sélectionnées, compétences priorisées | `generated_cvs.cv_data_json`, agent `redacteur-cv` |
| **Agent** | Microservice FastAPI privé encapsulant un appel Vertex AI avec son prompt | `agents/{parser-pdf, analyseur-offre, redacteur-cv}` |
| **Skills hard/soft** | Structure UI des compétences `{hard: string[], soft: string[]}` — ≠ structure agents `[{name, level, category}]` (source du bug historique #1) | `schemas/profile.py` vs `agents/*/models.py` |
| **Evals** | Harnais de test qualité des prompts (profil × offre → CV, résultats JSON) | `backend/evals/run_evals.py` |

## 6. Parcours utilisateur cible (Écrans)

0. **Landing** publique (✅ fait) → 1. **Onboarding** import PDF (⚠️ UI seule) →
2. **Profil** vérification/édition (✅ fait) → 3. **Dashboard** hub des CV (❌) →
4. **Éditeur** WYSIWYG + export PDF (❌). Paiement en interception 402 (❌).

## 7. Identité visuelle (actée et implémentée)

- Palette : primaire anthracite `#2D3748`, action vert menthe `#38A169` ; police **Inter** ;
  logo « T Architectural » (assets présents dans `frontend/public/logos/`).

## 8. Questions ouvertes (pour l'humain)

1. Le modèle « Pass temporaire » (vs freemium 1 CV gratuit) est-il toujours le choix retenu ?
2. L'import LinkedIn PDF est-il toujours « indispensable » pour la V1, ou l'import CV PDF suffit-il ?
3. L'export PDF doit-il être côté client (rapide, qualité moyenne) ou serveur WeasyPrint + GCS (visé « ultra-pro ») ?
4. Le rôle admin doit-il être créé par seed/migration ? (aucun mécanisme de promotion admin dans le code)
5. Budget GCP mensuel cible pour staging + prod ? (dimensionne Cloud Run min-instances vs cold starts de 2-5 min de génération)
