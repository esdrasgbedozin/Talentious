/**
 * M2-T03 — validation du payload POST /render/pdf à la frontière du service.
 * Règles : schéma GÉNÉRÉ du contrat (zéro dérive), champs inconnus refusés,
 * AUCUNE coercition de type, erreurs 422 RFC 7807 sans refléter les valeurs
 * du payload. Le rendu réel (M2-T06) est REMPLACÉ ici par un renderer factice :
 * ces tests prouvent la FRONTIÈRE, pdf-render.test.ts prouve le rendu.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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
) as Record<string, unknown>;

const anthracite = {
  color_accent: "#2D3748",
  color_text: "#1A202C",
  color_muted: "#4A5568",
  color_background: "#FFFFFF",
  font_heading: "Inter",
  font_body: "Inter",
};

function validPayload(): Record<string, unknown> {
  return {
    cv_content: structuredClone(denseCv),
    template_id: "modern_sobre",
    theme: { ...anthracite },
    language: "fr",
  };
}

/** Renderer factice : la frontière se teste sans Chromium. Le PDF rendu doit
 * être STRUCTURELLEMENT valide : la route le passe à normalizePdfMetadata
 * (M2-T07), qui le recharge via pdf-lib. */
const { PDFDocument } = await import("pdf-lib");
const fakeEmptyPdf = Buffer.from(await (await PDFDocument.create()).save());
const fakePdfRenderer = {
  render: async () => fakeEmptyPdf,
  close: async () => {},
  isHealthy: () => true,
};

let app: FastifyInstance;
beforeEach(() => {
  app = buildApp({ pdfRenderer: fakePdfRenderer });
});
afterEach(async () => {
  await app.close();
});

async function postRender(payload: unknown) {
  return app.inject({
    method: "POST",
    url: "/render/pdf",
    payload: payload as object,
  });
}

describe("POST /render/pdf — payload valide", () => {
  it("accepte la fixture de référence : 200 application/pdf (M2-T06)", async () => {
    const res = await postRender(validPayload());
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/pdf");
    expect(res.body.startsWith("%PDF-")).toBe(true);
  });

  it("le PDF (données personnelles) sort en no-store + nosniff (revue T06)", async () => {
    const res = await postRender(validPayload());
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("renderer ABSENT (mauvais câblage) ⇒ 500 problem+json générique", async () => {
    const bareApp = buildApp();
    const res = await bareApp.inject({
      method: "POST",
      url: "/render/pdf",
      payload: validPayload() as object,
    });
    expect(res.statusCode).toBe(500);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body).not.toContain("pdfRenderer");
    await bareApp.close();
  });

  it("file de rendu PLEINE ⇒ 503 problem+json avec Retry-After (M2-T09)", async () => {
    const { QueueFullError } = await import("../render/semaphore.js");
    const saturatedApp = buildApp({
      pdfRenderer: {
        ...fakePdfRenderer,
        render: async () => {
          throw new QueueFullError(2, 8);
        },
      },
    });
    const res = await saturatedApp.inject({
      method: "POST",
      url: "/render/pdf",
      payload: validPayload() as object,
    });
    expect(res.statusCode).toBe(503);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.headers["retry-after"]).toBe("5");
    await saturatedApp.close();
  });

  it("renderer qui produit un PDF CORROMPU ⇒ 500 générique, octets jamais envoyés (revue T07)", async () => {
    const corruptApp = buildApp({
      pdfRenderer: {
        ...fakePdfRenderer,
        render: async () => Buffer.from("GARBAGE_PAS_PDF"),
      },
    });
    const res = await corruptApp.inject({
      method: "POST",
      url: "/render/pdf",
      payload: validPayload() as object,
    });
    expect(res.statusCode).toBe(500);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body).not.toContain("GARBAGE_PAS_PDF");
    await corruptApp.close();
  });

  it("renderer qui REJETTE ⇒ 500 générique, message interne jamais reflété", async () => {
    const failingApp = buildApp({
      pdfRenderer: {
        ...fakePdfRenderer,
        render: async () => {
          throw new Error("SECRET_INTERNE_chemin/profil");
        },
      },
    });
    const res = await failingApp.inject({
      method: "POST",
      url: "/render/pdf",
      payload: validPayload() as object,
    });
    expect(res.statusCode).toBe(500);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body).not.toContain("SECRET_INTERNE");
    await failingApp.close();
  });

  it("navigateur mort ⇒ /healthz passe à 503 pour que Cloud Run recycle (revue T06)", async () => {
    const deadApp = buildApp({
      pdfRenderer: { ...fakePdfRenderer, isHealthy: () => false },
    });
    const res = await deadApp.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(503);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    await deadApp.close();
  });

  it("artefact CSS illisible ⇒ 500 problem+json générique, chemin jamais reflété", async () => {
    const { resetCvCssCacheForTests } = await import("../render/css.js");
    resetCvCssCacheForTests();
    process.env.CV_RENDER_CSS_PATH = "/chemin/inexistant/cv.css";
    try {
      const res = await postRender(validPayload());
      expect(res.statusCode).toBe(500);
      expect(res.headers["content-type"]).toContain("application/problem+json");
      expect(res.body).not.toContain("inexistant");
    } finally {
      delete process.env.CV_RENDER_CSS_PATH;
      resetCvCssCacheForTests();
    }
  });
});

