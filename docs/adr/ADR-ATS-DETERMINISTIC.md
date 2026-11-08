# ADR-ATS-DETERMINISTIC — Score ATS calculé déterministement, sans LLM

- **Statut** : Accepté (2026-11-08)
- **Décideur** : fondateur (roadmap V2, jalon M5 — tickets M5-T05/T06/T07)
- **Contexte technique** : contrat `contracts/openapi.yaml` (`ATSKeyword`,
  `ATSScoreRequest`, `ATSScoreResult`), agent `analyseur-offre` (sortie
  `keywords[]`, contrat `contracts/agents/analyseur-offre.openapi.yaml`),
  contenu CV canonique `GeneratedCVData` (ADR-CONTENT-SCHEMA). Backend
  FastAPI/Python, modèles générés `backend/app/generated/models.py`.

## Contexte

La V2 vend un **Score ATS** (0-100) mesurant l'adéquation d'un CV à une Offre :
score gratuit (teaser), détail (mots-clés manquants) premium (Bible §5). Le
contrat impose un score **déterministe et reproductible, toujours renseigné**
(`ATSScoreResult.score`, « Déterministe et reproductible »). Deux manières de
produire ce score :

1. **Demander une note à un LLM** — non reproductible (température, dérive de
   modèle), coûteux (le teaser est gratuit, économie solo), opaque, et contraire
   à la promesse du contrat.
2. **Calcul déterministe** à partir de la sortie structurée de l'analyse d'offre
   (`keywords[]`) et du contenu CV — reproductible à l'octet, sans coût LLM au
   moment du score, auditable.

Le **seul** appel LLM de la chaîne ATS est l'**analyse d'offre** (extraction des
mots-clés), qui est mise en cache par empreinte du texte (M5-T03) et partagée
avec la Lettre et la Relecture (Bible §3, « source commune »). Le calcul du
score, lui, ne fait aucun appel LLM.

## Décisions

1. **Le score est une fonction pure du couple (keywords, contenu CV).** Aucun
   appel réseau, aucun LLM, aucune horloge, aucun aléa. `score(keywords, cv)`
   renvoie toujours la même valeur pour les mêmes entrées — propriété vérifiée
   par test (appel répété) et par golden fixtures (M5-T07).

2. **Corpus CV déterministe.** Le contenu canonique est aplati en un texte
   unique et stable : résumé, intitulés + sociétés + descriptions d'expériences,
   noms + descriptions de projets, diplômes + établissements + descriptions de
   formations, intitulés de certifications, et toutes les compétences. L'ordre
   de concaténation est fixe ; un champ absent ou corrompu est ignoré (jamais
   d'exception — défense en profondeur, cf. coercition du rendu).

3. **Normalisation déterministe (M5-T05), sans bibliothèque de TAL.** Minuscules,
   suppression des accents (Unicode NFD + dépouillement des diacritiques),
   ponctuation → espaces, espaces compressés. Un **repli de pluriel conservateur**
   (`fold_token`) retire un `s` final sur un jeton alphabétique de longueur ≥ 4
   **sauf** s'il se termine par `ss` (évite `css`→`cs`, `process`→`proces`). Il
   est appliqué **symétriquement** aux deux côtés de la comparaison : il ne peut
   donc pas provoquer de faux négatif contre soi-même, au pire un faux positif
   rare entre deux jetons distincts qui se replient pareil. Pas de racinisation
   agressive : elle corromprait les acronymes techniques (`SaaS`, `CSS`, `API`).

4. **Correspondance par nom OU alias, à frontières de jetons (M5-T06).** Un
   mot-clé est _présent_ si son `name` **ou l'un de ses `aliases`** (chacun
   normalisé et découpé en jetons repliés) apparaît dans le corpus CV normalisé
   comme **sous-séquence contiguë de jetons** (gère « machine learning », « google
   cloud platform »). La synonymie vient des **`aliases` fournis par l'agent**
   (`JS` pour `JavaScript`) — **pas** d'une table de synonymes maison, fragile à
   maintenir et source de dérive.

5. **Pondération catégorie × importance (M5-T07).** Poids d'un mot-clé =
   `poids_catégorie × multiplicateur_importance` :
   - catégorie : `hard_skill` = 3, `requirement` = 2, `soft_skill` = 1
     (hard skills > responsabilités/exigences > savoir-être, Bible) ;
   - importance : `Critical` = 1.5, `Important` = 1.0, `Nice to have` = 0.5,
     **absente** = 1.0 (traitée comme `Important`).
   - `score = round(100 × Σ poids des mots-clés présents / Σ poids de tous les
mots-clés)`, borné à l'entier `[0, 100]`.

6. **Cas limite : 0 mot-clé.** Une analyse ne produisant aucun mot-clé donne
   `score = 0`, `missing_keywords_count = 0`, listes vides (documenté). Le contrat
   exige un entier ; 0 signifie « aucune adéquation créditée », faute d'élément à
   créditer. Un vrai texte d'offre (≥ 50 caractères) en produit en pratique.

7. **Score toujours complet ; seul le DÉTAIL est tronqué (M5-T10).** La valeur
   `score` est identique avec ou sans Pass. Sans Pass, le serveur tronque
   `matched_keywords` / `missing_keywords` et conserve `missing_keywords_count`
   (teaser). Le **volume exact** du teaser gratuit est **D3** — ouverte, à régler
   avec le coût réel mesuré (Bible §7.1) — donc hors de cet ADR et du contrat.

8. **L'arrondi est le dernier geste.** Tout le calcul se fait en rationnels/flottants
   sur les poids ; l'arrondi `round()` (demi au pair, comportement Python stable)
   n'intervient qu'à la toute fin, une seule fois, pour rester reproductible.

## Conséquences

- Le moteur vit dans un module backend pur et sans I/O (`ats_scoring.py`),
  testable hors base et hors réseau ; l'endpoint M5-T09 ne fait que l'alimenter
  (analyse d'offre en cache + contenu CV) et persister le résultat (`ats_scores`,
  M5-T08).
- Golden fixtures (M5-T07) : un jeu de CV × offres aux scores figés verrouille
  toute évolution involontaire de la formule ; changer un poids casse la suite
  volontairement (on amende alors cet ADR).
- La qualité du score dépend de la qualité des `keywords` de l'agent (M5-T01) et
  de ses `aliases` : c'est là, et dans les évals (M5-T02), que se joue la
  pertinence — pas dans une heuristique maison de synonymes.
- Reproductibilité inter-exécutions garantie : aucune dépendance à une version de
  lib de TAL, à l'ordre des clés d'un dict, ni à la locale système.

## Alternatives écartées

- **Score par LLM** : non reproductible, coûteux sur un teaser gratuit, opaque ;
  contredit « déterministe et reproductible » du contrat.
- **Embeddings / similarité sémantique** : non déterministe entre versions de
  modèle, latence et coût, résidence des données ; illusion de précision.
- **Racinisation (stemming) agressive ou lemmatisation par lib** : corrompt les
  acronymes techniques et introduit une dépendance versionnée non déterministe.
- **Table de synonymes maison** : dette de maintenance et dérive ; la synonymie
  est déléguée aux `aliases` produits par l'agent (révisables par évals).
- **Appariement flou (Levenshtein)** : faux positifs non explicables à
  l'utilisateur ; incompatible avec un teaser « honnête ».
