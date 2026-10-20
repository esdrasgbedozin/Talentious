/**
 * @talentious/cv-render — point d'entrée public du package de rendu CV partagé.
 *
 * Échafaudage M0-T06 : la surface publique réelle (CVRenderer, registre de
 * templates, themeToCssVars, i18n) est ajoutée aux tickets suivants —
 * extraction de CVRenderer en M0-T08, découplage du thème en M0-T09/T10,
 * registre de templates en M0-T11. Voir ADR-RENDER-PACKAGE.
 *
 * Invariant : ce package est l'unique source de rendu, consommé à l'identique
 * par l'aperçu Next (transpilePackages) et par l'export-service (setContent),
 * ce qui garantit « aperçu = PDF » (Bible §1.4).
 */

/** Identité et cibles de consommation du package partagé. */
export const CV_RENDER_PACKAGE = {
  name: '@talentious/cv-render',
  consumers: ['next-preview', 'export-service'],
} as const;

export type CvRenderPackage = typeof CV_RENDER_PACKAGE;

// Renderer CV (extrait en M0-T08, canonique depuis M0-T08b) : consomme le schéma
// canonique GeneratedCVData (prop `cv`), sans transformation — même entrée pour
// l'aperçu Next et l'export-service (M2).
export { default as CVRenderer } from './CVRenderer';
export type { GeneratedCVData } from './types';
