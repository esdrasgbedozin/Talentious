/**
 * Thème CV → variables CSS CV-scopées (M0-T09, ADR-THEME-DECOUPLED).
 *
 * Le rendu du CV ne lit JAMAIS les tokens globaux de l'app : il suit les
 * variables `--cv-*` produites ici depuis le snapshot `CVThemeTokens` du
 * document (contrat openapi, source de vérité). Le serveur valide strictement
 * les thèmes à l'enregistrement, mais ce module alimente aussi Chromium
 * (export-service, M2) : defense in depth, toute valeur non strictement
 * conforme (couleur hors `#RRGGBB`, police hors liste blanche) retombe sur le
 * défaut anthracite — rien d'autre que des valeurs sûres n'est interpolé en CSS
 * (anti-injection).
 */
import type { components } from './generated/api';

type CVThemeTokens = components['schemas']['CVThemeTokens'];
type CVFontFamily = components['schemas']['CVFontFamily'];

/** Thème par défaut : anthracite quasi-monochrome (décision D2, Bible V2). */
export const DEFAULT_CV_THEME_TOKENS: CVThemeTokens = {
  color_accent: '#2D3748',
  color_text: '#1A202C',
  color_muted: '#4A5568',
  color_background: '#FFFFFF',
  font_heading: 'Inter',
  font_body: 'Inter',
};

/** Liste blanche des polices du contrat (`CVFontFamily`) ; `satisfies` garantit
 * qu'elle reste alignée sur l'enum généré — toute dérive casse la compilation.
 * Exportée (M0-T16) : les polices EMBARQUÉES (manifeste `scripts/fonts.manifest.json`)
 * doivent couvrir exactement cette liste — testé dans css-build.test. */
export const CV_FONT_FAMILIES = [
  'Inter',
  'Source Sans 3',
  'IBM Plex Sans',
  'Work Sans',
  'Source Serif 4',
  'Lora',
  'Merriweather',
  'IBM Plex Serif',
] as const satisfies readonly CVFontFamily[];

const SERIF_FONTS: ReadonlySet<CVFontFamily> = new Set([
  'Source Serif 4',
  'Lora',
  'Merriweather',
  'IBM Plex Serif',
]);

/** `#RRGGBB` strict (contrat `HexColor`) — anti-injection CSS. */
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function safeColor(value: unknown, fallback: string): string {
  const s = typeof value === 'string' ? value.trim() : '';
  return HEX_RE.test(s) ? s : fallback;
}

function fontStack(font: CVFontFamily): string {
  return `"${font}", ${SERIF_FONTS.has(font) ? 'serif' : 'sans-serif'}`;
}

function safeFontStack(value: unknown, fallback: CVFontFamily): string {
  const s = typeof value === 'string' ? value.trim() : '';
  const font = (CV_FONT_FAMILIES as readonly string[]).includes(s)
    ? (s as CVFontFamily)
    : fallback;
  return fontStack(font);
}

/**
 * Convertit un snapshot `CVThemeTokens` en variables CSS CV-scopées, prêtes à
 * poser en `style` sur la racine du rendu. Sans thème (null/undefined), le
 * défaut anthracite s'applique intégralement.
 */
export function themeToCssVars(tokens?: CVThemeTokens | null): Record<string, string> {
  const t = tokens ?? DEFAULT_CV_THEME_TOKENS;
  const d = DEFAULT_CV_THEME_TOKENS;
  return {
    '--cv-accent': safeColor(t.color_accent, d.color_accent),
    '--cv-text': safeColor(t.color_text, d.color_text),
    '--cv-muted': safeColor(t.color_muted, d.color_muted),
    '--cv-background': safeColor(t.color_background, d.color_background),
    '--cv-font-heading': safeFontStack(t.font_heading, d.font_heading),
    '--cv-font-body': safeFontStack(t.font_body, d.font_body),
  };
}
