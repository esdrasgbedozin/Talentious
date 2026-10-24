/**
 * M2-T04 — SSR du package => document HTML complet + CSP restrictive.
 *
 * Critères du ticket : HTML sans script (distant OU inline), contenu hostile
 * échappé Y COMPRIS en contexte attribut (DET-M0-AC1), CSP présente. Routages
 * revue sécu T03 : aucun `href` dans le document (les URL du contenu sont du
 * TEXTE — toute future fonctionnalité « lien » exigera une liste blanche de
 * schémas, gravée dans ADR-RENDER-SECURITY), `optimization_notes` jamais
 * rendu (BLK-5), contrôle/bidi neutralisés.
 *
 * `buildCvDocumentHtml` est une fonction PURE (le CSS est un paramètre) : les
 * tests n'exigent pas le build Tailwind — css.test.ts couvre le chargement réel.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { TEMPLATE_IDS } from "@talentious/cv-render";
import type { GeneratedCVData } from "@talentious/cv-render";

import { buildCvDocumentHtml, CV_PDF_CSP } from "../render/document.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const denseCv = JSON.parse(
  readFileSync(join(repoRoot, "fixtures", "cv-reference", "dense.json"), "utf8"),
) as Record<string, unknown>;

const anthracite = {
  color_accent: "#2D3748",
  color_text: "#1A202C",
  color_muted: "#4A5568",
  color_background: "#FFFFFF",
  font_heading: "Inter",
  font_body: "Inter",
} as const;

const FAKE_CSS = "/* css-build-m0t14 */ .cv-sheet{position:relative}";

function buildDoc(overrides: Record<string, unknown> = {}, templateId = "modern_sobre"): string {
  // Fixture JSON (non typée) + payloads HOSTILES hors schéma : cast assumé —
  // au runtime, la frontière ajv (T03) garantit la forme avant ce module.
  const cv = { ...structuredClone(denseCv), ...overrides } as unknown as GeneratedCVData;
  return buildCvDocumentHtml({
    cvContent: cv,
    templateId,
    theme: anthracite,
    language: "fr",
    css: FAKE_CSS,
  });
}

