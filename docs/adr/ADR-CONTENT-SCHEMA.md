# ADR-CONTENT-SCHEMA — Schéma de contenu CV canonique unique et coercition de sécurité

- **Statut** : Accepté (2026-10-19)
- **Décideur** : fondateur (point d'arrêt humain — V2, roadmap M0)
- **Contexte technique** : `GeneratedCVData` (`contracts/openapi.yaml` v1.1.0), agent
  rédacteur-cv, `backend/app/services/cv_worker.py`, route d'édition
  `backend/app/routes/cv.py` (`PUT /cv/{id}`), nouveau module
  `backend/app/services/cv_content_coercion.py`. Prépare le rendu HTML serveur V2
  (export-service) — voir ADR-RENDER-SECURITY, ADR-RENDER-PACKAGE.

## Contexte

En V1, `cv_worker.py` stockait la sortie de l'agent rédacteur **brute** :
`cv_data_json = generated.get("cv_data", generated)`, insérée telle quelle en JSONB.
C'était sans danger tant que le contenu n'était réaffiché que par React (échappement
automatique). La V2 introduit un **rendu HTML côté serveur** (Chromium headless, Option
B) : la même charge `GeneratedCVData` devient l'entrée directe du package de rendu. Une
sortie LLM hostile (consécutive à une injection de prompt via l'offre ou le profil
importé) — `<script>`, URL `javascript:`/`data:`, clés hors schéma, chaînes démesurées,
champ interne `optimization_notes` — deviendrait alors un vecteur XSS/exfiltration au
rendu (faille latente héritée de la ligne `cv_worker.py:100`).

L'import PDF disposait déjà d'une ceinture de sécurité post-LLM (`coerce_profile`,
agents/parser-pdf) ; la génération de CV n'en avait aucune. Par ailleurs, la Bible et
l'architecture V2 exigent **un seul schéma de contenu** par document (fin des 4 contrats
divergents de la V1), réutilisé à l'identique par la génération, le stockage, le rendu et
l'édition.

Le même JSONB alimente **deux** chemins d'écriture : la génération (`cv_worker`) et
l'édition manuelle (`PUT /cv/{id}`, qui stockait lui aussi le dict utilisateur brut).
Les deux doivent être couverts avant le rendu serveur, sinon la faille reste ouverte
sur le chemin d'édition (revue de code M0, constat B1).

## Décisions

1. **`GeneratedCVData` est le schéma de contenu canonique UNIQUE du CV.** Même objet pour
   la sortie du rédacteur, le JSONB stocké (`generated_cvs.cv_data_json`), l'entrée du
   package de rendu partagé et le modèle d'édition (`PUT /cv/{id}`). **Aucune
   transformation runtime** entre ces usages (seule la coercition de sécurité ci-dessous
   s'applique, une fois, avant stockage). La forme (template, thème, langue) vit dans
   l'enveloppe du document, **jamais** dans ce contenu.

2. **Coercition de sécurité en liste blanche avant stockage** (`coerce_cv_content`,
   `cv_content_coercion.py`), calquée sur `coerce_profile` et sans dépendance (testable
   en CI) : clés en liste blanche (toute clé hors schéma est supprimée, dont
   `__proto__`), types forcés, longueurs plafonnées (contraintes du contrat), dates
   re-validées `AAAA-MM` (sinon null), **URL re-validées `http(s)` sinon null**
   (neutralise `javascript:`/`data:`), enums ramenés à une valeur sûre. Le champ interne
   **`optimization_notes` n'est jamais conservé** (risque d'exfiltration BLK-5).

3. **Expérience sans `start_date` valide : écartée, pas d'échec global.** `start_date`
   est requis + patterné ; une entrée corrompue est retirée (avec warning) plutôt que de
   faire échouer tout le CV.

