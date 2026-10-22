/**
 * Types d'entrée du package de rendu, alias des types générés depuis le contrat
 * (source de vérité : contracts/openapi.yaml, via `make generate-types-cv-render`).
 * Ne pas redéfinir ces formes à la main.
 */
import type { components } from './generated/api';

/**
 * Schéma de contenu CANONIQUE unique (ADR-CONTENT-SCHEMA) : sortie de l'agent,
 * charge stockée (`cv_data_json`) et entrée de `CVRenderer` (depuis M0-T08b) —
 * aucune transformation entre ces usages.
 */
export type GeneratedCVData = components['schemas']['GeneratedCVData'];
