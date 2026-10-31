/**
 * Contraste WCAG 2.x (M3-T02) — ratio de luminance entre deux couleurs sRGB.
 *
 * Sert à GARANTIR la lisibilité des thèmes CV : le thème par défaut (anthracite
 * D2) et, à terme, tout thème custom validé à l'enregistrement (éditeur de thème
 * M3) doivent respecter le seuil AA. Pur, déterministe, sans dépendance — même
 * discipline que le reste du package.
 *
 * Formule : luminance relative WCAG (linéarisation sRGB + pondération
 * 0.2126/0.7152/0.0722), ratio = (L_clair + 0.05) / (L_sombre + 0.05).
 */

/** Seuil AA pour le texte courant (< 18px, ou < 14px gras). */
export const WCAG_AA_NORMAL = 4.5;
/** Seuil AA pour le grand texte (≥ 18px, ou ≥ 14px gras). */
export const WCAG_AA_LARGE = 3;

/** `#RRGGBB` strict (contrat `HexColor`) — aligné sur la validation de theme.ts. */
const HEX_RE = /^#([0-9a-fA-F]{6})$/;

/** Linéarise une composante sRGB 8 bits (0-255) en lumière physique (0-1). */
function channelLinear(value8: number): number {
  const c = value8 / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminance relative WCAG d'une couleur `#RRGGBB` (0 = noir, 1 = blanc). */
export function relativeLuminance(hex: string): number {
  const match = HEX_RE.exec(typeof hex === "string" ? hex.trim() : "");
  if (!match)
    throw new Error(`Couleur hex invalide (attendu #RRGGBB) : ${String(hex)}`);
  const n = parseInt(match[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return (
    0.2126 * channelLinear(r) +
    0.7152 * channelLinear(g) +
    0.0722 * channelLinear(b)
  );
}

/**
 * Ratio de contraste WCAG entre deux couleurs `#RRGGBB`, dans [1, 21].
 * Commutatif (l'ordre des arguments n'importe pas).
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
