/**
 * M2-T11 — timeout de rendu (contrat gravé à T09, ADR décision 7) :
 * échéance GLOBALE (attente en file comprise), timeout À L'INTÉRIEUR de la
 * tâche (le contexte est fermé à l'expiration — un rendu pendu ne garde
 * JAMAIS son permis), 504 problem+json côté route sans fuite.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../app.js";
import {
  assertChromiumAvailable,
  createPdfRenderer,
  RenderTimeoutError,
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
) as Record<string, unknown>;

let chromiumAvailable = true;
try {
  assertChromiumAvailable();
} catch {
  chromiumAvailable = false;
}

describe.skipIf(!chromiumAvailable)("timeout de rendu (M2-T11)", () => {
  it("délai dépassé PENDANT le rendu ⇒ RenderTimeoutError rapide, permis libéré", async () => {
    const renderer = await createPdfRenderer({ renderTimeoutMs: 1 });
    try {
      const t0 = Date.now();
      await expect(
        renderer.render('<p data-cv-content="true">x</p>'),
      ).rejects.toThrow(RenderTimeoutError);
      expect(Date.now() - t0).toBeLessThan(5_000);
    } finally {
      await renderer.close();
    }
  }, 60_000);

  it("permis LIBÉRÉ après timeout : sur le MÊME renderer (concurrence 1), le rendu suivant aboutit", async () => {
    // Revue T11 (C1) : la version précédente créait un NOUVEAU renderer et ne
    // prouvait rien — ici le timeout est PAR APPEL, même sémaphore.
    const renderer = await createPdfRenderer({ maxConcurrentRenders: 1 });
    try {
      await expect(
        renderer.render('<p data-cv-content="true">x</p>', { timeoutMs: 1 }),
      ).rejects.toThrow(RenderTimeoutError);
      const pdf = await renderer.render('<p data-cv-content="true">ok</p>', {
        timeoutMs: 60_000,
      });
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    } finally {
      await renderer.close();
    }
  }, 60_000);

  it("délai consommé EN FILE ⇒ échec sans jamais démarrer le rendu (échéance GLOBALE)", async () => {
    // Concurrence 1, délai 1 ms : A prend l'unique permis (et expirera) ;
    // B attend en file et son échéance tombe PENDANT l'attente — il doit être
    // retiré de la file (AbortSignal) sans jamais toucher Chromium.
    const renderer = await createPdfRenderer({
      maxConcurrentRenders: 1,
      renderTimeoutMs: 1,
    });
    try {
      const html = '<p data-cv-content="true">x</p>';
      const a = renderer.render(html);
      const b = renderer.render(html);
      await expect(b).rejects.toThrow(RenderTimeoutError);
      await expect(a).rejects.toThrow(RenderTimeoutError);
    } finally {
      await renderer.close();
    }
  }, 60_000);
});

describe("route /render/pdf — 504 (M2-T11)", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    await app?.close();
  });

  it("RenderTimeoutError ⇒ 504 problem+json générique, sans fuite", async () => {
    app = buildApp({
      pdfRenderer: {
        render: async () => {
          throw new RenderTimeoutError(120_000);
        },
        close: async () => {},
        isHealthy: () => true,
      },
    });
    const payload = {
      cv_content: denseCv,
      template_id: "modern_sobre",
      theme: {
        color_accent: "#2D3748",
        color_text: "#1A202C",
        color_muted: "#4A5568",
        color_background: "#FFFFFF",
        font_heading: "Inter",
        font_body: "Inter",
      },
      language: "fr",
    };
    const res = await app.inject({
      method: "POST",
      url: "/render/pdf",
      payload,
    });
    expect(res.statusCode).toBe(504);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.json<{ title: string }>().title).toBe("Gateway Timeout");
    expect(res.body).not.toContain("120000");
  });
});
