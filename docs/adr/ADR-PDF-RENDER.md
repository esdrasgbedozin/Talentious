# ADR-PDF-RENDER — Service d'export PDF dédié, déterministe et épinglé

- **Statut** : Accepté (2026-10-24)
- **Décideur** : fondateur (architecture V2 §rendu PDF serveur ; roadmap M2 —
  tickets M2-T01/T02, complété au fil de la phase A)
- **Contexte technique** : `export-service/` (workspace npm, Fastify, M2-T01),
  `packages/cv-render` (ADR-RENDER-PACKAGE), contrat `POST /cv/{id}/export`
  (`contracts/openapi.yaml`), Cloud Run GCP europe-west9.

## Contexte

La V2 vend un PDF fidèle à l'aperçu (« aperçu = PDF », promesse produit) et
reproductible (le même document rend le même PDF, D6). La V1 n'a pas de rendu
serveur : `window.print()` côté client, dépendant du navigateur de
l'utilisateur — ni déterministe, ni stylable, ni archivable. Le rendu serveur
exige un Chromium headless : lourd (CPU/RAM), à surface d'attaque réelle
(contenu utilisateur rendu), incompatible avec l'instance backend unique
(`max_instances=1`, ADR-JOBS).

## Décisions

1. **Un 6e service Cloud Run dédié `export-service`**, privé (invoker =
   backend-SA seul, OIDC), Node + TypeScript + Fastify, consommant
   `@talentious/cv-render` en source (workspace npm) — le MÊME code de rendu
   que l'aperçu Next. Le calcul lourd est déporté hors du backend.

2. **Option B — payload injecté, aucune navigation.** Le backend POSTe
   `{cv_content, template_id, theme, lang}` ; le service fait le SSR du
   package puis `page.setContent(html)`. Chromium ne navigue JAMAIS vers une
   URL applicative : pas d'authentification à transporter dans le navigateur,
   pas de dépendance au frontend déployé, et le réseau sortant peut être
   intégralement bloqué (M2-T08).

3. **Image officielle Playwright ÉPINGLÉE tag + digest** (revue T02 : un tag
   est mutable — republication possible sans changement visible ; le digest de
   la manifest LIST, multi-arch, fige réellement l'approvisionnement), et
   **invariant : le tag de l'image == la version npm `playwright-core`**
   (1.64.1, épinglée sans `^`).
   Le protocole CDP n'est garanti qu'à versions identiques lib/Chromium.
   Toute montée de version change les deux dans le même commit
   (Dependabot + rebuild mensuel : M2-T23). Le déterminisme du rendu repose
   sur ce Chromium figé + les polices embarquées par le package (M0-T14).

4. **Multi-stage en contexte racine cloisonné, runtime non-root.** Build
   `node:24-slim` épinglé par digest (revue T02 : Node 20 EOL avril 2026, et
   build/runtime alignés sur la même majeure que le Node de l'image
   Playwright ; `engines >=24`) ; npm ci du workspace seul,
   `--ignore-scripts`, tsc → `dist/` ; runtime = image Playwright,
   `USER pwuser` (uid 1001), seuls `node_modules` de prod et `dist/` copiés.
   Le contexte de build est une LISTE BLANCHE dédiée
   (`Dockerfile.dockerignore`, modèle du frontend) : le démon ne voit que les
   manifestes racine et `export-service/` — jamais backend, docs, contrats ni
   fichiers sensibles non cités par la liste noire racine. Le sandbox
   Chromium sous non-root est traité à M2-T09.

5. **Arbitrage taille assumé** : l'image pèse ~3,5 Go (les trois navigateurs
   de l'image officielle). Une image maison chromium-only pèserait ~1,5 Go
   mais déplacerait sur nous la maintenance sécurité du navigateur (la vraie
   charge, R4). Service `min_instances=0` : le cold start (~4-8 s) est masqué
   par le job asynchrone ; la taille ne coûte que du stockage Artifact
   Registry. À re-trancher seulement si le cold start devient un problème
   mesuré.

## Alternatives écartées

- **WeasyPrint (Python, backend)** : pas de WYSIWYG — moteur CSS distinct de
  l'aperçu, « aperçu = PDF » impossible par construction.
- **Playwright dans le backend** : Chromium dans l'instance unique
  `max_instances=1` = famine mémoire/CPU sur le chemin API critique.
- **`window.print()` (statu quo V1)** : non déterministe (navigateur du
  client), aucune maîtrise typographique, pas d'archivage serveur. Retiré à
  M2-T27 après bascule complète.
- **Navigation vers la route print (Option A)** : transport d'auth dans
  Chromium, dépendance au frontend déployé, réseau sortant impossible à
  fermer ; écartée par l'architecture V2.
- **Image maison chromium-only** : plus légère mais maintenance sécurité du
  navigateur à notre charge (cf. décision 5).