describe("POST /render/pdf — champs inconnus refusés (jamais retirés en silence)", () => {
  it("422 sur champ inconnu à la racine", async () => {
    const res = await postRender({ ...validPayload(), champ_inconnu: 1 });
    expect(res.statusCode).toBe(422);
  });

  it("422 sur champ inconnu dans le thème", async () => {
    const payload = validPayload();
    (payload.theme as Record<string, unknown>).background_image = "url(//evil)";
    const res = await postRender(payload);
    expect(res.statusCode).toBe(422);
  });

  it("422 sur champ inconnu dans le contenu canonique", async () => {
    const payload = validPayload();
    (payload.cv_content as Record<string, unknown>).script =
      "<script>alert(1)</script>";
    const res = await postRender(payload);
    expect(res.statusCode).toBe(422);
  });
});

describe("POST /render/pdf — payloads hostiles", () => {
  it("422 sur couleur hors #RRGGBB (injection CSS)", async () => {
    const payload = validPayload();
    (payload.theme as Record<string, unknown>).color_accent =
      "red;} body{display:none";
    const res = await postRender(payload);
    expect(res.statusCode).toBe(422);
  });

  it("422 sur langue hors enum", async () => {
    const res = await postRender({ ...validPayload(), language: "xx" });
    expect(res.statusCode).toBe(422);
  });

  it("422 sur template_id hors format strict", async () => {
    const res = await postRender({
      ...validPayload(),
      template_id: "../../etc/passwd",
    });
    expect(res.statusCode).toBe(422);
  });

  it("422 sur dépassement d'un cap de contenu (maxLength hérité de M1-T16)", async () => {
    const payload = validPayload();
    (payload.cv_content as Record<string, unknown>).summary = "x".repeat(
      100_000,
    );
    const res = await postRender(payload);
    expect(res.statusCode).toBe(422);
  });

  it("422 sur confusion de type (cv_content chaîne au lieu d'objet)", async () => {
    const res = await postRender({ ...validPayload(), cv_content: "{}" });
    expect(res.statusCode).toBe(422);
  });

  it("422 sans AUCUNE coercition : un nombre n'est pas une chaîne", async () => {
    const res = await postRender({ ...validPayload(), template_id: 123 });
    expect(res.statusCode).toBe(422);
  });

  it("422 sur champ requis manquant", async () => {
    const payload = validPayload();
    delete payload.theme;
    const res = await postRender(payload);
    expect(res.statusCode).toBe(422);
  });
});

describe("POST /render/pdf — erreurs transport (hors ajv) en problem+json", () => {
  // Revue M2-T03 (bloquant B1) : un défaut CLIENT ne doit jamais sortir en 500
  // générique ni journaliser error.message (un SyntaxError JSON Node ≥22
  // contient un extrait du corps, donc du contenu de CV).
  it("400 sur JSON malformé", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/render/pdf",
      payload: "{pas du json",
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body).not.toContain("pas du json");
  });

  it("400 sur corps vide déclaré JSON", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/render/pdf",
      payload: "",
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers["content-type"]).toContain("application/problem+json");
  });

  it("400 sur clé __proto__ (anti-pollution de prototype)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/render/pdf",
      payload: '{"__proto__": {"pollue": true}}',
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers["content-type"]).toContain("application/problem+json");
  });

  it("415 sur content-type non supporté", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/render/pdf",
      payload: "du texte",
      headers: { "content-type": "text/plain" },
    });
    expect(res.statusCode).toBe(415);
    expect(res.headers["content-type"]).toContain("application/problem+json");
  });

  it("413 sur corps dépassant la limite", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/render/pdf",
      payload: '"' + "x".repeat(2_600_000) + '"',
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(413);
    expect(res.headers["content-type"]).toContain("application/problem+json");
  });
});

