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

import renderPayloadSchema from "../generated/render-payload.schema.json" with { type: "json" };
import { sendProblem } from "../problem.js";

export function registerRenderRoutes(app: FastifyInstance): void {
  app.post(
    "/render/pdf",
    { schema: { body: renderPayloadSchema } },
    // TODO(M2-T06) : remplacer par le rendu réel — retirer aussi le titre 501
    // de problem.ts et le test « 501 provisoire » (hors contrat, assumé).
    async (request, reply) =>
      sendProblem(request, reply, 501, {
        detail: "Rendu PDF non implémenté (M2-T06).",
      }),
  );
}
