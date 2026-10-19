# ADR-RENDER-PACKAGE — Package de rendu CV partagé et workspaces npm

- **Statut** : Accepté (2026-10-19)
- **Décideur** : fondateur (point d'arrêt humain — V2, roadmap M0-T06 puis M0-T07)
- **Contexte technique** : nouveau `packages/cv-render` (`@talentious/cv-render`),
  `package.json` racine (workspaces npm), `frontend/next.config.ts`
  (`transpilePackages`), `frontend/src/components/cv/CVRenderer.tsx` (à extraire en
  M0-T08). Prépare le rendu HTML serveur V2 (export-service) — voir ADR-PDF-RENDER,
  ADR-RENDER-SECURITY, ADR-THEME-DECOUPLED, ADR-TEMPLATE-REGISTRY.

## Contexte

En V1, le rendu du CV vit **uniquement** dans le frontend
(`frontend/src/components/cv/CVRenderer.tsx`), couplé aux tokens globaux de l'app. La
V2 introduit un **rendu HTML côté serveur** (export-service, Chromium headless, Option
B) qui doit produire **exactement le même document** que l'aperçu React — c'est
l'invariant Bible « aperçu = PDF » (§1.4). Deux renderers séparés (un pour l'aperçu, un
pour le PDF) casseraient cet invariant à la première divergence.

Le monorepo n'a **aucun workspace npm à la racine** aujourd'hui : `frontend/` est un
projet npm autonome, buildé en prod via `context: frontend`. Pour partager un seul arbre
de rendu entre l'aperçu Next et l'export-service, il faut un **package partagé** et un
mécanisme de partage de code côté npm.

M0-T06 pose l'**échafaudage seul** : structure, outillage, point d'entrée ; il ne déplace
pas encore `CVRenderer` (M0-T08). **M0-T07** (décrit dans les Conséquences, désormais fait)
bascule ensuite le build Docker/CI de prod vers le contexte racine (risque R5). Cet ADR
couvre les deux : la décision du package partagé et son intégration au build.

## Décisions

1. **Un package partagé unique `@talentious/cv-render`** (`packages/cv-render`) est la
   source **unique** du rendu CV : `CVRenderer` + templates + logique de thème, consommé
   à l'identique par l'aperçu Next (`transpilePackages`) et par l'export-service
   (`setContent`). C'est le seul moyen de garantir « aperçu = PDF ».

