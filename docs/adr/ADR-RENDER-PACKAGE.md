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
- **M0-T14 (fait, durci en revue)** : build CSS autonome — `npm run build:css`
  (Tailwind v4 CLI **épinglé 4.3.3 exact** : le script dépend de la forme
  d'émission ; montées de version délibérées), entrée `src/styles/cv.css` avec
  `source(none)` + `@source` sur `src/` seul, **tests exclus du scan**
  (`@source not`) → `dist/cv.css` (non versionné — CI/M2 doivent exécuter
  `build:css` avant tout consommateur). Les variables moteur émises sur
  `:root, :host` sont re-scopées sur `.cv-sheet, :host` par
  `scripts/build-css.mjs`, sur la **forme exacte** `:root, :host` uniquement —
  tout `:root` sous une autre forme fait échouer le build (garde significative,
  pas un remplacement aveugle). L'artefact ne contient AUCUNE règle `:root` ;
  le **preflight** (resets `*`, `html`…) reste global sous `@layer` : artefact
  réservé à un document DÉDIÉ possédé par le package (`setContent`), jamais
  injecté dans un hôte quelconque (thème : `--cv-*` inline, ADR-THEME-DECOUPLED).
  Test : sélecteur **borné** (pas de faux positif préfixe) de chaque classe
  posée par chaque template du registre (`TEMPLATE_IDS`) sur les 3 fixtures,
  contrôles positif/négatif du détecteur, garde anti-charte app.
- **M0-T16 (fait, durci en revue)** : polices curatées OFL embarquées. Source :
  packages `@fontsource/*` **épinglés exacts** (provenance versionnée, intégrité
  sha512 du lockfile — pas de binaires vendorés en git), en **devDependencies**
  du package (arbitrage revue T16, moindre privilège : les polices ne servent
  qu'au BUILD du CSS ; l'export-service exécutera `build:css` dans son propre
  build Docker, comme le frontend). Le manifeste `scripts/fonts.manifest.json`
  — **validé strictement au chargement** (familles `[A-Za-z0-9 ]`, slugs
  `[a-z0-9-]`, graisses entières 100-900 : anti-injection CSS/traversal) —
  couvre **exactement** la liste blanche du contrat (`CVFontFamily` ↔
  `CV_FONT_FAMILIES`, testé) : 8 familles × (400, 600, 700 + italique 400),
  sous-ensemble **latin** seul (couvre FR/EN, œ compris ; glyphe hors latin →
  pile de secours). `build:css` **purge puis** copie les woff2 (+ LICENSE OFL
  par fonderie, une par famille, testé) dans `dist/fonts/` (jamais de fichier
  fantôme d'un build précédent) et concatène les `@font-face` LOCAUX à
  `dist/cv.css` (`url('fonts/…')` relatifs — `fonts/` doit rester VOISIN de
  cv.css —, `font-display: block`, cohérent avec `fonts.ready` de M0-T15).
  Critères testés : allowlist == fichiers présents dans les DEUX sens (comptage
  exact des règles, signature WOFF2 des fichiers) ; hors commentaires, aucun
  vecteur de chargement autre que `url('fonts/*.woff2') format('woff2')` —
  pas d'`@import`, `image-set()`, `local()`, `http(s):` (preuve par mutation :
  URL CDN ⇒ tests rouges). **Contrat de consommation M2 (à honorer en
  M2-T04/T05)** : un document `setContent` est en `about:blank` — les `url()`
  relatives n'y résolvent PAS ; l'export-service doit servir `dist/`
  (interception `page.route`, base `file://` ou inline base64), vérifier
  `document.fonts.check('12px "<famille>"')` après `fonts.ready` (une famille
  manquante retombe en silence sur la police système), et bloquer tout réseau
  Chromium. Sans cela, « aperçu = PDF » n'est pas démontré pour les polices.
  La recette VISUELLE des choix typographiques reste F-08 (PAH-M0).
- **M0-T15 (fait, durci en revue)** : auto-fit isolé dans `src/fit.ts` —
  `computeFitScale` (fonction pure : plafond 1, plancher `MIN_SCALE`, neutre sur
  toute mesure non exploitable), consommée par `CVRenderer`. Signal de rendu
  stable `window.__CV_READY__` posé **après** `fonts.ready` **et après** le
  re-fit aux métriques finales des polices (jamais avant le commit DOM de
  l'ajustement) ; `whenFontsReady` ne rejette jamais ET est bornée par
  `FONTS_READY_TIMEOUT_MS` (5 s : une police qui pend ne suspend pas un export ;
  M2 garde SES timeouts `waitForFunction` + job). Cycle de vie : signal **retiré**
  au démontage et au changement de `cv`, re-posé à la fin du nouveau cycle —
  jamais de signal périmé ; `fit()` sous `finally` (un fit qui lève signale quand
  même). CONTRAT : une seule instance de CVRenderer par document d'export (page
  Chromium neuve par export). `CV_READY_FLAG` exporté : point d'attente M2.
  **Limites connues (assumées, à traiter en M2)** : un re-fit ResizeObserver
  postérieur au signal n'est pas re-signalé ; le signal n'attend pas les images
  (aucune aujourd'hui) ; sous `MIN_SCALE` le contenu est tronqué sans indicateur
  (`__CV_OVERFLOW__` à envisager) ; un crash de rendu ne produit aucun signal —
  la défense principale est la validation du contenu à l'entrée de
  l'export-service (M2-T16), un error boundary `__CV_ERROR__` à envisager en
  M2-T04. La contradiction R1 (auto-fit JS vs « JS désactivé »,
  ADR-RENDER-SECURITY) reste à trancher au spike M2-T05.
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
- **M0-T08b (fait)** : le renderer consomme le **schéma canonique `GeneratedCVData`**
  (prop `cv`) — zéro transformation dans le package, condition de l'injection directe
  par l'export-service (M2) et de « aperçu = PDF » : la page print injecte le
  canonique stocké tel quel (depuis PAH-M0 : passthrough strict de `getCV`, canonicité
  garantie en base — le pont `toCanonicalCVData` a été supprimé ; `ensureCVShape`
  reste la défense au chargement). `end_date` null ⇒ « aujourd'hui » ; compétences par expérience rendues ;
  section Langues retirée (hors canonique) ; `optimization_notes` jamais rendu (BLK-5,
  testé). **Dette T08 soldée** : les tests de rendu vivent désormais **dans le package**
  (`src/__tests__/`, fixtures canoniques partagées `fixtures/cv-reference/` importées en
  relatif — source unique, celle du futur contrat visuel M2).
- **M0-T08c (fait)** : l'**éditeur** travaille lui aussi en canonique (état =
  `GeneratedCVData`, envoyé tel quel au `PUT /cv` ; son aperçu rend exactement le
  payload du save) — `profileToGeneratedCV`/`normalizeCVData`/`toCanonicalCVData` ont été
  **supprimés à PAH-M0 (2026-10-22)** avec le backfill v2 des CV V1 (canonicité
  garantie en base). Le package a
  sa **config eslint** (`eslint.config.mjs`, même socle que le frontend, script `lint`) :
  gates du package = eslint + tsc strict + jest — **en local** ; le branchement CI de
  ces gates reste à faire (revue T08c, S7 — tracé roadmap).
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
