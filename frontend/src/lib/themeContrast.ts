import { contrastRatio, WCAG_AA_NORMAL } from '@talentious/cv-render';
import type { components } from '@/generated/api';

type CVThemeTokens = components['schemas']['CVThemeTokens'];

export type ContrastField = 'color_text' | 'color_muted' | 'color_accent';

// Les 3 couleurs de premier plan jugées contre le fond, À L'IDENTIQUE du serveur
// (theme_validation.py, _CONTRAST_RULES) : texte, atténué et accent doivent
// atteindre le seuil AA contre color_background.
export const CONTRAST_FIELDS: ContrastField[] = [
  'color_text',
  'color_muted',
  'color_accent',
];

export interface ContrastResult {
  field: ContrastField;
  /** Ratio WCAG [1, 21], ou null si une couleur n'est pas un #RRGGBB évaluable. */
  ratio: number | null;
  readable: boolean;
}

/**
 * Évalue le contraste WCAG AA des 3 couleurs de premier plan contre le fond.
 * Le calcul est DÉLÉGUÉ à contrastRatio du package (même math que le rendu) et,
 * via les fixtures partagées (fixtures/theme-validation/cases.json), produit les
 * MÊMES verdicts que le serveur. Seuil = WCAG_AA_NORMAL (4.5).
 *
 * Ne LÈVE JAMAIS : une couleur non évaluable (hex partiel pendant la saisie,
 * donnée corrompue) donne ratio null + non lisible, pour que l'indicateur en
 * direct (M3-T11) ne fasse pas tomber le rendu. L'autorité reste le serveur.
 */
export const evaluateThemeContrast = (
  tokens: CVThemeTokens,
): ContrastResult[] =>
  CONTRAST_FIELDS.map((field) => {
    try {
      const ratio = contrastRatio(tokens[field], tokens.color_background);
      return { field, ratio, readable: ratio >= WCAG_AA_NORMAL };
    } catch {
      return { field, ratio: null, readable: false };
    }
  });
