/**
 * Normalisation du contenu AVANT rendu (M2-T04, revue sécu T03 point d,
 * étendue en revue T04). La validation ajv (T03) borne types, longueurs et
 * champs — mais aucun pattern n'exclut les caractères invisibles des chaînes
 * LIBRES (summary, descriptions…). Ici on neutralise, sur toute chaîne :
 *
 * - contrôles C0/C1 (NUL, BEL, DEL, NEL…) sauf \n et \t — \r\n, \r, U+2028 et
 *   U+2029 sont normalisés en \n (le rendu s'appuie sur whitespace-pre-line) ;
 * - bidi : overrides/embeddings/isolats (U+202A–U+202E, U+2066–U+2069) ET
 *   marques directionnelles (U+200E, U+200F, U+061C) — spoofing visuel type
 *   « cv[U+202E]fdp.exe » dans un PDF ;
 * - largeur nulle : U+200B (ZWSP), U+2060 (WJ), U+FEFF (BOM), U+00AD (soft
 *   hyphen), U+180E — bourrage de mots-clés invisibles, extraction ATS cassée.
 *   ZWJ/ZWNJ (U+200C/U+200D) sont CONSERVÉS : légitimes (emojis, écritures
 *   indiennes/persanes) ;
 * - caractères Tag U+E0000–U+E007F (« ASCII smuggling » invisible dans un
 *   pipeline IA), sélecteurs de variation U+E0100–U+E01EF, non-caractères
 *   U+FDD0–U+FDEF et U+FFFE/U+FFFF ;
 * - surrogates isolés : String.toWellFormed() (Node ≥ 20) avant les regex.
 *
 * Toutes les plages sont écrites en échappements \u : AUCUN caractère bidi
 * littéral dans ce fichier (vecteur Trojan Source — revue T04).
 * Décision tracée dans ADR-RENDER-SECURITY (décision 3).
 */

const STRIPPED_BMP =
  // eslint-disable-next-line no-control-regex -- les contrôles sont PRÉCISÉMENT la cible
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF\uFDD0-\uFDEF\uFFFE\uFFFF]/g;
// Hors BMP (flag u requis) : Tags + sélecteurs de variation.
// eslint-disable-next-line no-misleading-character-class -- ces combinants sont PRÉCISÉMENT la cible
const STRIPPED_ASTRAL = /[\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu;
const LINE_BREAKS = /\r\n|[\r\u2028\u2029]/g;

function sanitizeString(value: string): string {
  return value
    .toWellFormed()
    .replace(LINE_BREAKS, "\n")
    .replace(STRIPPED_BMP, "")
    .replace(STRIPPED_ASTRAL, "");
}

/** Copie profonde du payload avec toutes les chaînes normalisées (l'entrée n'est jamais mutée). */
export function sanitizeForRender<T>(value: T): T {
  if (typeof value === "string") return sanitizeString(value) as T;
  if (Array.isArray(value))
    return value.map((item) => sanitizeForRender(item)) as T;
  if (value !== null && typeof value === "object") {
    // Object.fromEntries pose les clés en DATA properties : une clé __proto__
    // ne peut pas toucher le prototype (défense par construction — Fastify la
    // rejette déjà en amont).
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        sanitizeForRender(child),
      ]),
    ) as T;
  }
  return value;
}
