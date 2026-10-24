/**
 * Construction de l'app Fastify du service d'export (M2-T01).
 *
 * Séparée du point d'entrée (server.ts) pour être testable via `app.inject()`
 * sans ouvrir de port. Les routes métier (POST /render/pdf, M2-T11) et la
 * validation ajv depuis le contrat (M2-T03) s'ajouteront ici.
 */
import Fastify, { type FastifyInstance } from "fastify";

export interface BuildAppOptions {
  /** Logger pino de Fastify — false en test, true (JSON structuré) au runtime. */
  logger?: boolean;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

  app.get("/healthz", async () => ({ status: "ok" }));

  return app;
}
