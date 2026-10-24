/**
 * E2E local du rendu PDF (M2-T13) — contre le service du docker-compose
 * (image de PROD) : `make e2e-export` (ou EXPORT_URL=… node e2e.mjs).
 * Critère du ticket : POST de la fixture dense ⇒ PDF valide (magic %PDF,
 * UNE page, en-têtes conformes, request_id aller-retour).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const base = process.env.EXPORT_URL ?? "http://localhost:8004";
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function fail(message) {
  console.error(`✗ e2e export : ${message}`);
  process.exit(1);
}

// 1. Attendre le healthz (le démarrage lance Chromium).
let ready = false;
for (let i = 0; i < 40 && !ready; i += 1) {
  try {
    const res = await fetch(`${base}/healthz`);
    ready = res.status === 200;
  } catch {
    // service pas encore prêt
  }
  if (!ready) await new Promise((r) => setTimeout(r, 500));
}
if (!ready) fail(`healthz jamais vert sur ${base} (service lancé ? make up)`);

// 2. POST de la fixture dense.
const cv = JSON.parse(
  readFileSync(
    join(repoRoot, "fixtures", "cv-reference", "dense.json"),
    "utf8",
  ),
);
const payload = {
  cv_content: cv,
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
const res = await fetch(`${base}/render/pdf`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-request-id": "e2e-t13" },
  body: JSON.stringify(payload),
});

// 3. Assertions.
if (res.status !== 200) fail(`statut ${res.status} (attendu 200)`);
if (!res.headers.get("content-type")?.includes("application/pdf"))
  fail(`content-type ${res.headers.get("content-type")}`);
if (res.headers.get("cache-control") !== "no-store")
  fail("cache-control ≠ no-store");
if (res.headers.get("x-request-id") !== "e2e-t13")
  fail("x-request-id non propagé");
const pdf = Buffer.from(await res.arrayBuffer());
if (pdf.subarray(0, 5).toString() !== "%PDF-") fail("magic %PDF- absent");
const raw = pdf.toString("latin1");
const pages = (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
if (pages !== 1) fail(`${pages} pages (attendu 1 — fit une-page)`);
if (raw.includes("Skia") || raw.includes("Chromium"))
  fail("trace d'outillage dans le PDF");

console.log(
  `✓ e2e export : PDF valide (${pdf.length} octets, 1 page, no-store, request_id propagé) via ${base}`,
);
