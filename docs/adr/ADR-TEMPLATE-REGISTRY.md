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
   `CVTemplateProps = { cv: GeneratedCVData, theme?: CVThemeTokens | null }`.
   Le template choisit la STRUCTURE ; le thème reste orthogonal
   (ADR-THEME-DECOUPLED) : n'importe quel thème s'applique à n'importe quel
   template.

3. **Repli garanti, jamais d'échec.** Un `template_id` inconnu, absent ou
   corrompu résout vers `modern_sobre` (le template gratuit) : un document ne
   devient jamais irrendable à cause de son enveloppe. La résolution est
   STRICTE (ids stables du contrat, pas de normalisation de casse) : deviner
   serait masquer une corruption.

4. **Alias legacy `modern_v1 → modern_sobre`.** Les documents V1 restent
   rendus sans migration de données. DETTE : `cv_worker.py` stampe encore
   `DEFAULT_TEMPLATE_ID = "modern_v1"` sur les NOUVEAUX documents (backend,
   hors périmètre T11-FRONT) — à basculer sur `modern_sobre` côté backend,
   après quoi l'alias ne sert plus que l'existant (backfill éventuel à
   PAH-M0 ; l'alias reste tant que des documents `modern_v1` existent).

5. **Ajouter un template = 3 gestes** : le composant dans
   `src/templates/`, son entrée dans `TEMPLATES`, son entrée au catalogue
   serveur (`GET /cv/templates`, source des métadonnées `is_free`/aperçus —
   le registre ne porte AUCUNE métadonnée produit, seulement le rendu). Les
   sentinelles de découplage (T09) scannent récursivement `src/templates/`.

## Alternatives écartées

- **Mapping dans l'app Next** : dupliqué dans l'export-service → divergence
  « aperçu ≠ PDF » garantie à terme.
- **Échec (422/page d'erreur) sur id inconnu** : punit l'utilisateur pour une
  corruption d'enveloppe ; le repli rend toujours, le catalogue serveur reste
  le gardien des ids valides à l'écriture.
- **Migration immédiate des `modern_v1` en base** : écriture de masse hors
  périmètre M0 ; l'alias rend le même service sans toucher aux données
  (décision de backfill groupée à PAH-M0).
