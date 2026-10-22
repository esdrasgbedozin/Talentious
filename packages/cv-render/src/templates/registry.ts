/**
 * Registre de templates CV (M0-T11, ADR-TEMPLATE-REGISTRY).
 *
 * UNIQUE point de résolution `template_id` (enveloppe du document, contrat V2)
 * → composant de rendu, partagé par l'aperçu/l'éditeur Next (T12) et
 * l'export-service (M2). Le template choisit la STRUCTURE ; le thème
 * (couleurs/polices) reste orthogonal (ADR-THEME-DECOUPLED) : tout template
 * accepte les mêmes props `{ cv, theme? }`.
 *
 * Garanties :
 * - un `template_id` inconnu, absent ou corrompu ne casse JAMAIS le rendu :
 *   repli sur `modern_sobre` (le template gratuit, Bible V2) ;
 * - les documents V1 (stampés `modern_v1` — défaut historique du cv_worker)
 *   résolvent vers `modern_sobre` via la table d'alias ;
 * - la résolution est STRICTE (pas d'insensibilité à la casse, pas de
 *   normalisation) : les ids de template sont des identifiants stables du
 *   contrat (`CVTemplate.id`), pas des saisies utilisateur.
 */
import type { ComponentType } from 'react';
import CVRenderer from '../CVRenderer';
import type { GeneratedCVData } from '../types';
import type { components } from '../generated/api';

type CVThemeTokens = components['schemas']['CVThemeTokens'];

/** Props communes à TOUT template : contenu canonique + thème snapshoté. */
export interface CVTemplateProps {
  cv: GeneratedCVData;
  theme?: CVThemeTokens | null;
}

export type CVTemplateComponent = ComponentType<CVTemplateProps>;

/** Template de repli : « Moderne sobre », le template gratuit. */
export const FALLBACK_TEMPLATE_ID = 'modern_sobre';

/** `template_id` canonique → composant. Ajouter un template = une entrée ici
 * + une entrée au catalogue serveur (`GET /cv/templates`). */
const TEMPLATES: Record<string, CVTemplateComponent> = {
  modern_sobre: CVRenderer,
};

/** Alias d'ids legacy → id canonique. `modern_v1` : défaut V1 du cv_worker,
 * encore stampé sur les documents existants (dette tracée, ADR). */
const TEMPLATE_ALIASES: Record<string, string> = {
  modern_v1: 'modern_sobre',
};

/** Résout un `template_id` d'enveloppe vers un id canonique du registre ;
 * tout ce qui n'est pas connu (alias compris) retombe sur le repli.
 * `Object.hasOwn` partout : un id hostile nommant une propriété héritée
 * d'`Object.prototype` (`__proto__`, `constructor`, `toString`…) ne doit
 * JAMAIS traverser les tables — garde par construction, pas par coercition. */
export function resolveTemplateId(id: unknown): string {
  if (typeof id !== 'string') return FALLBACK_TEMPLATE_ID;
  const canonical = Object.hasOwn(TEMPLATE_ALIASES, id) ? TEMPLATE_ALIASES[id] : id;
  return Object.hasOwn(TEMPLATES, canonical) ? canonical : FALLBACK_TEMPLATE_ID;
}

/** Composant de rendu pour un `template_id` d'enveloppe (repli garanti). */
export function getTemplate(id: unknown): CVTemplateComponent {
  return TEMPLATES[resolveTemplateId(id)];
}
