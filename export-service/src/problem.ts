/**
 * Erreurs RFC 7807 (application/problem+json) — même convention que le
 * backend (backend/app/core/problem.py) : jamais de valeur du payload ni de
 * détail interne dans la réponse ; `invalid_params` expose loc + msg + type
 * seulement. Reste M2-T11 : 504 (timeout de rendu) et limites fines.
 */
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export const PROBLEM_MEDIA_TYPE = "application/problem+json";

const TITLES: Record<number, string> = {
  400: "Bad Request",
  404: "Not Found",
  413: "Payload Too Large",
  415: "Unsupported Media Type",
  422: "Unprocessable Entity",
  500: "Internal Server Error",
  501: "Not Implemented",
  504: "Gateway Timeout",
};

/**
 * Détails FIXES des erreurs transport côté client. On ne renvoie JAMAIS
 * error.message : sur Node ≥ 22, un SyntaxError de parse JSON contient un
 * extrait du corps — donc du contenu de CV (revue sécurité M2-T03).
 */
const CLIENT_DETAILS: Record<number, string> = {
  400: "Corps de requête illisible ou malformé.",
  404: "Ressource introuvable.",
  413: "Corps de requête trop volumineux.",
  415: "Type de média non supporté (application/json attendu).",
};

export interface ProblemOptions {
  detail?: string;
  type?: string;
  extra?: Record<string, unknown>;
}

export function sendProblem(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  { detail, type = "about:blank", extra }: ProblemOptions = {},
): FastifyReply {
  // `instance` vient de la ROUTE matchée (chemin du schéma), jamais de
  // request.url : l'URL appelée est une donnée client (query comprise) et
  // n'est pas reflétée. Absente quand aucune route ne matche (404).
  const instance = request.routeOptions.url;
  return reply
    .code(status)
    .type(PROBLEM_MEDIA_TYPE)
    .send({
      type,
      title: TITLES[status] ?? "Error",
      status,
      ...(detail !== undefined ? { detail } : {}),
      ...(instance !== undefined ? { instance } : {}),
      ...extra,
    });
}

export function registerProblemHandlers(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error.validation) {
      // Échec ajv → 422. On expose loc (chemin dans le payload) + message ajv
      // + mot-clé, JAMAIS la valeur soumise (convention backend, revue M1-T09).
      const invalidParams = error.validation.map((v) => {
        const loc = v.instancePath.split("/").filter(Boolean);
        // missingProperty vient du SCHÉMA (nom d'un champ requis) : sûr à
        // refléter. additionalProperty est une CLÉ SOUMISE par le client
        // (potentiellement hostile) : volontairement jamais ajoutée.
        const params = v.params as Record<string, unknown>;
        if (typeof params.missingProperty === "string") loc.push(params.missingProperty);
        return { loc, msg: v.message ?? "invalide", type: v.keyword };
      });
      return sendProblem(request, reply, 422, {
        detail: "La validation du payload a échoué",
        extra: { invalid_params: invalidParams },
      });
    }
    // Erreur TRANSPORT côté client (JSON malformé, corps vide ou trop gros,
    // content-type non supporté, __proto__ rejeté…) : statut Fastify conservé,
    // detail fixe, et on ne journalise que code + statut — jamais error.message
    // (extrait du corps possible dans un SyntaxError JSON).
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 400 && statusCode < 500) {
      request.log.warn({ code: error.code, statusCode }, "requête client rejetée");
      return sendProblem(request, reply, statusCode, {
        detail: CLIENT_DETAILS[statusCode] ?? "Requête invalide.",
      });
    }
    // Dernier rempart : rien d'interne ne sort (log serveur complet, 500 générique).
    request.log.error(error);
    return sendProblem(request, reply, 500, {
      detail: "Une erreur inattendue est survenue.",
    });
  });

  // Le 404 Fastify par défaut sort en application/json et reflète méthode et
  // chemin : remplacé par un problem+json conforme au contrat.
  app.setNotFoundHandler((request, reply) =>
    sendProblem(request, reply, 404, { detail: CLIENT_DETAILS[404] }),
  );
}