2. **Workspaces npm à la racine** (`package.json` racine, `workspaces: ["frontend",
   "packages/*"]`). Le backend FastAPI et les agents Python restent **hors** de ces
   workspaces (déployables distincts, chaîne d'outillage Python). Le partage se fait
   **en source** (pas d'étape de build compilé du package) : Next transpile le package
   via `transpilePackages`, et l'export-service le consommera de même en M2.

3. **Outillage autonome du package** : `ts-jest` + `jsdom` (cohérent avec le jest du
   frontend, prêt pour les composants React extraits en M0-T08), `tsconfig` strict,
   `react`/`react-dom` en **peerDependencies** (le package ne les embarque pas, il les
   reçoit de l'hôte). Critère de fin T06 : `tsc --noEmit` frontend vert + un test jest du
   package vert (TDD : rouge d'abord).

4. **Transition des lockfiles en deux temps (couture R5 assumée).** T06 crée le
   `package-lock.json` racine (lockfile des workspaces) **mais conserve
   `frontend/package-lock.json` intact**, afin que le build de prod existant
   (`context: frontend`, `npm ci` isolé) continue de fonctionner **sans changement**. Le
   `transpilePackages` ajouté reste **inutilisé** par le frontend en T06 (aucun import du
   package avant l'extraction M0-T08) : `next build` prod reste vert, image inchangée. Le
   basculement réel (contexte Docker racine, `Dockerfile.prod`, matrice `deploy-prod.yml`,
   suppression du lockfile frontend) est **M0-T07**, et **aucun déploiement n'a lieu en
   M0** (1er deploy = M2 phase B). La duplication transitoire des deux lockfiles est donc
   une couture délibérée, résorbée en T07.

## Conséquences

- Le rendu CV devient partageable entre aperçu et export sans duplication, condition
  nécessaire à « aperçu = PDF ».
- Entre T06 et T07, **deux `package-lock.json` coexistent** (racine + frontend). C'est
  volontaire et temporaire : ne pas déployer la prod sur le nouveau contexte avant T07.
- **M0-T07 (fait)** : couture résorbée. Le build prod du frontend passe en **contexte
  racine** (`context: .` dans `deploy-prod.yml`, `frontend/Dockerfile.prod` réécrit pour
  les workspaces : `npm ci` sur les manifestes + lockfile racine, `npm run build
  --workspace frontend`), avec `outputFileTracingRoot` fixé à la racine (sortie
  `standalone` → `frontend/server.js`) et un `.dockerignore` racine. `frontend/package-lock.json`
  est **supprimé** (lockfile unique racine). Le filtre `paths` du déploiement inclut
  désormais `packages/**` et les manifestes racine.
- **Nuance plateforme du lockfile** (binaires natifs lightningcss/swc/oxide de Tailwind v4
  + Next) : npm 11 n'inscrit les nœuds natifs **résolus** que pour la plateforme
  d'installation. Le `package-lock.json` racine est donc **généré sur linux/amd64** (parité
  CI + Cloud Run), ce qui garantit un `npm ci` reproductible dans l'image Docker. En
  local macOS, utiliser **`npm install`** (qui re-résout pour la plateforme courante), pas
  `npm ci` ; le dev conteneurisé (docker-compose) est de toute façon sous linux. Un
  `docker build` local sur Mac Apple Silicon résout en linux/**arm64** et peut échouer
  faute de binaires natifs correspondants : builder avec **`--platform linux/amd64`**
  (parité CI/prod). À reconsidérer si un lockfile multi-plateforme complet devient
  nécessaire.
- Le point d'entrée du package est un **placeholder typé** en T06 ; la surface réelle
  arrive aux tickets suivants : extraction `CVRenderer` sans changement de comportement
  (M0-T08), découplage du thème en tokens CV-scopés (M0-T09/T10), registre de templates
  (M0-T11), i18n (M0-T13), build CSS injectable (M0-T14), polices embarquées (M0-T16).
- **M0-T08 (fait)** : `CVRenderer` extrait dans le package (export nommé `CVRenderer`),
  **à comportement constant**. Preuve d'équivalence, du plus fort au plus faible : (a) la
  source extraite est **identique octet-à-octet** à l'ancien composant, à la seule ligne
  d'import de type près (`@/types/profile` → `./types`, même alias `ProfileData`) ; (b) des
  **snapshots HTML** (fixtures complet / minimal / dense) identiques avant/après ; (c) un
  test dédié du **fit-to-page** (stub `scrollHeight`) figeant l'émission du `transform:
  scale(<1)` — comportement que jsdom ne couvre pas via les snapshots (`scrollHeight=0`).
  Les pages `cv/[id]/print` et `cv/[id]/edit` l'importent depuis `@talentious/cv-render`.
  Le package est rendu **auto-suffisant** : il porte sa propre copie des types générés du
  contrat (`src/generated/`, cible `make generate-types-cv-render` câblée dans
  `generate-types`), condition de sa consommation par l'export-service (M2). Le garde-fou
  contract-first (`contracts-types.yml`) **couvre désormais cette copie** (régénération +
  `git diff --exit-code` sur `packages/cv-render/src/generated`), pour qu'elle ne puisse
  pas dériver du contrat sans faire échouer la CI. Le build **dev** du frontend passe en
  contexte racine (`frontend/Dockerfile`, `context: .`) ; un `frontend/Dockerfile.dockerignore`
  explicite protège ce contexte élargi contre les secrets (tfstate/.env) — BuildKit
  remplaçant le `.dockerignore` racine dès qu'un ignore spécifique au Dockerfile existe.
  Le renderer consomme encore `ProfileData` ; sa migration vers le schéma canonique
  `GeneratedCVData` est un ticket distinct (**M0-T08b**, changement de comportement) car
  `cv_data_json` est désormais stocké en `GeneratedCVData` (ADR-CONTENT-SCHEMA).
- **Dette tracée (revue M0-T08)** : les tests de rendu (`CVRenderer.snapshot.test.tsx` +
  fixtures) vivent encore **côté frontend** alors que le composant est dans le package ;
  quand l'export-service (M2) consommera le package, ils ne le suivront pas. À déplacer
  dans `packages/cv-render` (tests + fixtures en `ProfileData`) — rattaché à M0-T08b ou
  ticket dédié.
- L'invariant « aperçu = PDF » devient **testable** une fois l'export-service branché
  (M2) : baseline de non-régression visuelle sur les mêmes fixtures (M0-T01).

## Alternatives écartées

- **Renderer dupliqué (un pour l'aperçu, un pour le PDF)** : casse l'invariant « aperçu =
  PDF » à la première divergence ; dette garantie.
- **Rendu serveur par navigation vers la route `print` (`page.goto`)** : couple
  l'export-service au frontend déployé et à son auth ; écarté au profit de l'Option B
  (payload injecté, `setContent`) — voir ADR-PDF-RENDER.
- **Package compilé (build step + artefact `dist/`)** : surcoût d'outillage inutile tant
  que les deux consommateurs transpilent le TS/TSX en source ; à reconsidérer seulement
  si un consommateur ne peut pas transpiler.
- **Inclure backend/agents Python dans les workspaces** : npm workspaces ne gèrent pas
  Python ; déployables distincts ; hors périmètre.
