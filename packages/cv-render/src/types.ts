/**
 * Types d'entrée du package de rendu, alias des types générés depuis le contrat
 * (source de vérité : contracts/openapi.yaml, via `make generate-types-cv-render`).
 * Ne pas redéfinir ces formes à la main.
 */
import type { components } from './generated/api';

/**
 * Forme actuellement consommée par `CVRenderer` (extraction M0-T08, à
 * comportement constant). La migration du renderer vers le schéma canonique
 * `GeneratedCVData` est un ticket distinct (changement de comportement).
 */
export type ProfileData = components['schemas']['ProfileData'];

export type GeneratedCVData = components['schemas']['GeneratedCVData'];