describe("buildCvDocumentHtml — document nominal", () => {
  it("document complet : doctype, lang, charset, CSS embarqué, contenu rendu", () => {
    const html = buildDoc();
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('<meta charset="utf-8"');
    expect(html).toContain(FAKE_CSS);
    const p = (denseCv as { personal_info: { first_name: string } }).personal_info;
    expect(html).toContain(p.first_name);
  });

  it("la CSP est présente en meta, interdit tout par défaut et les scripts EXPLICITEMENT", () => {
    const html = buildDoc();
    expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="${CV_PDF_CSP}"`);
    expect(CV_PDF_CSP).toContain("default-src 'none'");
    // Revue T04 : on verrouille l'EFFET (script-src 'none'), pas l'absence de
    // directive — un futur élargissement de default-src ne rouvre jamais les scripts.
    expect(CV_PDF_CSP).toContain("script-src 'none'");
  });

  it("locale en : lang et libellés anglais rendus", () => {
    const html = buildCvDocumentHtml({
      cvContent: structuredClone(denseCv) as unknown as GeneratedCVData,
      templateId: "modern_sobre",
      theme: anthracite,
      language: "en",
      css: FAKE_CSS,
    });
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("Professional Experience");
  });

  it("titre NEUTRE : le nom du candidat n'apparaît pas dans <title> (déterminisme T07, zéro reflet)", () => {
    const html = buildDoc();
    expect(html).toContain("<title>CV</title>");
  });

  it("déterminisme : deux rendus du même payload sont identiques octet pour octet", () => {
    expect(buildDoc()).toBe(buildDoc());
  });

  it("template_id inconnu : repli modern_sobre, le rendu ne casse jamais", () => {
    const html = buildDoc({}, "template_inexistant");
    expect(html).toContain("cv-sheet");
  });

  it("le thème validé est injecté en variables CSS scopées", () => {
    const html = buildDoc();
    expect(html).toContain("--cv-accent:#2D3748");
  });
});

describe("buildCvDocumentHtml — surface d'attaque (DET-M0-AC1)", () => {
  it("AUCUN <script> dans le document (ni distant ni inline)", () => {
    const html = buildDoc();
    expect(html.toLowerCase()).not.toContain("<script");
  });

  it("AUCUN href ni <a> : une URL javascript: reste du texte inerte", () => {
    const html = buildDoc({
      personal_info: {
        ...(denseCv as { personal_info: object }).personal_info,
        linkedin: "javascript:alert(document.cookie)",
      },
    });
    // L'URL hostile est AFFICHÉE (contenu du CV) mais ne peut être qu'inerte :
    // zéro lien dans tout le document — un futur ticket « liens cliquables »
    // devra imposer la liste blanche https?: (ADR-RENDER-SECURITY).
    expect(html).not.toContain("href");
    expect(html.toLowerCase()).not.toContain("<a ");
    expect(html).toContain("javascript:alert(document.cookie)");
  });

  it("balise hostile dans le texte : échappée, jamais interprétable", () => {
    const html = buildDoc({ summary: '<script>alert(1)</script><img src=x onerror=alert(2)>' });
    expect(html.toLowerCase()).not.toContain("<script");
    expect(html.toLowerCase()).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("contexte ATTRIBUT : une chaîne piégée ne peut pas fermer un attribut ni en poser un", () => {
    const hostile = '"><script>alert(1)</script> onmouseover="alert(2)';
    const html = buildDoc({
      summary: hostile,
      personal_info: {
        ...(denseCv as { personal_info: object }).personal_info,
        first_name: hostile,
      },
    });
    expect(html.toLowerCase()).not.toContain("<script");
    // La séquence `">` n'existe nulle part NON échappée issue du contenu :
    // React n'émet le contenu utilisateur qu'en contexte texte (&quot;&gt;).
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("optimization_notes n'apparaît JAMAIS dans le document (BLK-5)", () => {
    const html = buildDoc({ optimization_notes: "NOTE_INTERNE_EXFILTRATION_BLK5" });
    expect(html).not.toContain("NOTE_INTERNE_EXFILTRATION_BLK5");
  });

  it("contrôle + bidi neutralisés avant rendu ; \\n du contenu conservé", () => {
    const html = buildDoc({ summary: "A\u0000B\u202Eevil\u2066C\nligne2" });
    expect(html).not.toContain("\u202E");
    expect(html).not.toContain("\u2066");
    expect(html).not.toContain("\u0000");
    expect(html).toContain("ABevilC\nligne2");
  });

  it("langue hors liste blanche ⇒ échec explicite (seul attribut interpolé hors React)", () => {
    expect(() =>
      buildCvDocumentHtml({
        cvContent: structuredClone(denseCv) as unknown as GeneratedCVData,
        templateId: "modern_sobre",
        theme: anthracite,
        language: '"><script>alert(1)</script>' as never,
        css: FAKE_CSS,
      }),
    ).toThrow(/[Ll]angue/);
  });

  it("MARQUEUR PROFOND : aucune chaîne du payload n'atteint une balise, sur TOUS les templates", () => {
    // Preuve STRUCTURELLE de l'invariant ADR décision 1 (revue T04) : chaque
    // chaîne du contenu porte un marqueur ; s'il apparaît entre < et >, une
    // chaîne utilisateur a atteint un attribut (ou un nom de balise).
    const MARK = "MARQUEUR9ATTR7F3";
    let n = 0;
    function markStrings(value: unknown): unknown {
      if (typeof value === "string") return `${MARK}n${(n += 1)}`;
      if (Array.isArray(value)) return value.map(markStrings);
      if (value !== null && typeof value === "object") {
        return Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k, markStrings(v)]),
        );
      }
      return value;
    }
    const marked = markStrings(structuredClone(denseCv)) as GeneratedCVData;
    for (const templateId of TEMPLATE_IDS) {
      const html = buildCvDocumentHtml({
        cvContent: marked,
        templateId,
        theme: anthracite,
        language: "fr",
        css: FAKE_CSS,
      });
      expect(html).toContain(MARK); // rendu en texte…
      expect(html).not.toMatch(new RegExp(`<[^>]*${MARK}`)); // …jamais dans une balise
    }
  });

  it("le CSS embarqué ne peut pas fermer son <style> (garde d'intégration)", () => {
    expect(() =>
      buildCvDocumentHtml({
        cvContent: structuredClone(denseCv) as unknown as GeneratedCVData,
        templateId: "modern_sobre",
        theme: anthracite,
        language: "fr",
        css: "body{} </style><script>alert(1)</script>",
      }),
    ).toThrow(/style/i);
  });
});
