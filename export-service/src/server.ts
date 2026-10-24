/**
 * Point d'entrée du service d'export — écoute sur $PORT (8080 par défaut,
 * convention Cloud Run) et 0.0.0.0 (requis en conteneur).
 */
import { buildApp } from "./app.js";
import { loadCvCss } from "./render/css.js";
import {
  createPdfRenderer,
  DEFAULT_MAX_QUEUE,
  DEFAULT_RENDER_CONCURRENCY,
} from "./render/pdf.js";

const port = Number(process.env.PORT ?? 8080);

/** Entier d'env borné, à message NOMMÉ (revue T09 : `Number("")` = 0 et
 * `Number("abc")` = NaN échouaient au boot sans nommer la variable ; et une
 * borne haute évite qu'un RENDER_CONCURRENCY=1000 annule la protection). */
function intEnv(name: string, def: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return def;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(
      `${name} invalide : « ${raw} » (entier ${min}–${max} attendu)`,
    );
  }
  return value;
}
// App construite AVANT le try (revue T06, A2) : un échec de démarrage sort en
// JSON pino dans Cloud Logging, jamais en texte brut — c'est précisément le
// cas que le fail-fast veut rendre visible.
const app = buildApp({ logger: true });

try {
  // Échecs RAPIDES (revues T02/T04) : artefact CSS absent ou Chromium
  // désaligné ⇒ la révision Cloud Run est refusée ici, jamais des 500 par
  // requête derrière un /healthz vert.
  loadCvCss();
  // Args Chromium PROVISOIRES par env, filtrés par liste blanche dans
  // createPdfRenderer (arbitrage sandbox/compensations : M2-T09).
  const launchArgs = (process.env.CHROMIUM_EXTRA_ARGS ?? "")
    .split(" ")
    .filter(Boolean);
  const pdfRenderer = await createPdfRenderer({
    launchArgs,
    // Bornes de rendus simultanés et de file (M2-T09) — complétées côté
    // infra par la concurrency Cloud Run (M2-T19).
    maxConcurrentRenders: intEnv(
      "RENDER_CONCURRENCY",
      DEFAULT_RENDER_CONCURRENCY,
      1,
      16,
    ),
    maxQueuedRenders: intEnv("RENDER_QUEUE_MAX", DEFAULT_MAX_QUEUE, 0, 64),
    onDisconnected: () =>
      app.log.error(
        "navigateur de rendu déconnecté — /healthz passe à 503 (recyclage)",
      ),
    // Egress bloqué (M2-T08) : hostname SEUL — jamais l'URL complète, qui
    // peut porter du contenu de CV (contrainte logs, M2-T12).
    onEgressBlocked: (url) => {
      let host = "hôte-illisible";
      try {
        host = new URL(url).host;
      } catch {
        // garder le placeholder
      }
      app.log.warn(
        { egress_bloque: host },
        "requête sortante avortée pendant un rendu",
      );
    },
  });
  app.decorate("pdfRenderer", pdfRenderer);
  app.addHook("onClose", async () => pdfRenderer.close());

  // Arrêt propre, réentrance gardée (revue T06, A3) : un close qui rejette ne
  // laisse jamais le process vivant ni un rejet non géré.
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    app.close().then(
      () => process.exit(0),
      (err) => {
        app.log.error(err);
        process.exit(1);
      },
    );
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
