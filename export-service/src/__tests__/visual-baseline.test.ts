/**
 * M2-T10 / M3 — baseline de non-régression VISUELLE : les 3 fixtures canoniques
 * × CHAQUE template livré, rasterisées depuis le PDF RÉEL (pdfjs +
 * @napi-rs/canvas) et comparées aux PNG de référence commités (__baselines__/,
 * pixelmatch). Nommage `${templateId}-${fixture}.png`.
 *
 * - Seuil : < 0,5 % de pixels différents (anti-crénelage toléré, une vraie
 *   régression de template/CSS/fit dépasse largement).
 * - Régénération : `UPDATE_VISUAL_BASELINE=1 npx vitest run visual-baseline`
 *   — à faire SCIEMMENT (le diff des PNG commités est la revue).
 * - Jusqu'à M2-T16 (polices data:), le rendu dépend des polices SYSTÈME de la
 *   machine : baselines locales dev, à RÉGÉNÉRER à T16 — leur rôle immédiat
 *   est d'attraper les régressions de CODE. Réutilisée en M3/M10.
 * - TEMPLATES : chaque ticket de finitions de template (M3-T02/T04/T06…) ajoute
 *   son id ici ET committe ses 3 baselines. Thème = défaut anthracite (D2) pour
 *   tous (le contraste de ce thème est garanti par cv-render/contrast.test).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { GeneratedCVData } from "@talentious/cv-render";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadCvCss } from "../render/css.js";
import { buildCvDocumentHtml } from "../render/document.js";
import { normalizePdfMetadata } from "../render/metadata.js";
import {
  assertChromiumAvailable,
  createPdfRenderer,
  type PdfRenderer,
} from "../render/pdf.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const baselineDir = join(here, "__baselines__");
const FIXTURES = ["minimal", "complete", "dense"] as const;
// Templates sous baseline visuelle. Un template y entre à son ticket de
// finitions (M3-T02 : corporate_sobre), avec ses 3 PNG de référence committés.
const TEMPLATES = ["modern_sobre", "corporate_sobre"] as const;
const RASTER_SCALE = 2; // ≈1588×2246 px par page A4
const MAX_DIFF_RATIO = 0.005;

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

/** Rasterise la page 1 du PDF en RGBA (pdfjs + @napi-rs/canvas). */
async function rasterizeFirstPage(pdf: Buffer): Promise<{
  width: number;
  height: number;
  data: Uint8ClampedArray;
  png: Buffer;
}> {
  const { createCanvas } = await import("@napi-rs/canvas");
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(pdf) }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: RASTER_SCALE });
  const canvas = createCanvas(
    Math.round(viewport.width),
    Math.round(viewport.height),
  );
  const ctx = canvas.getContext("2d");
  await page.render({
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasContext: ctx as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return {
    width: canvas.width,
    height: canvas.height,
    data: image.data,
    png: canvas.toBuffer("image/png"),
  };
}

async function decodePng(
  png: Buffer,
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, image.width, image.height);
  return { width: image.width, height: image.height, data: pixels.data };
}

describe.skipIf(!chromiumAvailable)("baseline visuelle (M2-T10)", () => {
  let renderer: PdfRenderer;

  beforeAll(async () => {
    renderer = await createPdfRenderer();
  }, 60_000);

  afterAll(async () => {
    await renderer?.close();
  });

  for (const templateId of TEMPLATES) {
    for (const fixture of FIXTURES) {
      it(`${templateId} / « ${fixture} » : diff raster sous ${MAX_DIFF_RATIO * 100} % vs baseline`, async () => {
        const cv = JSON.parse(
          readFileSync(
            join(repoRoot, "fixtures", "cv-reference", `${fixture}.json`),
            "utf8",
          ),
        ) as GeneratedCVData;
        const html = buildCvDocumentHtml({
          cvContent: cv,
          templateId,
          theme: anthracite,
          language: "fr",
          css: loadCvCss(),
        });
        const pdf = await normalizePdfMetadata(await renderer.render(html));
        const raster = await rasterizeFirstPage(pdf);

        const baselinePath = join(baselineDir, `${templateId}-${fixture}.png`);
        if (process.env.UPDATE_VISUAL_BASELINE) {
          mkdirSync(baselineDir, { recursive: true });
          writeFileSync(baselinePath, raster.png);
          console.info(
            `baseline régénérée : ${baselinePath} (${raster.png.length} octets)`,
          );
          return;
        }
        if (!existsSync(baselinePath)) {
          throw new Error(
            `Baseline absente : ${baselinePath} — générer avec UPDATE_VISUAL_BASELINE=1 ` +
              "et COMMITTER le PNG (le diff du PNG est la revue).",
          );
        }
        const baseline = await decodePng(readFileSync(baselinePath));
        expect(
          { width: raster.width, height: raster.height },
          "géométrie de page changée : régénérer sciemment la baseline",
        ).toEqual({ width: baseline.width, height: baseline.height });

        const { default: pixelmatch } = await import("pixelmatch");
        const differing = pixelmatch(
          baseline.data,
          raster.data,
          undefined,
          raster.width,
          raster.height,
          { threshold: 0.1 },
        );
        const ratio = differing / (raster.width * raster.height);
        expect(
          ratio,
          `${(ratio * 100).toFixed(3)} % de pixels diffèrent`,
        ).toBeLessThan(MAX_DIFF_RATIO);
      }, 120_000);
    }
  }
});
