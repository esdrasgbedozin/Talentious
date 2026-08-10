# Talentious

**Talentious** est une application SaaS conçue pour aider les professionnels à créer des CV percutants et sur mesure en utilisant la puissance de l'intelligence artificielle. En analysant une offre d'emploi et le profil d'un utilisateur, Talentious génère un CV optimisé qui met en valeur les compétences et expériences les plus pertinentes pour le poste visé.

> **En production** : https://talentious.app (API `api.talentious.app`), région GCP `europe-west9` (Paris).
> Régime de bêta gratuite (paiement Stripe en mode test).

## Stack Technique

- **Frontend** : Next.js (TypeScript) & Tailwind CSS
- **Backend** : FastAPI (Python)
- **Base de données** : PostgreSQL (Cloud SQL)
- **IA** : Google Vertex AI (`gemini-2.5-pro`), 3 agents privés (import PDF, analyse d'offre, rédaction)
- **Infrastructure** : Google Cloud Platform (5 services Cloud Run, Cloud SQL, Cloud Storage), IaC Terraform
- **CI/CD** : GitHub Actions (déploiement sur `main` via Workload Identity Federation)
- **Contrats** : Contract-First (OpenAPI source de vérité, types générés back + front, dérive bloquée en CI)

Ce projet est structuré en monorepo avec des services distincts pour le frontend, le backend et les agents IA.

## Fonctionnalités (live)

Inscription (email vérifié + Sign in with Google), profil, **import CV/LinkedIn PDF par IA**
(asynchrone, relecture humaine), **génération de CV asynchrone** ciblée offre, éditeur, export PDF,
paiement Stripe (Checkout + webhook), vue admin, suppression de compte RGPD, emails transactionnels.
