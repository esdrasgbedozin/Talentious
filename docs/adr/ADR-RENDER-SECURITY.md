# ADR-RENDER-SECURITY — Sécurité du rendu PDF (export-service)

**Statut : EN COURS** — commencé à M2-T04 (document + CSP + échappement),
décision 6 (JS désactivé + fit externe + polices data:) arbitrée par le spike
M2-T05. Sections à compléter : rendu Chromium (M2-T06), egress (M2-T08),
sandbox (M2-T09). Voir ADR-PDF-RENDER pour l'architecture du
service (Option B : `page.setContent`, aucune navigation).

## Contexte et modèle de menace

Le document rendu contient in fine du contenu FOURNI PAR L'UTILISATEUR
(CV généré par IA puis librement éditable), injecté dans un Chromium réel.
Menaces traitées ici : exécution de script dans le contexte de rendu (XSS →
SSRF métadonnées GCP, exfiltration), injection CSS, spoofing visuel du PDF
(bidi), fuite de données internes dans le document. La validation ajv (M2-T03)
borne types/champs/longueurs mais laisse passer, PAR CONSTRUCTION, du texte
libre hostile : tout ce qui suit suppose un contenu malveillant qui a PASSÉ la
validation.

## Décision 1 — Modèle d'échappement : contexte texte UNIQUEMENT

Le document est produit par SSR React (`renderToStaticMarkup`) du package
partagé `@talentious/cv-render` (même composant que l'aperçu Next —
« aperçu = PDF »). L'invariant de sécurité, PROUVÉ par tests côté service
(document.test.ts) et côté package :

- toute chaîne utilisateur n'est émise qu'en **contexte texte** React
  (échappement automatique `<`, `>`, `&`, `"`) ;
- **aucune** chaîne utilisateur n'atteint un attribut HTML : les attributs ne
  portent que le thème (validé `#RRGGBB` strict / enum de polices — contrat)
  et des classes statiques. DET-M0-AC1 (échappement du contexte attribut) est
  satisfait par ABSENCE de ce contexte, pas par un échappement supplémentaire.
  Preuve STRUCTURELLE (revue T04) : test « marqueur profond » — chaque chaîne
  du payload est marquée, aucune n'apparaît entre `<` et `>`, itéré sur TOUS
  les templates du registre ;
- exception cadrée : `lang` est le seul attribut du document interpolé hors
  React. Il vient de l'enum du contrat (`fr|en`) ET d'une garde runtime à
  liste blanche (`buildCvDocumentHtml` échoue sur toute autre valeur — même
  principe que la garde anti-`</style>`, jamais confiance au seul typage) ;
- **aucun lien** : zéro `<a>`/`href` dans tout le document, les URL du contenu
  (linkedin, projets, certifications) sont AFFICHÉES comme texte inerte.
  ⚠️ PRÉCONDITION GRAVÉE : toute future fonctionnalité « liens cliquables »
  (annotation de lien PDF comprise) DEVRA imposer une liste blanche de schémas
  (`https?:` seulement) avant de poser le moindre `href` — une URL
  `javascript:`/`data:`/`file:` passe la validation du contrat (revue sécu
  M2-T03, point 4).

## Décision 2 — CSP `default-src 'none'`, sans directive script-src

Chaque document embarque en `<meta http-equiv>` :
`default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`.

- `script-src 'none'` est EXPLICITE (revue T04) : le fallback `default-src`
  suffirait aujourd'hui, mais un futur élargissement de default-src (polices
  T05) ne doit jamais rouvrir les scripts. AUCUN script (inline ou distant)
  ne s'exécute, aucune ressource ne se charge. Défense en profondeur sous
  l'absence de navigation (Option B) et l'egress verrouillé (M2-T08).
- Limites assumées d'une CSP meta : pas de frame-ancestors/report-uri/sandbox,
  et CDP la contourne (page.evaluate) — ne JAMAIS passer `bypassCSP: true` au
  contexte Playwright (T06), tester qu'un `<script>` injecté ne s'exécute pas.
