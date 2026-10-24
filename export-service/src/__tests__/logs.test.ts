/**
 * M2-T12 — logs JSON structurés, request_id PROPAGÉ, ZÉRO contenu de CV.
 * Critères du ticket : chaque ligne de log est du JSON parsable ; le contenu
 * de la fixture n'apparaît dans AUCUN log (200, 422, 500 confondus) ; le
 * x-request-id du backend appelant traverse (logs + réponse) pour corréler.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Writable } from "node:stream";

import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { buildApp } from "../app.js";

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
) as {
  personal_info: { first_name: string; last_name: string };
  summary: string;
};

const fakeEmptyPdf = Buffer.from(await (await PDFDocument.create()).save());

function collector(): { stream: Writable; lines: () => string[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(String(chunk));
      cb();
    },
  });
  return { stream, lines: () => chunks.join("").split("\n").filter(Boolean) };
}

function validPayload(): object {
  return {
    cv_content: structuredClone(denseCv),
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
}

function appWithLogs(renderOverride?: () => Promise<Buffer>) {
  const logs = collector();
  const app = buildApp({
    loggerStream: logs.stream,
    pdfRenderer: {
      render: renderOverride ?? (async () => fakeEmptyPdf),
      close: async () => {},
      isHealthy: () => true,
    },
  });
  return { app, logs };
}

describe("logs (M2-T12)", () => {
  it("chaque ligne de log est du JSON parsable", async () => {
    const { app, logs } = appWithLogs();
    await app.inject({
      method: "POST",
      url: "/render/pdf",
      payload: validPayload(),
    });
    await app.close();
    const lines = logs.lines();
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
  });

  it("x-request-id ENTRANT : propagé dans chaque log (request_id) ET dans la réponse", async () => {
    const { app, logs } = appWithLogs();
    const res = await app.inject({
      method: "POST",
      url: "/render/pdf",
      payload: validPayload(),
      headers: { "x-request-id": "backend-corr-42" },
    });
    await app.close();
    expect(res.headers["x-request-id"]).toBe("backend-corr-42");
    const parsed = logs
      .lines()
      .map((l) => JSON.parse(l) as { request_id?: string });
    const withId = parsed.filter((l) => l.request_id !== undefined);
    expect(withId.length).toBeGreaterThan(0);
    for (const line of withId) expect(line.request_id).toBe("backend-corr-42");
  });

  it("sans en-tête : un request_id est GÉNÉRÉ et renvoyé", async () => {
    const { app } = appWithLogs();
    const res = await app.inject({ method: "GET", url: "/healthz" });
    await app.close();
    expect(String(res.headers["x-request-id"] ?? "")).not.toBe("");
  });

  it("AUCUN contenu de CV dans les logs — 200, 422 et 500 confondus", async () => {
    const { app, logs } = appWithLogs();
    await app.inject({
      method: "POST",
      url: "/render/pdf",
      payload: validPayload(),
    });
    await app.inject({
      method: "POST",
      url: "/render/pdf",
      payload: { ...validPayload(), champ_inconnu: "VALEUR_SENSIBLE_CV" },
    });
    await app.close();

    const failing = appWithLogs(async () => {
      throw new Error("panne interne de rendu");
    });
    await failing.app.inject({
      method: "POST",
      url: "/render/pdf",
      payload: validPayload(),
    });
    await failing.app.close();

    const all = logs.lines().join("\n") + failing.logs.lines().join("\n");
    expect(all.length).toBeGreaterThan(0);
    expect(all).not.toContain(denseCv.personal_info.first_name);
    expect(all).not.toContain(denseCv.personal_info.last_name);
    expect(all).not.toContain(denseCv.summary.slice(0, 30));
    expect(all).not.toContain("VALEUR_SENSIBLE_CV");
  });
});
