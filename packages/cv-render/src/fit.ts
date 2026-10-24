/**
 * Auto-fit isolé (M0-T15) — la logique d'ajustement une-page sortie de
 * CVRenderer en fonctions pures/testables, et le signal de rendu stable
 * `window.__CV_READY__` attendu par l'export-service (M2) avant `page.pdf()`.
 *
 * R1 tranché par le spike M2-T05 (ADR-RENDER-SECURITY, décision 6) : côté
 * export, le JS de page est DÉSACTIVÉ — l'export-service mesure et applique le
 * fit DE L'EXTÉRIEUR via CDP, avec ce même `computeFitScale` et la géométrie
 * exportée ci-dessous. `__CV_READY__` reste le signal de l'aperçu Next
 * uniquement.
 */

/** Géométrie A4 du rendu (mm, 96 dpi) — UNIQUE source de vérité, partagée par
 * CVRenderer (aperçu) et par la mesure CDP de l'export-service (M2-T06). */
export const A4_GEOMETRY = {
  widthMm: 210,
  heightMm: 297,
  padYMm: 14,
  padXMm: 16,
  mmToPx: 96 / 25.4,
} as const;

/** Hauteur utile du contenu (px CSS) : la cible du fit une-page. */
export const A4_AVAILABLE_CONTENT_HEIGHT_PX =
  (A4_GEOMETRY.heightMm - 2 * A4_GEOMETRY.padYMm) * A4_GEOMETRY.mmToPx;

/** Attribut posé sur le conteneur de contenu mesurable : le sélecteur STABLE
 * de la mesure CDP côté export-service (jamais un sélecteur structurel). */
export const CV_CONTENT_ATTR = 'data-cv-content';

/** Style du fit une-page — PARTAGÉ aperçu (CVRenderer) / export (pose CDP) :
 * « aperçu = PDF » exige le transform et l'origine STRICTEMENT identiques. */
export function fitTransform(scale: number): {
  transform: string | undefined;
  transformOrigin: string;
} {
  return {
    transform: scale < 1 ? `scale(${scale})` : undefined,
    transformOrigin: 'top center',
  };
}

/** Plancher d'échelle : en-dessous, le CV est illisible — l'utilisateur doit
 * raccourcir son contenu plutôt que subir un zoom arrière extrême. */
export const MIN_SCALE = 0.62;

/** Nom de la propriété globale posée quand le rendu est stable — à réutiliser
 * par l'export-service : `page.waitForFunction('window.__CV_READY__ === true')`.
 * CONTRAT : une seule instance de CVRenderer par document d'export (page
 * Chromium neuve par export) — avec plusieurs instances dans la même fenêtre
 * (aperçus, vignettes), la première prête signale pour toutes et le dernier
 * démontage retire le signal. */
export const CV_READY_FLAG = '__CV_READY__' as const;

/** Plafond d'attente de `fonts.ready` : au-delà, on signale quand même — une
 * police qui pend (réseau) ne doit jamais suspendre un export (revue sécurité
 * T14+T15). L'export-service garde SES propres timeouts (waitForFunction + job). */
export const FONTS_READY_TIMEOUT_MS = 5000;

declare global {
  interface Window {
    /** Posé par CVRenderer après `fonts.ready` ET le re-fit qui suit :
     * le document est prêt à être imprimé (export-service M2). */
    __CV_READY__?: true;
  }
}

/**
 * Facteur d'échelle du fit-to-page : réduit (jamais n'agrandit) le contenu pour
 * tenir dans la hauteur utile, borné par MIN_SCALE. Pure et déterministe.
 * Toute mesure non exploitable (0, négative, non finie) rend 1 : un document
 * hostile ou un environnement sans layout (jsdom, SSR) ne produit jamais un
 * transform invalide.
 */
export function computeFitScale(naturalHeightPx: number, availableHeightPx: number): number {
  if (!Number.isFinite(naturalHeightPx) || naturalHeightPx <= 0) return 1;
  if (!Number.isFinite(availableHeightPx) || availableHeightPx <= 0) return 1;
  const ratio = Math.min(1, availableHeightPx / naturalHeightPx);
  return ratio < MIN_SCALE ? MIN_SCALE : ratio;
}

/**
 * Résout quand les polices du document sont chargées, au plus tard après
 * `timeoutMs`. Toujours résolue, jamais rejetée : sans `document.fonts`
 * (jsdom, vieux moteurs), si `fonts.ready` échoue OU si elle ne se règle
 * jamais (police distante qui pend), on continue — un export ne doit jamais
 * rester suspendu sur ce point d'attente (disponibilité M2).
 */
export function whenFontsReady(
  doc: Document,
  timeoutMs: number = FONTS_READY_TIMEOUT_MS,
): Promise<void> {
  const fonts = (doc as { fonts?: { ready?: Promise<unknown> } }).fonts;
  const ready = fonts?.ready;
  if (!ready || typeof ready.then !== 'function') return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    const settle = () => {
      clearTimeout(timer);
      resolve();
    };
    ready.then(settle, settle);
  });
}

/** Pose le signal de rendu stable sur la fenêtre hôte. */
export function signalCVReady(target: Window): void {
  target.__CV_READY__ = true;
}
