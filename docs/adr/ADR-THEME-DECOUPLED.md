# ADR-THEME-DECOUPLED — Thème CV découplé des tokens globaux de l'application

- **Statut** : Accepté (2026-10-21)
- **Décideur** : fondateur (roadmap V2, M0 piste rendu — tickets M0-T09/T10)
- **Contexte technique** : `packages/cv-render` (ADR-RENDER-PACKAGE), contrat
  `CVTheme`/`CVThemeTokens`/`CVFontFamily`/`HexColor` (`contracts/openapi.yaml`
  v1.1.0), export-service Chromium à venir (M2, ADR-RENDER-SECURITY), registre
  de templates (M0-T11/T12).

## Contexte

En V1, `CVRenderer` stylait le CV avec les classes Tailwind de la **charte de
l'application** (`text-action`, `text-text-primary`, `border-border`,
`bg-action/10`…). Conséquences :

1. **Le document est couplé à l'interface.** Changer la charte de l'app change
   rétroactivement l'apparence des CV des utilisateurs — l'inverse de la
   promesse produit (un document figé, choisi par son auteur).
2. **Le rendu serveur est impossible à l'identique.** L'export-service (M2)
   n'embarque pas la config Tailwind de l'app : les mêmes classes n'y résolvent
   rien. « Aperçu = PDF » exige des styles autoportés par le package.
3. **Pas de thèmes / templates.** La V2 vend le choix du thème (couleurs,
   polices — décision D2, premium au-delà du preset gratuit) et du template.
   Impossible tant que les couleurs sont câblées sur la charte globale.

Le contrat V2 a déjà tranché la forme des données : le thème est un snapshot
`CVThemeTokens` **embarqué dans le document** (jamais une référence mutable),
validé strictement côté serveur (couleurs `#RRGGBB`, polices dans l'enum
`CVFontFamily`, contraste vérifié).

## Décisions

1. **Le rendu du CV ne lit QUE des variables CSS CV-scopées `--cv-*`.** Six
   variables, dérivées 1:1 du contrat : `--cv-accent`, `--cv-text`,
   `--cv-muted`, `--cv-background`, `--cv-font-heading`, `--cv-font-body`.
   Les tokens globaux de l'app (`text-action`, `text-text-primary`,
   `border-border`, `bg-white`…) sont **interdits** dans `packages/cv-render`.

2. **`themeToCssVars(tokens?) → Record<'--cv-…', string>`**
   (`packages/cv-render/src/theme.ts`) est l'unique point de conversion
   thème → CSS, exporté par le package et utilisé tel quel par l'aperçu Next
   et par l'export-service (même pipeline, invariant « aperçu = PDF »).

3. **Defense in depth anti-injection CSS.** Le serveur valide les thèmes à
   l'enregistrement, mais le package alimentera Chromium : `themeToCssVars`
   re-valide chaque valeur (`#RRGGBB` strict, police dans la liste blanche du
   contrat — `satisfies` garantit l'alignement sur l'enum généré) et remplace
   toute valeur non conforme par le défaut. Aucune chaîne non validée n'est
   interpolée en CSS. Testé avec des charges hostiles
   (`expression(…)`, `url(//evil)`, piles de polices forgées).

4. **Thème par défaut : anthracite quasi-monochrome (D2).**
   `DEFAULT_CV_THEME_TOKENS` = accent `#2D3748`, texte `#1A202C`, atténué
   `#4A5568`, fond `#FFFFFF`, polices `Inter`. Appliqué quand le document n'a
   pas (encore) de thème — dont tous les CV existants.

5. **Le découplage est gardé par des tests, pas par une convention.**
   `src/__tests__/theme-decoupling.test.tsx` : (a) grep des tokens interdits
   sur les sources du package ; (b) rendu dont les titres de section suivent
   `var(--cv-accent)` sans fuite de classes app. Écrits **rouges** en M0-T09
   (`it.failing` : la suite est verte parce que le couplage est confirmé),
   basculés en `it` par la migration M0-T10 — ils deviennent alors le garde-fou
   permanent du package.

## Conséquences

- M0-T10 migre `CVRenderer` vers `var(--cv-*)` et met à jour les snapshots.
  **Règle arbitrée (revue T09)** : toute propriété THÉMABLE (couleurs, polices)
  est posée en **style inline** `var(--cv-*)` — vérifiable en jsdom, identique
  dans Chromium, indépendante de tout build CSS ; la mise en page (espacement,
  flex, tailles) reste en classes utilitaires, que M0-T14 (build CSS du
  package) compile sans toucher au thème. Le test de découplage (b) exige donc
  le style inline sur les éléments thémés : c'est la règle, pas une contrainte
  accidentelle.
- L'export-service (M2) pose `themeToCssVars(document.theme.tokens)` sur la
  racine du rendu — aucune autre source de style ; les polices de la liste
  blanche sont embarquées dans son image (déterminisme, résidence UE).
- Le registre de templates (M0-T11/T12) choisit la STRUCTURE ; le thème reste
  orthogonal (couleurs/polices par-dessus n'importe quel template).
- Les variables sont posées sur la racine du CV (pas `:root`) : plusieurs CV
  avec des thèmes différents peuvent coexister dans une même page (galerie).
- Un thème stocké corrompu dégrade vers le défaut anthracite au rendu (jamais
  d'échec ni d'injection) ; le serveur reste le point de rejet (422).
- **M1-T04 (2026-10-23) : registre serveur `cv_themes`.** La migration
  `d9e0f1a2b3c4` crée la table des presets système (seed `anthracite`
  gratuit, tokens IDENTIQUES à `DEFAULT_CV_THEME_TOKENS` — alignement testé,
  toute dérive d'une des deux sources casse la suite) et pose la FK
  `cv_templates.default_theme_id → cv_themes.id` en RESTRICT. Les documents
  n'y font JAMAIS référence (le snapshot reste la règle) : seule la valeur
  par défaut d'un template pointe vers un preset. Les presets sont immuables
  et gérés par migrations — modifier un preset existant altérerait le sens de
  `CVTheme.id` sur les documents qui le citent à titre informatif ; on AJOUTE
  un preset, on n'en modifie pas.

## Alternatives écartées

- **Réutiliser la config Tailwind de l'app dans le package** : recouple le
  document à l'interface et n'existe pas côté export-service.
- **Thème par référence (`theme_id` résolu au rendu)** : un preset qui évolue
  altérerait des documents existants ; le contrat impose le snapshot.
- **Interpoler les tokens serveur sans re-validation** (« le serveur a déjà
  validé ») : laisse la porte ouverte à une injection CSS vers Chromium via
  une écriture directe en base ou un bug de validation ; re-validation locale
  à coût nul.