- `style-src 'unsafe-inline'` est le SEUL droit accordé, nécessaire et
  contrôlé : styles inline = variables du thème validées par pattern strict ;
  `<style>` embarqué = `dist/cv.css`, NOTRE artefact de build (M0-T14), jamais
  du contenu utilisateur — une garde refuse tout CSS contenant `</style>`
  (artefact suspect ⇒ échec, pas de réparation silencieuse).
- Élargissement ARBITRÉ (spike M2-T05, décision 6) : `font-src data:` seul,
  posé quand la feuille de polices data: arrive (M2-T16) — rien d'autre.

## Décision 3 — Normalisation amont (contrôles + bidi)

Avant rendu, toutes les chaînes du payload sont normalisées
(`render/sanitize.ts`) — aucun pattern du contrat n'exclut ces caractères des
champs libres, la neutralisation vit côté rendu, dernier point de passage
avant Chromium. Retirés (plages étendues en revue T04) : contrôles C0/C1
(sauf `\n`, `\t` ; `\r\n`, `\r`, U+2028/29 → `\n`) ; bidi
overrides/embeddings/isolats (U+202A–E, U+2066–69) ET marques U+200E/200F/
U+061C (spoofing visuel type « cv[U+202E]fdp.exe ») ; largeur nulle U+200B,
U+2060, U+FEFF, U+00AD, U+180E (bourrage invisible de mots-clés, ATS) ;
caractères Tag U+E0000–E007F (ASCII smuggling IA) ; sélecteurs de variation
U+E0100–E01EF ; non-caractères ; surrogates isolés (toWellFormed). CONSERVÉS
sciemment : ZWJ/ZWNJ (emojis, écritures composées) ; homoglyphes non résolus
(NFKC altérerait des noms légitimes — pas de normalisation Unicode).
Le code source de ces plages est écrit en échappements `\u` uniquement
(anti-Trojan Source) et `optimization_notes` est retiré du contenu AVANT tout
rendu, indépendamment du template (BLK-5).

## Décision 4 — Document neutre et déterministe

