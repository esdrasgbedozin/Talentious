/**
 * Chargement du CSS du package de rendu (packages/cv-render/dist/cv.css,
 * build Tailwind M0-T14, non versionné) — embarqué dans chaque document
 * (document.ts). Précharge AU DÉMARRAGE (server.ts) : un artefact manquant
 * fait échouer la révision, jamais un 500 par requête (revue T04).
 *
 * Résolution :
 * - `CV_RENDER_CSS_PATH` défini ⇒ candidat UNIQUE, échec explicite s'il est
 *   illisible (revue T04 : pas de repli silencieux qui ferait croire à un
 *   opérateur que son CSS est servi) ;
 * - sinon : `assets/cv.css` à côté du bundle (image de prod, copié par le
 *   Dockerfile), puis `packages/cv-render/dist/cv.css` depuis la racine du
 *   repo (dev : profondeur dist/ ou src/render/).
 * Seul ENOENT passe au candidat suivant — EACCES/EISDIR remontent tels quels.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let cached: string | undefined;

function tryRead(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

export function loadCvCss(): string {
  if (cached !== undefined) return cached;

  const override = process.env.CV_RENDER_CSS_PATH;
  if (override) {
    const css = tryRead(override);
    if (css === undefined) {
      throw new Error(`CV_RENDER_CSS_PATH défini mais illisible : ${override}`);
    }
    cached = css;
    return css;
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Image de prod : copié à côté du bundle (export-service/dist/assets/).
    join(here, "assets", "cv.css"),
    // Dev local — depuis dist/ (bundle : 2 niveaux jusqu'à la racine repo) …
    join(here, "..", "..", "packages", "cv-render", "dist", "cv.css"),
    // … ou depuis src/render/ (vitest : 3 niveaux).
    join(here, "..", "..", "..", "packages", "cv-render", "dist", "cv.css"),
  ];
  for (const candidate of candidates) {
    const css = tryRead(candidate);
    if (css !== undefined) {
      cached = css;
      return css;
    }
  }
  throw new Error(
    "cv.css introuvable : lance `npm run build:css --workspace @talentious/cv-render` " +
      `(candidats : ${candidates.join(", ")})`,
  );
}

/** Réservé aux tests : vide le cache pour rejouer la résolution. */
export function resetCvCssCacheForTests(): void {
  cached = undefined;
}
