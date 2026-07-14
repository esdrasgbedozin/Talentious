# PRODUCT.md — Talentious

## Produit
SaaS français de **génération de CV par IA**. L'utilisateur remplit un « profil maître »
unique (expériences, formations, compétences, projets, certifications), colle une offre
d'emploi, et l'IA (Vertex AI / Gemini) génère un CV **taillé pour cette offre** en une
minute. Il peut ensuite l'éditer et l'exporter en PDF.

## Cible
Candidats francophones — du junior au senior — qui postulent à plusieurs offres et
veulent un CV adapté à chaque poste sans y passer des heures. Vocabulaire : Profil maître,
Pass (accès), génération, CV.

## Proposition de valeur
« De ton expérience brute à un CV qui te ressemble, adapté à chaque opportunité, en une
minute. » Différenciateurs : adaptation réelle à l'offre, souveraineté des données
(hébergement France / RGPD), qualité de rédaction (modèles Pro).

## Register
**brand** pour la landing publique (`/`) — la page EST le produit vis-à-vis du visiteur.
Le reste (dashboard, éditeur, profil) est **product**.

## Identité de marque (déjà committée — à préserver)
- **Accent / énergie** : vert action `--action #38A169` (et hover `#2F855A`).
- **Primaire / structure** : `--primary #2D3748` (anthracite bleuté), texte `#1A202C`.
- **Fond** : clair `#FFFFFF` / `--background-light #F7FAFC`. Bordures `#E2E8F0`.
- **Typo** : Inter (déjà en place — identité, on la garde ; contraste par le poids/la taille).
- Tokens définis dans `frontend/src/app/globals.css` (`bg-action`, `text-primary`, etc.).
- Logo : `public/logos/logo-mark.svg`.

## Stack
Next.js 16 (App Router) + React 19 + Tailwind v4 + TypeScript. lucide-react pour les icônes.

## Contraintes
Responsive (mobile inclus), performant, accessible (WCAG, reduced-motion), fidèle aux
tokens de marque. La landing ne doit pas casser les CTA vers `/register` et `/login`.
