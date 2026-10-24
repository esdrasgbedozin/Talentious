# ADR-RENDER-SECURITY — Sécurité du rendu PDF (export-service)

**Statut : EN COURS** — commencé à M2-T04 (document + CSP + échappement).
Sections à compléter : polices (M2-T05), rendu Chromium (M2-T06), egress
(M2-T08), sandbox (M2-T09). Voir ADR-PDF-RENDER pour l'architecture du
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
- Évolution prévue M2-T05 (polices embarquées) : élargissement au strict
  nécessaire (`font-src`), consigné ici.

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

## Reste à instruire (tickets ordonnancés)

- M2-T05 : polices embarquées + décision JS-off/auto-fit (`__CV_READY__`).
- M2-T06 : contexte Chromium par requête, échec rapide (`__CV_ERROR__`,
  DET-M0-T14T15a), executablePath() au démarrage.
- M2-T08 : egress verrouillé applicatif (dernier rempart URL « légitimes »).
- M2-T09 : sandbox/compensations Chromium (Cloud Run gen2, /tmp seul).
