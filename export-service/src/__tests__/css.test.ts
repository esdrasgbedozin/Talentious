/**
 * M2-T04 — chargement du CSS réel du package (packages/cv-render/dist/cv.css,
 * build M0-T14, non versionné ; garanti par vitest.globalSetup.ts).
 * Revue T04 : CV_RENDER_CSS_PATH défini = candidat UNIQUE à échec explicite
 * (jamais de repli silencieux) ; seul ENOENT passe au candidat suivant.
 */
import { afterEach, describe, expect, it } from "vitest";

import { loadCvCss, resetCvCssCacheForTests } from "../render/css.js";

afterEach(() => {
  delete process.env.CV_RENDER_CSS_PATH;
  resetCvCssCacheForTests();
});

describe("loadCvCss", () => {
  it("charge le CSS du package et le met en cache (même référence)", () => {
    const css = loadCvCss();
    expect(css).toContain(".cv-sheet");
    expect(loadCvCss()).toBe(css);
  });

  it("l'artefact réel est embarquable tel quel (pas de </style>)", () => {
    expect(loadCvCss()).not.toMatch(/<\/style/i);
  });

  it("CV_RENDER_CSS_PATH illisible ⇒ échec EXPLICITE, aucun repli silencieux", () => {
    resetCvCssCacheForTests();
    process.env.CV_RENDER_CSS_PATH = "/chemin/inexistant/cv.css";
    expect(() => loadCvCss()).toThrow(/CV_RENDER_CSS_PATH/);
  });

  it("CV_RENDER_CSS_PATH valide ⇒ ce fichier et lui seul", () => {
    resetCvCssCacheForTests();
    process.env.CV_RENDER_CSS_PATH = new URL("./fixtures-css-override.css", import.meta.url)
      .pathname;
    expect(loadCvCss()).toContain("css-override-sentinelle");
  });
});
