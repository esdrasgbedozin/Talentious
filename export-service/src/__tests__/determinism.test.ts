/**
 * M2-T07 — déterminisme du document (D6) : métadonnées NORMALISÉES (date
 * fixe, Creator/Producer Talentious seuls, /ID de trailer fixe) — deux rendus
 * du même payload doivent produire le même document. L'octet identique n'est
 * pas contractuel (R4), mais il est TESTÉ : s'il casse un jour (Chromium),
 * on dégradera sciemment vers la comparaison de contenu.
 *
 * Intégration Chromium réel (skipIf local, REQUIRE_CHROMIUM=1 en conteneur).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { GeneratedCVData } from "@talentious/cv-render";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadCvCss } from "../render/css.js";
import { buildCvDocumentHtml } from "../render/document.js";
import { normalizePdfMetadata, PDF_FIXED_DATE } from "../render/metadata.js";
import {
  assertChromiumAvailable,
  createPdfRenderer,
  type PdfRenderer,
} from "../render/pdf.js";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const denseCv = JSON.parse(
  readFileSync(
    join(repoRoot, "fixtures", "cv-reference", "dense.json"),
    "utf8",
  ),
) as GeneratedCVData;

const anthracite = {
  color_accent: "#2D3748",
  color_text: "#1A202C",
  color_muted: "#4A5568",
  color_background: "#FFFFFF",
  font_heading: "Inter",
  font_body: "Inter",
} as const;

/** `D:20000101000000` — forme compacte attendue dans Info (PDF_FIXED_DATE). */
const PDF_FIXED_DATE_COMPACT = PDF_FIXED_DATE.toISOString()
  .replace(/[-:T]/g, "")
  .slice(0, 14);

let chromiumAvailable = true;
try {
  assertChromiumAvailable();
} catch {
  chromiumAvailable = false;
}

function denseHtml(): string {
  return buildCvDocumentHtml({
    cvContent: structuredClone(denseCv),
    templateId: "modern_sobre",
    theme: anthracite,
    language: "fr",
    css: loadCvCss(),
  });
}

describe.skipIf(!chromiumAvailable)(
  "normalizePdfMetadata — métadonnées neutres (M2-T07)",
  () => {
    let renderer: PdfRenderer;
    let pdf: Buffer;

    beforeAll(async () => {
      renderer = await createPdfRenderer();
      pdf = await normalizePdfMetadata(await renderer.render(denseHtml()));
    }, 60_000);

    afterAll(async () => {
      await renderer?.close();
    });

    it("Creator et Producer = Talentious, titre neutre, dates FIXES", async () => {
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const doc = await getDocument({ data: new Uint8Array(pdf) }).promise;
      const { info } = (await doc.getMetadata()) as {
        info: Record<string, unknown>;
      };
      expect(info.Creator).toBe("Talentious");
      expect(info.Producer).toBe("Talentious");
      expect(info.Title).toBe("CV");
      expect(String(info.CreationDate)).toContain(PDF_FIXED_DATE_COMPACT);
      expect(String(info.ModDate)).toContain(PDF_FIXED_DATE_COMPACT);
    });

    it("aucune trace de l'outillage (Skia/Chromium) ni d'horodatage réel dans les octets", () => {
      const raw = pdf.toString("latin1");
      // Préalable : Info/catalogue EN CLAIR (useObjectStreams:false) — sinon ce
      // grep serait aveugle sur des object streams compressés (revue T07).
      expect(raw).toContain("/Creator");
      expect(raw).not.toContain("Skia");
      expect(raw).not.toContain("Chromium");
      // Assertion POSITIVE (la date fixe est là) + négative (pas la date réelle).
      expect(raw).toContain(`D:${PDF_FIXED_DATE_COMPACT}`);
      const year = String(new Date().getFullYear());
      expect(raw).not.toContain(`D:${year}`);
    });

    it("la normalisation PRÉSERVE le contenu : même texte, même nombre de pages que le brut", async () => {
      const raw = await renderer.render(denseHtml());
      const normalized = await normalizePdfMetadata(raw);
      const [a, b] = await Promise.all([extract(raw), extract(normalized)]);
      expect(b.pages).toBe(a.pages);
      expect(b.text).toBe(a.text);
    }, 60_000);

    it("aucune métadonnée résiduelle : pas de flux XMP, ni Names, ni Outlines", async () => {
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const doc = await getDocument({ data: new Uint8Array(pdf) }).promise;
      const { metadata } = (await doc.getMetadata()) as { metadata: unknown };
      expect(metadata).toBeNull();
      const raw = pdf.toString("latin1");
      expect(raw).not.toContain("/Names");
      expect(raw).not.toContain("/Outlines");
    });

    it("entrée corrompue ⇒ rejet explicite (jamais un PDF brut qui fuite)", async () => {
      await expect(
        normalizePdfMetadata(Buffer.from("pas un pdf")),
      ).rejects.toThrow();
      await expect(normalizePdfMetadata(Buffer.alloc(0))).rejects.toThrow();
    });

    it("deux rendus du même payload ⇒ documents IDENTIQUES à l'octet", async () => {
      const second = await normalizePdfMetadata(
        await renderer.render(denseHtml()),
      );
      expect(second.equals(pdf)).toBe(true);
    }, 60_000);
  },
);

async function extract(
  buffer: Buffer,
): Promise<{ pages: number; text: string }> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i += 1) {
    const content = await (await doc.getPage(i)).getTextContent();
    text += content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
  }
  return { pages: doc.numPages, text };
}
