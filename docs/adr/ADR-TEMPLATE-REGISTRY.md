# ADR-TEMPLATE-REGISTRY — Registre de templates CV (template_id → composant)

- **Statut** : Accepté (2026-10-22)
- **Décideur** : fondateur (roadmap V2, M0 piste rendu — ticket M0-T11)
- **Contexte technique** : `packages/cv-render` (ADR-RENDER-PACKAGE,
  ADR-THEME-DECOUPLED), contrat `CVTemplate`/`GET /cv/templates`
  (`contracts/openapi.yaml` v1.1.0), enveloppe des documents (`template_id`),
  pages éditeur/print (M0-T12), export-service Chromium (M2).

## Contexte

La V2 est multi-template (Bible §3.1 : 4 templates au lancement, un seul
gratuit — « Moderne sobre »). Chaque document porte son `template_id` dans son
ENVELOPPE (jamais dans le contenu canonique, ADR-CONTENT-SCHEMA). Or la V1
n'avait qu'un composant de rendu câblé en dur, et les documents existants sont
stampés `template_id = "modern_v1"` (défaut historique de `cv_worker.py`),
un id que le contrat V2 ne connaît pas (`modern_sobre`).

Trois consommateurs doivent résoudre `template_id` → rendu de façon identique :
l'aperçu/éditeur Next, la page print, et l'export-service (M2). Toute
divergence casserait « aperçu = PDF ».

## Décisions

1. **Le registre vit dans le package de rendu**
   (`packages/cv-render/src/templates/registry.ts`) : unique point de
   résolution, partagé par l'app et l'export-service. L'app ne mappe JAMAIS un
   `template_id` elle-même (T12 consomme `getTemplate`).

2. **Contrat de template unique.** Tout template est un composant
   `CVTemplateProps = { cv: GeneratedCVData, theme?: CVThemeTokens | null,
   language?: DocumentLanguage | null }` (langue ajoutée en M0-T13 : libellés de
   RENDU — sections, mois, « aujourd'hui » — via le dictionnaire `i18n.ts`,
   repli FR strict ; ne traduit jamais le contenu). Le template choisit la
   STRUCTURE ; le thème reste orthogonal (ADR-THEME-DECOUPLED) : n'importe quel
   thème s'applique à n'importe quel template. NOTE (relevé en revue T11+T12) :
   en M0, les pages éditeur/print ne transmettent NI `theme` NI `language` —
   défauts (anthracite, FR) partout. Le branchement de l'enveloppe snapshotée
   (`theme_json`/`language`, M1-T13) arrive avec le choix de template/thème (M3)
   et le multilingue (M7) : trou assumé, pas un oubli.

3. **Repli garanti, jamais d'échec.** Un `template_id` inconnu, absent ou
   corrompu résout vers `modern_sobre` (le template gratuit) : un document ne
   devient jamais irrendable à cause de son enveloppe. La résolution est
   STRICTE (ids stables du contrat, pas de normalisation de casse) : deviner
   serait masquer une corruption.

4. **Alias legacy `modern_v1 → modern_sobre`.** Les documents V1 restent
   rendus sans migration de données. La dette du stamp est SOLDÉE à PAH-M0
   (2026-10-22) : `cv_worker.py` stampe désormais
   `DEFAULT_TEMPLATE_ID = "modern_sobre"` sur les nouveaux documents ;
   l'alias ne sert plus que le stock existant et reste tant que des
   documents `modern_v1` existent en base.

   **M1-T03 (2026-10-23) : le stock est basculé en base.** La migration
   `c8d9e0f1a2b3` crée le registre serveur `cv_templates` (seed
   `modern_sobre`, gratuit), backfille tout `template_id` hors registre vers
   `modern_sobre` (valeurs réécrites tracées dans la sortie du migrate),
   puis pose la FK `generated_cvs.template_id → cv_templates.id` en
   RESTRICT, via le pattern `NOT VALID → backfill → VALIDATE` (aucune
   fenêtre de course, verrous courts). Cette migration est **réversible en
   schéma, pas en valeurs** : le downgrade retire FK et table mais ne
   restaure pas les stamps d'origine — perte assumée, le rendu est
   identique par construction (même cible que l'alias). L'alias front ne
   sert plus qu'en défense (enveloppe corrompue à l'exécution).

5. **Ajouter un template = 3 gestes** : le composant dans
   `src/templates/`, son entrée dans `TEMPLATES`, son entrée au catalogue
   serveur (`GET /cv/templates`, source des métadonnées `is_free`/aperçus —
   le registre ne porte AUCUNE métadonnée produit, seulement le rendu). Les
   sentinelles de découplage (T09) scannent récursivement `src/templates/`.
   Deux exigences pour la migration de seed du 2e template (revue M1-T10) :
   (a) le catalogue est servi trié par `id` (alphabétique) — si un ordre
   ÉDITORIAL est voulu, ajouter une colonne `sort_order` à ce moment-là ;
   (b) valider chaque ligne seedée contre le modèle généré du contrat dans
   le test de cycle de la migration — une ligne de registre malformée ferait
   répondre 500 à tout le catalogue (les routes construisent les réponses
   avec les modèles stricts du contrat).

## Alternatives écartées

- **Mapping dans l'app Next** : dupliqué dans l'export-service → divergence
  « aperçu ≠ PDF » garantie à terme.
- **Échec (422/page d'erreur) sur id inconnu** : punit l'utilisateur pour une
  corruption d'enveloppe ; le repli rend toujours, le catalogue serveur reste
  le gardien des ids valides à l'écriture.
- **Migration immédiate des `modern_v1` en base** : écriture de masse hors
  périmètre M0 ; l'alias rend le même service sans toucher aux données
  (décision de backfill groupée à PAH-M0).