describe("Route inconnue", () => {
  it("404 en problem+json (jamais le 404 Fastify par défaut)", async () => {
    const res = await app.inject({ method: "GET", url: "/inconnue" });
    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).toContain("application/problem+json");
  });
});

describe("POST /render/pdf — contenu d'invalid_params", () => {
  it("nomme le champ requis manquant (missingProperty — nom issu du SCHÉMA, sûr)", async () => {
    const payload = validPayload();
    delete payload.theme;
    const res = await postRender(payload);
    expect(res.statusCode).toBe(422);
    const body = res.json() as {
      invalid_params: { loc: string[]; type: string }[];
    };
    expect(body.invalid_params[0].type).toBe("required");
    expect(body.invalid_params[0].loc).toContain("theme");
  });

  it("ne reflète JAMAIS le nom d'un champ inconnu soumis (clé = donnée client)", async () => {
    // Arbitrage revue : additionalProperty est une CLÉ FOURNIE PAR LE CLIENT,
    // donc potentiellement hostile — contrairement à missingProperty, elle
    // n'est pas ajoutée à loc et ne doit apparaître nulle part.
    const res = await postRender({ ...validPayload(), CLE_HOSTILE_xyz: 1 });
    expect(res.statusCode).toBe(422);
    expect(res.body).not.toContain("CLE_HOSTILE_");
  });
});

describe("POST /render/pdf — fermeture en profondeur et caps hérités", () => {
  it("422 sur champ inconnu dans un item de tableau imbriqué", async () => {
    const payload = validPayload();
    const experiences = (
      payload.cv_content as { selected_experiences: Record<string, unknown>[] }
    ).selected_experiences;
    experiences[0].champ_inconnu = "x";
    const res = await postRender(payload);
    expect(res.statusCode).toBe(422);
  });

  it("422 sur dépassement de maxItems (hérité de M1-T16)", async () => {
    const payload = validPayload();
    const cv = payload.cv_content as { selected_experiences: unknown[] };
    const un = cv.selected_experiences[0];
    cv.selected_experiences = Array.from({ length: 31 }, () =>
      structuredClone(un),
    );
    const res = await postRender(payload);
    expect(res.statusCode).toBe(422);
  });

  it("accepte null sur un champ nullable du canonique (phone)", async () => {
    const payload = validPayload();
    (
      payload.cv_content as { personal_info: Record<string, unknown> }
    ).personal_info.phone = null;
    const res = await postRender(payload);
    expect(res.statusCode).toBe(200);
  });
});

describe("POST /render/pdf — matrice anti-reflet (tous mots-clés ajv)", () => {
  // Le non-reflet n'était prouvé que pour `pattern` : on couvre enum,
  // maxLength, type et clé inconnue avec le même marqueur hostile.
  const MARQUEUR = "VALEUR_HOSTILE_MATRICE";

  async function expectNoReflect(mutate: (p: Record<string, unknown>) => void) {
    const payload = validPayload();
    mutate(payload);
    const res = await postRender(payload);
    expect(res.statusCode).toBe(422);
    expect(res.body).not.toContain(MARQUEUR);
  }

  it("enum (language)", () =>
    expectNoReflect((p) => void (p.language = MARQUEUR)));
  it("maxLength (summary)", () =>
    expectNoReflect(
      (p) =>
        void ((p.cv_content as Record<string, unknown>).summary =
          MARQUEUR.repeat(200)),
    ));
  it("type (template_id objet)", () =>
    expectNoReflect((p) => void (p.template_id = { [MARQUEUR]: MARQUEUR })));
  it("clé inconnue portant le marqueur", () =>
    expectNoReflect((p) => void (p[MARQUEUR] = 1)));
});

describe("POST /render/pdf — forme des erreurs", () => {
  it("l'erreur est RFC 7807 et ne reflète pas les valeurs du payload", async () => {
    const hostile = "VALEUR_HOSTILE_" + "y".repeat(50);
    const payload = validPayload();
    (payload.theme as Record<string, unknown>).color_accent = hostile;
    const res = await postRender(payload);
    expect(res.statusCode).toBe(422);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    const body = res.json() as Record<string, unknown>;
    expect(body.status).toBe(422);
    expect(typeof body.title).toBe("string");
    expect(res.body).not.toContain("VALEUR_HOSTILE_");
  });
});
