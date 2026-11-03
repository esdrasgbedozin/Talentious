/**
 * M3-T02 — contraste du thème par défaut conforme (DoD).
 *
 * Verrouille à la fois l'util WCAG (valeurs connues, dents du détecteur) et le
 * critère métier : le thème par défaut anthracite (D2, DEFAULT_CV_THEME_TOKENS)
 * respecte le seuil AA texte courant (4.5:1) pour CHAQUE couleur d'encre posée
 * sur le fond. Une dérive du thème par défaut qui casserait la lisibilité fait
 * échouer ce test.
 */
import { WCAG_AA_NORMAL, contrastRatio, relativeLuminance } from "./contrast";
import { DEFAULT_CV_THEME_TOKENS } from "./theme";

describe("contrastRatio — util WCAG", () => {
  it("valeurs connues : noir/blanc = 21, identique = 1", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 2);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("est commutatif (l'ordre des arguments n'importe pas)", () => {
    expect(contrastRatio("#1A202C", "#FFFFFF")).toBeCloseTo(
      contrastRatio("#FFFFFF", "#1A202C"),
      10,
    );
  });

  it("a des dents : un gris clair sur blanc échoue le seuil AA", () => {
    // #AAAAAA sur blanc ≈ 2.3:1 — sous 4.5, doit être détecté non conforme.
    expect(contrastRatio("#AAAAAA", "#FFFFFF")).toBeLessThan(WCAG_AA_NORMAL);
  });

  it("rejette une couleur hors #RRGGBB", () => {
    expect(() => relativeLuminance("red")).toThrow();
    expect(() => relativeLuminance("#FFF")).toThrow();
    expect(() => contrastRatio("#GGGGGG", "#FFFFFF")).toThrow();
  });
});

describe("thème par défaut (anthracite D2) — conforme AA texte courant", () => {
  const { color_background, color_text, color_accent, color_muted } =
    DEFAULT_CV_THEME_TOKENS;

  it.each([
    ["texte", color_text],
    ["accent (titres de section)", color_accent],
    ["muted (métadonnées, dates)", color_muted],
  ])("l'encre « %s » sur le fond atteint ≥ 4.5:1", (_label, ink) => {
    expect(contrastRatio(ink, color_background)).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL,
    );
  });
});
