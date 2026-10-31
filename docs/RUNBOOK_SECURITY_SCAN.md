# Runbook — Scan de sécurité des images & dépendances (M2-T23)

## Gate Trivy

- **Où** : `scripts/ci/trivy-scan.sh`, appelé par `ci-build.yml` (PR + cron mensuel)
  et par `deploy-prod.yml` **avant `docker push`**.
- **Portée actuelle** : image **export-service** (plus large surface CVE, base
  Chromium). Les 5 autres images (backend, frontend, 3 agents) ne sont pas encore
  sous gate → **suivi M2-T30**.
- **Politique** : deux passes.
  - _Informative_ (non bloquante) : `HIGH,CRITICAL` → résumé du run.
  - _Gate bloquant_ : `CRITICAL` **corrigeable** (`--ignore-unfixed`). Une CRITICAL
    sans correctif amont ne bloque pas indéfiniment les déploiements.
- **Fail-closed** : toute erreur de l'outil (DB de vulnérabilités indisponible,
  rate-limit GHCR…) sort ≠ 0 et **bloque le push**. C'est voulu. **Ne jamais**
  neutraliser par `|| true` / `continue-on-error`. En cas de panne GHCR
  persistante : relancer le run ; option future = miroir `--db-repository` ECR.
- **Scanner épinglé par digest** (`aquasec/trivy:0.58.1@sha256:ab70…`). On
  n'utilise **pas** l'action `trivy-action` (incident supply-chain 2026-03).
- **Pas de socket docker ni de montage du dépôt** dans le conteneur Trivy :
  l'image est exportée en tar (`docker save`) puis scannée via `--input` (évite
  l'escalade et l'exposition des identifiants WIF du job de déploiement).

### Exceptions Trivy

Pour tolérer sciemment une CRITICAL précise : ajouter `CVE-XXXX-YYYYY` à
`.trivyignore` **avec** un commentaire (date, raison, échéance de revue).

## Bump Playwright coordonné (lockstep obligatoire)

L'invariant `export-service/src/__tests__/pinning.test.ts` exige :

```
playwright-core (npm, version exacte)  ==  tag image mcr.microsoft.com/playwright
```

Dependabot **ignore** volontairement les deux (une PR isolée casserait l'invariant
et la CI). Les CVE de Chromium lui-même vivent dans le binaire du navigateur
(`/ms-playwright`), que Trivy ne voit pas comme paquet OS : **seul ce bump les
corrige**. Procédure (mensuelle, ou dès une CVE Chromium critique annoncée) :

1. Choisir la version Playwright cible `vX.Y.Z` (releases GitHub `microsoft/playwright`).
2. `export-service/package.json` → `playwright-core: "X.Y.Z"` (exacte, sans `^`/`~`).
3. `export-service/Dockerfile.prod` → `FROM mcr.microsoft.com/playwright:vX.Y.Z-noble@sha256:<digest>`
   (récupérer le digest multi-arch : `docker buildx imagetools inspect mcr.microsoft.com/playwright:vX.Y.Z-noble`).
4. `npm install` (met à jour le lockfile racine), relancer la suite export-service
   (dont `pinning.test.ts` et les baselines visuelles).
5. Commit unique, revue, merge. Le rebuild mensuel (`ci-build.yml`) rescanne.

## Dérive CVE des bases

Les bases sont épinglées par digest : un simple rebuild ne les met pas à jour.
Le cron mensuel **détecte** la dérive (scan) mais ne l'**applique** pas — la MAJ
passe par Dependabot (bases docker) ou par le bump Playwright ci-dessus. Échec du
cron : GitHub notifie l'auteur du workflow par e-mail.