`<title>` fixe (« CV ») : aucune donnée du payload dans les métadonnées du
document (déterminisme M2-T07, zéro reflet). `optimization_notes` (sortie
interne d'agent, risque BLK-5) n'est JAMAIS rendu — prouvé par test sur le
document complet. Deux rendus du même payload produisent le même octet
(fonction pure, CSS en paramètre).

Côté PDF (M2-T07) : métadonnées NORMALISÉES via pdf-lib (épinglé 1.17.1
exact) — Title « CV », Creator/Producer « Talentious » seuls, dates FIXES
(époque 2000-01-01, assumée), /ID de trailer constant, flux XMP/Names/Outlines
retirés s'ils apparaissent (Chromium n'en émet pas aujourd'hui, vérifié),
`useObjectStreams:false` pour garder Info auditable en clair. Résultat mesuré :
deux rendus du même payload = MÊMES OCTETS (au-delà du critère rasters, R4
levée en pratique). RISQUE ASSUMÉ : pdf-lib n'est plus maintenu depuis 2022
(`npm audit --omit=dev` propre à ce jour, Dependabot M2-T23 surveillera) —
plan de repli si CVE : fork communautaire @cantoo/pdf-lib, ou réécriture
ciblée du seul dictionnaire Info (périmètre minuscule).

## Décision 5 — Build : bundle esbuild, zéro source React au runtime

`@talentious/cv-render` est consommé en source (.tsx, convention monorepo) :
le build de prod bundle app + package + react/react-dom (variante production
via `define NODE_ENV`) dans `dist/server.js` (esbuild épinglé en version
exacte, dist/ vidé avant chaque build). Les dépendances runtime (fastify,
ajv-formats, playwright-core) restent externes. Conséquence sécurité : l'image
ne contient NI react NI aucune source du package — la sourcemap embarquée est
SANS `sourcesContent` (chemins/lignes seulement, lue via
`--enable-source-maps`) ; la surface runtime reste celle de M2-T02 (fichiers
root-owned, non-root 1001). Le CSS du package est préchargé AU DÉMARRAGE
(échec de révision immédiat si l'artefact manque, jamais des 500 par requête)
et `CV_RENDER_CSS_PATH`, s'il est posé, est un candidat UNIQUE à échec
explicite (même privilège que changer l'image — pas d'escalade).

## Décision 6 — JS de page DÉSACTIVÉ, auto-fit piloté de l'EXTÉRIEUR, polices en data:

Arbitré par le **spike M2-T05** (exécuté dans l'image épinglée réelle,
fixture dense — lève la contradiction R1 : l'auto-fit du renderer repose sur
des hooks client, or le document rendu est du markup statique SANS runtime
React : même JS activé, rien ne tournerait).

- **`javaScriptEnabled: false` sur le contexte Playwright** + CSP
  `script-src 'none'` : DOUBLE verrou, prouvé — un `<script>` hostile injecté
  dans le document ne s'exécute pas (spike Q2).
- **L'auto-fit vit côté service, pas dans la page** : CDP (`page.evaluate`)
  n'est soumis ni à la CSP ni à `javaScriptEnabled:false` (spike Q1) — c'est
  un canal de CODE DE CONFIANCE (le nôtre), jamais exposé au contenu.
  Séquence M2-T06 : média PRINT posé d'abord (le scale est mesuré dans le
  média FINAL — une règle @media print qui change les hauteurs est mesurée
  telle qu'imprimée, revue T06) → `setContent` → `document.fonts.ready` →
  mesure `scrollHeight` (marqueur `data-cv-content` ; ABSENT ⇒ échec explicite,
  jamais un multi-pages silencieux) → `computeFitScale` + `fitTransform`
  PARTAGÉS avec l'aperçu Next (fidélité aperçu = PDF) → `page.pdf`.
  Prouvé : fixture dense, scale 0,82, PDF A4 d'UNE page (spike Q5).
  Verrous d'exécution supplémentaires (revues T06) : liste BLANCHE des args
  Chromium au démarrage ; contexte `serviceWorkers: block`, téléchargements
  refusés, `context.route` qui AVORTE toute requête réseau (second verrou
  indépendant de la CSP — T08 ajoute l'observabilité) ; navigateur mort ⇒
  `/healthz` 503 ⇒ recyclage Cloud Run (jamais des 500 en boucle derrière un
  healthz vert) ; réponse PDF en `Cache-Control: no-store` + `nosniff`
  (données personnelles, minimisation).
- **`__CV_READY__` n'est PAS utilisé côté export** (il reste le signal de
  l'aperçu Next) : le flux séquentiel ci-dessus rend le signal inutile — pas
  de `waitForFunction` sur un état que le document ne peut pas poser sans JS.
- **Polices : inlinées en `data:` dans le CSS embarqué** + CSP élargie au
  strict `font-src data:`. Prouvé (spike Q3/Q4) : les 32 `@font-face`
  `url('fonts/…')` relatifs de dist/cv.css ne chargent JAMAIS sous
  `setContent` (fallback système silencieux — inacceptable pour un rendu
  déterministe), la variante `data:` charge avec ZÉRO requête réseau.
  M2-T16 industrialise : feuille `@font-face` data: générée par famille,
  seules les familles du thème du document sont embarquées.
- **Zéro requête réseau** observée sur tout le rendu (spike Q6) et VERROUILLÉE
  (M2-T08) : `context.route` avorte toute requête sortante — dernier rempart
  DET-M0-AC1 contre une URL http(s) d'apparence légitime (métadonnées GCP
  169.254.169.254 comprise) — et chaque tentative est signalée (log du
  HOSTNAME seul, jamais l'URL complète : contrainte logs sans contenu, T12).
  Prouvé par serveur-témoin : zéro requête reçue pendant le rendu d'un HTML
  piégé, mutation abort→continue tuée (le témoin reçoit, le test rougit).
  L'egress INFRA (VPC/Cloud Run) restera un rempart de plus (phase B).

## Décision 7 — Sandbox Chromium : politique et compensations (M2-T09)

Cloud Run gen2 requis (gVisor gen1 interdit le sandbox Chromium) ; la
validation du sandbox RÉEL n'est possible qu'au premier déploiement (R3).
Politique figée et APPLIQUÉE au démarrage (`validateChromiumLaunch`) :

- les args Chromium passent une LISTE BLANCHE (`--no-sandbox`,
  `--disable-dev-shm-usage`, `--disable-gpu`) — tout autre ⇒ échec de boot ;
- `--no-sandbox` est REFUSÉ si le process tourne root : le non-root (1001)
  est la compensation minimale vérifiable. Les autres compensations, toutes
  en place et testées : egress avorté (décision 6/T08), Option B sans
  navigation, JS de page désactivé + CSP, FS applicatif root-owned (T02),
  écritures /tmp SEUL — PROUVÉ : le conteneur tourne en `--read-only` avec
  un unique tmpfs /tmp (toute la chaîne boot + rendu) — recommandation infra
  (T19) : read-only filesystem + /tmp en RAM, `--disable-dev-shm-usage`
  (pas de /dev/shm sur Cloud Run) ;
- borne de CONCURRENCE des rendus (sémaphore FIFO à FILE BORNÉE,
  `RENDER_CONCURRENCY` défaut 2 / `RENDER_QUEUE_MAX` défaut 8, bornés et
  validés au boot) : chaque rendu = un contexte Chromium (RAM) — une rafale
  ne peut plus provoquer l'OOM du navigateur, et file pleine ⇒ rejet IMMÉDIAT
  en 503 `Retry-After` (shedding déterministe, testé). Prouvé : 4 rendus
  parallèles sur un conteneur read-only ⇒ 4×200, hashs IDENTIQUES.
  CONTRAT T11 HONORÉ : échéance GLOBALE (`RENDER_TIMEOUT_MS`, défaut 120 s,
  validée-bornée au boot) — le chrono part à l'arrivée de la requête ; en
  file, le waiter est RETIRÉ (AbortSignal du sémaphore) ; en rendu, une
  promesse d'échéance PERD la course ET le contexte est fermé — le rejet ne
  dépend JAMAIS des erreurs CDP (constaté : un appel Playwright sur un
  contexte en fermeture peut PENDRE au lieu de rejeter), le perdant de la
  course est neutralisé (zéro unhandled rejection), le permis est toujours
  libéré. Route : 504 problem+json à détail fixe. CHAÎNE DES TIMEOUTS à
  respecter au déploiement (T19) : rendu (RENDER_TIMEOUT_MS ≤ 300 s) <
  requête Fastify (rendu + 30 s, couvre lecture du corps et normalisation)
  < timeout Cloud Run < timeout de l'appelant backend — sinon le 504 typé
  ne sort jamais. La concurrency Cloud Run (T19) complète côté infra.
- limite connue du contrôle uid : un uid non-root doté de capabilities
  élevées (CAP_SYS_ADMIN…) passe — indétectable au boot, c'est le
  securityContext du déploiement qui l'exclut (T19) ;
- au premier déploiement : TENTER le lancement SANS `--no-sandbox` (gen2,
  noyau complet) ; s'il échoue, `--no-sandbox` + compensations ci-dessus est
  la position de repli ASSUMÉE, consignée ici.

## Reste à instruire (tickets ordonnancés)

- M2-T06 : contexte Chromium par requête (séquence de la décision 6), échec
  rapide (`__CV_ERROR__` sans objet — remplacé par les erreurs du flux CDP),
  executablePath() au démarrage, test « script injecté ne s'exécute pas ».
- M2-T16 : génération de la feuille de polices data: (contrat polices).
  JUSQU'À T16, les polices sont les replis système de l'image : la hauteur
  mesurée (donc le scale) dépend de la machine — déterminisme D6 PARTIEL,
  assumé et borné (l'image épinglée fige les polices du conteneur) ;
  la baseline visuelle M2-T10 le constatera.
