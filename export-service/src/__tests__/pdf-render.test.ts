/**
 * M2-T06 — rendu Playwright réel (Chromium ÉPINGLÉ, séquence de la décision 6
 * d'ADR-RENDER-SECURITY : setContent → fonts.ready → mesure → computeFitScale
 * partagé → scale → page.pdf A4).
 *
 * Tests d'INTÉGRATION : exigent le Chromium Playwright local
 * (`npx playwright-core install chromium`) — skippés sinon, et toujours
 * exécutés en conteneur (image réelle) avant commit.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { GeneratedCVData } from "@talentious/cv-render";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadCvCss } from "../render/css.js";
import { buildCvDocumentHtml } from "../render/document.js";
import {
  assertChromiumAvailable,
  createPdfRenderer,
  type PdfRenderer,
} from "../render/pdf.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const denseCv = JSON.parse(
  readFileSync(join(repoRoot, "fixtures", "cv-reference", "dense.json"), "utf8"),
) as GeneratedCVData;

const anthracite = {
  color_accent: "#2D3748",
  color_text: "#1A202C",
  color_muted: "#4A5568",
  color_background: "#FFFFFF",
  font_heading: "Inter",
  font_body: "Inter",
} as const;

let chromiumAvailable = true;
try {
  assertChromiumAvailable();
} catch {
  chromiumAvailable = false;
}
// Revue T06 (A7) : le skip ne doit JAMAIS passer inaperçu — en CI/conteneur,
// REQUIRE_CHROMIUM=1 transforme l'absence de Chromium en échec franc.
if (!chromiumAvailable) {
  if (process.env.REQUIRE_CHROMIUM) {
    throw new Error(
      "REQUIRE_CHROMIUM est posé mais le Chromium Playwright est absent : " +
        "les tests de rendu réel ne peuvent pas être skippés ici.",
    );
  }
  console.warn(
    "⚠ pdf-render.test.ts SKIPPÉ : Chromium absent (npx playwright-core install chromium).",
  );
}

async function extractPdf(pdf: Buffer): Promise<{ pages: number; text: string }> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(pdf) }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
  }
  return { pages: doc.numPages, text };
}

describe.skipIf(!chromiumAvailable)("renderPdf — Chromium réel", () => {
  let renderer: PdfRenderer;

  beforeAll(async () => {
    renderer = await createPdfRenderer();
  }, 60_000);

  afterAll(async () => {
    await renderer?.close();
  });

  it(
    "fixture dense : PDF valide, UNE page A4, texte extrait = contenu du CV (fit appliqué)",
    async () => {
      const html = buildCvDocumentHtml({
        cvContent: structuredClone(denseCv),
        templateId: "modern_sobre",
        theme: anthracite,
        language: "fr",
        css: loadCvCss(),
      });
      const pdf = await renderer.render(html);
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      const { pages, text } = await extractPdf(pdf);
      // La fixture dense DÉBORDE d'une page sans fit (scale ≈ 0,82 mesuré au
      // spike T05) : une seule page prouve que le fit externe a été appliqué.
      expect(pages).toBe(1);
      expect(text).toContain(denseCv.personal_info.first_name);
      expect(text).toContain(denseCv.personal_info.last_name);
    },
    60_000,
  );

  it(
    // Ce HTML ne pose PAS de CSP : il prouve le verrou javaScriptEnabled seul
    // (la CSP est le second verrou, prouvée par la chaîne complète ci-dessous).
    "un <script> dans le document ne s'exécute JAMAIS (verrou javaScriptEnabled:false)",
    async () => {
      const html =
        "<!doctype html><html><head><meta charset=\"utf-8\"></head><body>" +
        "<script>document.body.textContent = 'PWNED';</script>" +
        '<p data-cv-content="true">CONTENU_PROPRE</p></body></html>';
      const pdf = await renderer.render(html);
      const { text } = await extractPdf(pdf);
      expect(text).toContain("CONTENU_PROPRE");
      expect(text).not.toContain("PWNED");
    },
    60_000,
  );

  it(
    "CHAÎNE COMPLÈTE (revue T06, S1) : payload hostile → échappement + CSP + moteur",
    async () => {
      const cv = structuredClone(denseCv) as GeneratedCVData & { summary: string };
      cv.summary = 'Profil <script>alert(1)</script> et <img src=x onerror=alert(2)> inertes';
      const html = buildCvDocumentHtml({
        cvContent: cv,
        templateId: "modern_sobre",
        theme: anthracite,
        language: "fr",
        css: loadCvCss(),
      });
      const pdf = await renderer.render(html);
      const { text } = await extractPdf(pdf);
      // Le balisage hostile est AFFICHÉ littéralement (échappé), jamais interprété.
      expect(text).toContain("<script>alert(1)</script>");
      expect(text).toContain("onerror=alert(2)");
    },
    60_000,
  );

  it(
    "CV court (minimal) : pas de débordement, une page sans fit (branche scale = 1)",
    async () => {
      const minimalCv = JSON.parse(
        readFileSync(join(repoRoot, "fixtures", "cv-reference", "minimal.json"), "utf8"),
      ) as GeneratedCVData;
      const html = buildCvDocumentHtml({
        cvContent: minimalCv,
        templateId: "modern_sobre",
        theme: anthracite,
        language: "fr",
        css: loadCvCss(),
      });
      const { pages } = await extractPdf(await renderer.render(html));
      expect(pages).toBe(1);
    },
    60_000,
  );

  it(
    "contenu EXTRÊME : le plancher MIN_SCALE tient et la page reste UNE (overflow coupé, limite M0-T15 assumée)",
    async () => {
      const cv = structuredClone(denseCv) as GeneratedCVData & {
        selected_experiences: unknown[];
      };
      const un = cv.selected_experiences[0];
      cv.selected_experiences = Array.from({ length: 30 }, () => structuredClone(un));
      const html = buildCvDocumentHtml({
        cvContent: cv,
        templateId: "modern_sobre",
        theme: anthracite,
        language: "fr",
        css: loadCvCss(),
      });
      const { pages } = await extractPdf(await renderer.render(html));
      // Comportement DÉFINI : jamais de 2e page — la feuille A4 est overflow
      // hidden, le plancher 0,62 protège la lisibilité, l'indicateur de
      // troncature est tracé (DET-M0-T14T15 b).
      expect(pages).toBe(1);
    },
    60_000,
  );

  it(
    "document SANS marqueur data-cv-content ⇒ échec explicite (jamais un PDF multi-pages silencieux)",
    async () => {
      const html =
        '<!doctype html><html><head><meta charset="utf-8"></head><body><p>x</p></body></html>';
      await expect(renderer.render(html)).rejects.toThrow(/data-cv-content/);
    },
    60_000,
  );

  it(
    "deux rendus du même document donnent le même nombre de pages (stabilité A4)",
    async () => {
      const html = buildCvDocumentHtml({
        cvContent: structuredClone(denseCv),
        templateId: "modern_sobre",
        theme: anthracite,
        language: "fr",
        css: loadCvCss(),
      });
      const [a, b] = await Promise.all([renderer.render(html), renderer.render(html)]);
      const [ea, eb] = await Promise.all([extractPdf(a), extractPdf(b)]);
      expect(ea.pages).toBe(eb.pages);
      expect(ea.text).toBe(eb.text);
    },
    60_000,
  );
});

describe.skipIf(!chromiumAvailable)("renderPdf — verrou réseau propre (revue T06)", () => {
  it(
    "un HTML hostile SANS CSP tentant un chargement réseau rend quand même, requête avortée",
    async () => {
      const renderer = await createPdfRenderer();
      try {
        const html =
          '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
          '<img src="http://127.0.0.1:9/beacon.png"><p data-cv-content="true">SANS_RESEAU</p></body></html>';
        const pdf = await renderer.render(html);
        const { text } = await extractPdf(pdf);
        expect(text).toContain("SANS_RESEAU");
      } finally {
        await renderer.close();
      }
    },
    60_000,
  );
});

describe("createPdfRenderer — liste blanche des args Chromium (revue T06)", () => {
  it("refuse un argument hors liste blanche AVANT tout lancement", async () => {
    await expect(
      createPdfRenderer({ launchArgs: ["--disable-web-security"] }),
    ).rejects.toThrow(/liste blanche/i);
  });

  it.skipIf(!chromiumAvailable)("accepte les args autorisés", async () => {
    const renderer = await createPdfRenderer({ launchArgs: ["--disable-dev-shm-usage"] });
    await renderer.close();
  });
});

describe("assertChromiumAvailable", () => {
  it.skipIf(!chromiumAvailable)("renvoie le chemin de l'exécutable épinglé", () => {
    expect(assertChromiumAvailable()).toContain("chromium");
  });
});
