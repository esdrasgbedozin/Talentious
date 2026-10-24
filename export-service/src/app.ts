/**
 * Construction de l'app Fastify du service d'export (M2-T01).
 *
 * Séparée du point d'entrée (server.ts) pour être testable via `app.inject()`
 * sans ouvrir de port. La frontière de validation ajv depuis le contrat est
 * en place (M2-T03) ; le rendu réel (M2-T06) et les limites fines
 * timeout/504 (M2-T11) s'ajouteront ici.
 */
import ajvFormatsModule from "ajv-formats";
import Fastify, { type FastifyInstance } from "fastify";

// Interop CJS sous NodeNext : ajv-formats pose le plugin sur module.exports ET
// sur .default ; seuls les types de .default sont callables côté TS.
const addFormats = ajvFormatsModule.default ?? ajvFormatsModule;

import { registerProblemHandlers, sendProblem } from "./problem.js";
import type { PdfRenderer } from "./render/pdf.js";
import { registerRenderRoutes } from "./routes/render.js";

declare module "fastify" {
  interface FastifyInstance {
    /** Renderer PDF (M2-T06) — réel en prod (server.ts), factice en test de frontière. */
    pdfRenderer?: PdfRenderer;
  }
}

/**
 * Limite de taille du corps, explicite (revue M2-T03). Dimensionnement : un
 * payload légitime à TOUS les plafonds M1-T16 pèse ≈ 0,6 Mo en ASCII ; avec
 * accents UTF-8 ou échappements \uXXXX il peut frôler 1 Mio (le défaut
 * Fastify, qui aurait pu rejeter un CV légitime). 2 Mio = marge ×3 sans
 * ouvrir le DoS — au-delà : 413 problem+json.
 */
const BODY_LIMIT_BYTES = 2 * 1024 * 1024;

export interface BuildAppOptions {
  /** Logger pino de Fastify — false en test, true (JSON structuré) au runtime. */
  logger?: boolean;
  /** Renderer PDF. Absent ⇒ /render/pdf répond 500 (câblage de démarrage manquant). */
  pdfRenderer?: PdfRenderer;
  /** Timeout de REQUÊTE Fastify (revue T11, S2) : couvre lecture du corps et
   * normalisation, au-dessus de l'échéance de rendu. 0 = désactivé (tests). */
  requestTimeoutMs?: number;
  /** Flux de sortie des logs (M2-T12, tests) : active le logger JSON pino
   * vers ce flux — les tests prouvent « zéro contenu de CV dans les logs ». */
  loggerStream?: NodeJS.WritableStream;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.loggerStream
      ? { level: "info", stream: options.loggerStream }
      : (options.logger ?? false),
    bodyLimit: BODY_LIMIT_BYTES,
    requestTimeout: options.requestTimeoutMs ?? 0,
    // request_id PROPAGÉ (M2-T12) : l'id de corrélation du backend appelant
    // (x-request-id) traverse tel quel — généré sinon. Label `request_id`
    // dans chaque ligne de log.
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "request_id",
    ajv: {
      // Validation STRICTE à la frontière (M2-T03) : le payload vient in fine
      // de l'utilisateur. Les défauts Fastify (coerceTypes, removeAdditional)
      // AFFAIBLIRAIENT le schéma : "123" deviendrait 123, un champ inconnu
      // serait retiré en silence au lieu de produire un 422.
      customOptions: {
        coerceTypes: false,
        removeAdditional: false,
        useDefaults: false,
        allErrors: false,
        // strictSchema true (revue M2-T03) : un mot-clé mal orthographié dans
        // l'artefact (ex. maxLenght) ferait ÉCHOUER le démarrage au lieu de
        // rendre la validation silencieusement laxiste.
        strictSchema: true,
      },
      // Fastify type ses plugins ajv en `Plugin<unknown>` : la variance
      // rejette FormatsPlugin (signatures pourtant compatibles — c'est LE
      // plugin ajv canonique). Cast de façade sans effet runtime ; les tests
      // de validation (format, 422) couvrent le branchement réel.
      plugins: [addFormats as never],
    },
  });

  // Fastify embarque un parser text/plain par défaut : sans ce retrait, un
  // corps text/plain atteint ajv (422) au lieu du 415 contractuel. Ce service
  // ne parle que application/json.
  app.removeContentTypeParser("text/plain");

  if (options.pdfRenderer) app.decorate("pdfRenderer", options.pdfRenderer);

  // L'id de corrélation revient aussi à l'APPELANT (backend) : il peut
  // joindre ses logs aux nôtres sur request_id (M2-T12).
  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  registerProblemHandlers(app);
  // /healthz reflète l'état du NAVIGATEUR (revue T06, C1) : browser mort ⇒
  // 503 ⇒ Cloud Run recycle l'instance au lieu de servir des 500 en boucle.
  app.get("/healthz", async (request, reply) => {
    if (app.pdfRenderer && !app.pdfRenderer.isHealthy()) {
      return sendProblem(request, reply, 503, {
        detail: "Navigateur de rendu indisponible — instance à recycler.",
      });
    }
    return { status: "ok" };
  });
  registerRenderRoutes(app);

  return app;
}
