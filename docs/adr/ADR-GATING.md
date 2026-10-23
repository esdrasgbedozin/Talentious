# ADR-GATING — Gating serveur systématique des capacités premium

- **Statut** : Accepté — PARTIEL (2026-10-23, M1-T08 : moteur de décision).
  Finalisation à M9-T11 (matrice complète capacités × profils sur les routes
  livrées).
- **Décideur** : fondateur (Bible §4.3/§4.4, D1 actée 2026-10-19 ; archi V2 §7
  ADR n°12)
- **Contexte technique** : FastAPI, réponse contrat `PassRequired` (402,
  RFC 7807), `CareerPass` (pass one-time à `valid_until`), enveloppe de la
  Variante (M1-T05 : `created_under_pass`, `theme_preset_id`, `language`).

## Contexte

La V1 gâtait une seule capacité (générer un CV ⇒ Pass ou admin), directement
dans la route. La V2 en gâte une dizaine (templates, thèmes, langue EN,
variantes, lettre, relecture, détail ATS, export docx…) sur des routes
multiples. Un gating éparpillé dans les routes — ou pire, délégué au front —
diverge, s'oublie, et chaque oubli est une faille (capacité premium gratuite)
ou une violation produit (document verrouillé à tort, principe
anti-ressentiment D1).

## Décisions

1. **Le gating est SERVEUR, systématique, et centralisé dans
   `app/services/entitlements.py`.** Le front peut masquer des boutons, jamais
   décider. Aucune route ne réimplémente une règle premium : elle appelle le
   service et transporte sa décision.

2. **Les décisions sont PURES.** Un `Subject` (projection minimale :
   authentifié, admin, pass actif) + des faits (`is_free`, `preset_is_free`,
   `language`, `created_under_pass`, `variant_count`) ⇒ une `Decision`
   (`allowed` + motif). Aucune I/O dans les règles : la table de vérité
   complète (5 profils × capacités) se teste en unitaire — critère M1-T08.
   Seuls deux chargeurs minces touchent la base : `subject_for` (un pass
   ACTIF uniquement) et `count_variants`.

3. **Chaque refus porte le type Problem RFC 7807 EXACT du contrat**
   (`DenialReason` = les URLs de la réponse `PassRequired` :
   `career-pass-required`, `premium-template-required`,
   `premium-theme-required`, `premium-language-required`,
   `variant-limit-reached`). La route rend un 402 avec ce `type`, sans
   reformuler. Une `Decision` incohérente (refus sans motif, motif sur une
   autorisation) est impossible par construction (invariant du dataclass).

4. **D1 (anti-ressentiment) est encodée structurellement** :
   - « Pass expiré » ≡ « gratuit » dans l'espace de décision — `subject_for`
     ne retient qu'un pass à `valid_until` futur, prouvé par test ;
   - la LECTURE et le RE-TÉLÉCHARGEMENT de l'existant ne passent JAMAIS par ce
     service : ownership seul, refus en **404 anti-IDOR** (jamais 403 — ne pas
     révéler l'existence d'une ressource d'autrui), câblé aux routes M2-T17+ ;
   - **règle d'ORDRE dans les routes (revue sécu M1-T08) : ownership d'abord
     (404), gating ensuite (402)** — un 402 rendu avant le contrôle
     d'ownership révélerait qu'une ressource d'autrui existe ET qu'elle est
     premium (oracle IDOR). `can_edit` SUPPOSE l'ownership déjà contrôlé.
     À tester dans la matrice M9-T11 ;
   - `created_under_pass` est le marqueur d'édition premium : un document créé
     gratuit reste éditable gratuitement, un document créé sous Pass verrouille
     son édition à l'expiration (lecture intacte).

5. **Quota de variantes par `COUNT` à la demande** (`FREE_VARIANT_LIMIT = 1`,
   Bible §4.3) : l'état réel de la base, jamais un compteur dénormalisé qui
   divergerait (suppression, backfill). **Honnêteté (revue sécu M1-T08) : le
   COUNT ne protège PAS de la concurrence** — deux créations simultanées
   lisent le même compte (TOCTOU) et passeraient toutes deux sous la limite.
   La route qui crée une variante doit prendre
   `pg_advisory_xact_lock(user_id)` (ou `FOR UPDATE` sur la ligne user) dans
   la MÊME transaction que le COUNT et l'INSERT ; exigé au ticket de câblage,
   avec test de concurrence. Le stock hérité d'un Pass n'est jamais supprimé —
   il bloque simplement la création gratuite neuve.

6. **La route valide l'EXISTENCE avant de gater.** `can_use_theme` traite
   `preset_is_free=None` comme « thème personnalisé » (premium, fail-closed) :
   une route qui échouerait à résoudre un preset (id inconnu) rendrait donc un
   402 trompeur au lieu d'un 404/422. Règle : résoudre le preset/template
   d'abord (404/422 si inconnu), appeler le gating ensuite.

7. **L'admin n'est jamais concerné par le gating** (contrat `PassRequired`),
   mais reste soumis à l'authentification.

## Reste à faire (finalisation M9-T11)

- Câbler le service aux routes au fil des capacités (M2-T17 export, M6 lettre,
  M7 relecture…) ; remplacer le `check_career_pass_or_admin` historique de
  `/cv/generate` par `subject_for` + décisions (au ticket qui touche la route).
- Matrice de gating complète testée en paramétré : toutes capacités V2 ×
  {anonyme, gratuit, Pass actif, Pass expiré, admin} sur les ROUTES (pas
  seulement le service) ; aucun contrôle côté front seul.
- Trancher le reste R2 (download proxifié vs URL signée — M2-T15) : la durée
  de vie d'une URL signée est aussi une décision de gating.

## Alternatives écartées

- **Confiance au frontend** (masquer les boutons) : contournable par appel
  direct de l'API.
- **Gating dans chaque route** : divergence garantie (la V1 le montrait déjà) ;
  les règles produit (D1) doivent avoir UN point de vérité testable.
- **Compteur de variantes stocké** : plus rapide mais faux un jour (concurrence,
  suppressions, backfills) ; le COUNT indexé sur `user_id` suffit largement à
  l'échelle visée.
- **403 pour les ressources d'autrui** : révèle l'existence de la ressource ;
  le contrat impose le 404 anti-IDOR.
