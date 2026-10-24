/**
 * M2-T08 — egress verrouillé applicatif, PROUVÉ de l'extérieur : un
 * serveur-témoin local écoute pendant le rendu d'un HTML piégé — il ne doit
 * recevoir AUCUNE requête (critère du ticket : zéro requête sortante
 * comptée). Dernier rempart pour une URL http(s) d'apparence légitime que la
 * coercition laisse passer (DET-M0-AC1, ADR-RENDER-SECURITY).
 *
 * Intégration Chromium réel (skipIf local, REQUIRE_CHROMIUM=1 en conteneur).
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertChromiumAvailable, createPdfRenderer } from "../render/pdf.js";

let chromiumAvailable = true;
try {
  assertChromiumAvailable();
} catch {
  chromiumAvailable = false;
}

describe.skipIf(!chromiumAvailable)("egress verrouillé (M2-T08)", () => {
  let witness: Server;
  let witnessPort: number;
  let witnessHits: string[];

  beforeAll(async () => {
    witnessHits = [];
    witness = createServer((req, res) => {
      witnessHits.push(req.url ?? "?");
      res.end("tu ne devrais jamais me lire");
    });
    await new Promise<void>((resolve) => witness.listen(0, "127.0.0.1", resolve));
    witnessPort = (witness.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise((resolve) => witness.close(resolve));
  });

  it(
    "HTML piégé (img métadonnées GCP + img/css vers le témoin) : ZÉRO requête sortante, rendu abouti",
    async () => {
      const blocked: string[] = [];
      const renderer = await createPdfRenderer({
        onEgressBlocked: (url) => blocked.push(url),
      });
      try {
        const html =
          '<!doctype html><html><head><meta charset="utf-8">' +
          `<link rel="stylesheet" href="http://127.0.0.1:${witnessPort}/evil.css">` +
          "</head><body>" +
          '<img src="http://169.254.169.254/computeMetadata/v1/">' +
          `<img src="http://127.0.0.1:${witnessPort}/beacon.png">` +
          '<p data-cv-content="true">RENDU_SANS_EGRESS</p></body></html>';
        const pdf = await renderer.render(html);
        expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
        // Le témoin n'a RIEN reçu : c'est le critère du ticket.
        expect(witnessHits).toEqual([]);
        // Et chaque tentative a été VUE et bloquée (observabilité).
        expect(blocked.length).toBeGreaterThanOrEqual(2);
        expect(blocked.some((u) => u.includes("169.254.169.254"))).toBe(true);
        expect(blocked.some((u) => u.includes(`127.0.0.1:${witnessPort}`))).toBe(true);
      } finally {
        await renderer.close();
      }
    },
    60_000,
  );

  it(
    "document légitime : AUCUNE tentative d'egress détectée (pas de faux positif)",
    async () => {
      const blocked: string[] = [];
      const renderer = await createPdfRenderer({
        onEgressBlocked: (url) => blocked.push(url),
      });
      try {
        const html =
          '<!doctype html><html><head><meta charset="utf-8"><style>p{color:#111}</style></head>' +
          '<body><p data-cv-content="true">DOCUMENT_PROPRE</p></body></html>';
        await renderer.render(html);
        expect(blocked).toEqual([]);
      } finally {
        await renderer.close();
      }
    },
    60_000,
  );
});
