/**
 * POST /render/pdf — M2-T03 : la VALIDATION à la frontière du service.
 *
 * Le schéma est l'artefact GÉNÉRÉ du contrat (render-payload.schema.json,
 * `make generate-types`) : champs inconnus refusés (additionalProperties
 * false hérité du canonique), caps de contenu M1-T16 comprises. Fastify le
 * compile avec ajv configuré SANS coercition (app.ts).
 *
 * Le rendu réel arrive à M2-T06 : un payload valide répond 501 provisoire —
 * hors contrat, assumé : le service n'est pas déployé avant la phase B.
 */
import type { FastifyInstance } from "fastify";

import type { components } from "../generated/api.js";
import renderPayloadSchema from "../generated/render-payload.schema.json" with { type: "json" };
import { sendProblem } from "../problem.js";
import { loadCvCss } from "../render/css.js";
import { buildCvDocumentHtml } from "../render/document.js";

type RenderPdfRequest = components["schemas"]["RenderPdfRequest"];

export function registerRenderRoutes(app: FastifyInstance): void {
  app.post(
    "/render/pdf",
    { schema: { body: renderPayloadSchema } },
    async (request, reply) => {
      const body = request.body as RenderPdfRequest;
      // Le document HTML complet (SSR + CSP, M2-T04) est construit à chaque
      // requête valide : SSR et CSS sont exercés en conditions réelles dès
      // maintenant (un défaut d'artefact = 500 immédiat, pas à M2-T06).
      buildCvDocumentHtml({
        cvContent: body.cv_content,
        templateId: body.template_id,
        theme: body.theme,
        language: body.language,
        css: loadCvCss(),
      });
      // TODO(M2-T06) : passer ce document à Chromium (setContent + page.pdf)
      // — retirer alors le titre 501 de problem.ts et le test « 501
      // provisoire » (hors contrat, assumé).
      return sendProblem(request, reply, 501, {
        detail: "Rendu PDF non implémenté (M2-T06).",
      });
    },
  );
}