3 bis. **Ancrage d'identité sur le profil (génération).** À la génération, le bloc
   `personal_info` (nom, email, téléphone, contact) est **écrasé par celui du profil
   vérifié**, jamais pris de la sortie du LLM (`coerce_personal_info`). Une injection de
   prompt ne peut donc pas falsifier les coordonnées affichées sur le CV. En **édition**
   (`PUT /cv/{id}`), on ne ré-ancre PAS : c'est le propriétaire authentifié qui modifie
   ses propres données — mais la coercition + validation s'appliquent quand même.

3 ter. **Les deux chemins d'écriture sont coercés + validés.** Génération ET
   `PUT /cv/{id}` passent par `coerce_cv_content` + `GeneratedCVData.model_validate`.
   À l'édition, un contenu non coercible ou invalide est refusé par un **422 RFC 7807**
   (pas de stockage brut).

4. **Deux couches, pas une.** La coercition est la 1re couche (contenu stocké sûr) ;
   l'échappement HTML au rendu (autoescape du package) reste la 2e couche obligatoire
   (ADR-RENDER-SECURITY). La coercition n'échappe pas le HTML (ce serait un double
   échappement visible) : un `<script>` dans un champ texte reste une chaîne inerte,
   échappée au rendu.

5. **Garde-fou de validation dans le worker.** Après coercition (et ancrage
   d'identité), le worker valide le contenu contre `GeneratedCVData` (Pydantic). Un
   contenu non coercible (non-objet) ou invalide fait **échouer le job** (`failed` +
   message sûr, sans fuite d'internals), plutôt que de stocker un contenu inexploitable.
   Avec un profil normal, l'ancrage fournit l'email : ce mode d'échec ne se déclenche
   qu'en dernier recours (ex. profil corrompu), pas sur une simple omission du LLM.
   **Logs sans PII** : l'échec de validation est journalisé avec les emplacements et
   types d'erreur seulement (`errors(include_url=False)`, sans `input_value`), et la
   `ValidationError` chaînée n'est pas sortie via `exc_info` (RGPD, minimisation).

6. **Décompte lecture seule des CV V1 non conformes** (`scripts/count_nonconformant_cvs.py`,
   fonction pure `is_cv_content_conformant`). Chiffre la population héritée pour arbitrer,
   au point d'arrêt PAH-M0, entre un backfill de coercition en base et une coercition au
   rendu. **Aucune écriture.** Le verdict utilise une égalité round-trip stricte : il
   **surestime** (borne haute) car un CV V1 partiel mais légitime ressort « non
   canonique » sans être dangereux — chiffre décisionnel conservateur, à lire comme tel.

## Conséquences

- Le rendu serveur V2 part d'un `cv_data_json` propre et schéma-valide, quel que soit
  le chemin d'écriture (génération ou édition).
- **Chemin d'écriture « édition » — correctif M0-T08a.** Cet invariant était en fait
  rompu : l'éditeur frontend manipule du `ProfileData` et sauvegardait `cv_data_json`
  tel quel ; or la coercition backend ne lit que les clés canoniques `selected_*` →
  elle **remplaçait le corps du CV par des tableaux vides** (perte de données en prod).
  Le **rendu** est canonique depuis **M0-T08b**, et l'**éditeur** depuis **M0-T08c**
  (fait) : son état EST le `GeneratedCVData` (formulaires dédiés aux champs canoniques,
  compétences par expérience éditables), chargé via `getCV` + `ensureCVShape` et envoyé
  **tel quel** au `PUT /cv` (`frontend/src/lib/cvEditor.ts`). `ensureCVShape` normalise
  les CV V1 **bruts** (stockés avant la ceinture) vers ce que le backend stockerait —
  listes absentes complétées, ids garantis uniques, champs requis non-chaînes remis à
  `''`, `end_date` `''` → null (poste en cours), catégories libres (« Soft Skill »)
  canonicalisées à l'enum — sans quoi un simple save faisait basculer les compétences
  soft en « techniques » et décochait « Poste actuel » (revue T08c, B1/B2) ; un
  canonique propre traverse à l'identique (testé, y compris un cycle V1 brut avec
  coercition backend simulée no-op). Un cycle éditeur
  d'un CV canonique ne perd **plus rien** : `highlighted_skills` par expérience et
  `level`/`importance` des compétences survivent (l'édition par noms préserve les
  métadonnées des compétences conservées — `withSkillNames`). Le pont de lecture
  `toCanonicalCVData` (`frontend/src/lib/cv.ts`) a été **SUPPRIMÉ à PAH-M0
  (2026-10-22)** : la canonicité est garantie **en base** (backfill v2 des CV V1 —
  canonicalisation des formes legacy puis coercition, contrôle 6/6 conformes — et
  ceinture de coercition du worker à la génération). `getCV`/`updateCV` sont des
  passthrough stricts ; la défense au chargement (`ensureCVShape`) reste aux deux
  points de consommation (éditeur ET page print). Pertes assumées du backfill :
  formation `field` et `languages` (non modélisés, déjà invisibles via le pont).
  Garde-fous au save (revue M0-T08a, portés en canonique par T08c et alignés sur les
  règles d'éviction backend — revue T08c, C3) : `validateCVForSave` **bloque** les
  entrées que la coercition écarterait ou tronquerait en silence (expérience sans date
  AAAA-MM ; date de fin vide sans « Poste actuel » — `end_date` null = poste en cours
  dans le canonique ; projet/certification avec contenu mais sans nom ; formation sans
  diplôme ni établissement ; toute liste au-delà du plafond backend de 30, compétences
  par expérience/projet comprises) ;
  `sanitizeCVForSave` écarte les brouillons vides, normalise les optionnels vides en
  null, préfixe `https://` les URLs sans schéma (le backend rejette toute URL non
  http(s)) et ne renvoie **jamais** `optimization_notes` (BLK-5) ; l'éditeur
  **resynchronise son état** sur la réponse du PUT et son **aperçu rend exactement le
  payload du save** (aperçu = PDF).
- Un CV dont la génération produirait un contenu inexploitable échoue proprement (pas de
  CV cassé stocké), au prix d'un nouvel essai utilisateur.
- Les CV V1 déjà stockés peuvent être non canoniques : traitement décidé à PAH-M0 (non
  couvert par cet ADR).
- **La coercition ne suffit pas seule au rendu** (revue sécurité M0, AC-1/AC-2) : une
  URL `http(s)` légitime en apparence (ex. `http://169.254.169.254/…`, beacon) est
  conservée. Le rendu Chromium V2 DOIT donc tourner **sans egress réseau** (ou allowlist
  stricte) et **échapper les attributs** — exigences à graver dans `ADR-RENDER-SECURITY`,
  pré-requis avant le 1er PDF (M2). La coercition est la porte d'entrée du contenu vers
  Chromium, pas le dernier rempart.
- Dette tracée (tickets roadmap, non bloquants pour cette ceinture) : (a) plafonds
  (`CAPS`) et helpers dupliqués entre `coerce_profile` (agents) et `coerce_cv_content`
  (backend) → mutualisation (déployables distincts) ; (b) durcissement contractuel des
  `maxLength` sur les sous-schémas `Selected*` de `openapi.yaml` (+ `make generate-types`
  même commit) si l'on veut que les plafonds produit deviennent des contraintes de
  contrat ; (c) affiner le décompte M0-T05 (comparaison sémantique) si la borne haute
  est trop large à PAH-M0.

## Alternatives écartées

- **Échapper le HTML à la coercition** : produit un double échappement visible une fois
  rendu ; l'échappement appartient à la couche de rendu.
- **Valider sans coercer** : rejetterait des sorties LLM presque bonnes (clé en trop)
  au lieu de les nettoyer ; mauvaise expérience pour un risque qu'on sait neutraliser.
- **Stocker `optimization_notes` (masqué à l'affichage)** : laisse la donnée sensible en
  base et au rendu ; suppression à la source préférée.
