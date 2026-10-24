/**
 * POST /render/pdf — validation à la frontière (M2-T03) puis rendu réel
 * (M2-T06) : document SSR + CSP (M2-T04) passé à Chromium, PDF A4 en retour.
 *
 * Le schéma est l'artefact GÉNÉRÉ du contrat (render-payload.schema.json,
 * `make generate-types`) : champs inconnus refusés, caps M1-T16 comprises,
 * ajv SANS coercition (app.ts). Timeout 120 s / 504 : M2-T11.
 */
import type { FastifyInstance } from "fastify";

import type { components } from "../generated/api.js";
import renderPayloadSchema from "../generated/render-payload.schema.json" with { type: "json" };
import { loadCvCss } from "../render/css.js";
import { buildCvDocumentHtml } from "../render/document.js";

type RenderPdfRequest = components["schemas"]["RenderPdfRequest"];

export function registerRenderRoutes(app: FastifyInstance): void {
  app.post(
    "/render/pdf",
    { schema: { body: renderPayloadSchema } },
    async (request, reply) => {
      const body = request.body as RenderPdfRequest;
      const renderer = app.pdfRenderer;
      if (!renderer) {
        // Mauvais câblage de démarrage, jamais un cas client : 500 générique
        // via le handler d'erreurs (rien d'interne ne sort).
        throw new Error("PDF renderer non configuré (buildApp sans pdfRenderer)");
      }
      const html = buildCvDocumentHtml({
        cvContent: body.cv_content,
        templateId: body.template_id,
        theme: body.theme,
        language: body.language,
        css: loadCvCss(),
      });
      const pdf = await renderer.render(html);
      // no-store : le PDF porte des données personnelles (RGPD, minimisation) ;
      // nosniff : ceinture (revue T06, C3). Pas de Content-Disposition : le
      // backend appelant décide du nom de fichier, rien n'est reflété ici.
      return reply
        .header("cache-control", "no-store")
        .header("x-content-type-options", "nosniff")
        .type("application/pdf")
        .send(pdf);
    },
  );
}
