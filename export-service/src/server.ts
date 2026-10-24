/**
 * Point d'entrée du service d'export — écoute sur $PORT (8080 par défaut,
 * convention Cloud Run) et 0.0.0.0 (requis en conteneur).
 */
import { buildApp } from "./app.js";
import { loadCvCss } from "./render/css.js";
import { createPdfRenderer } from "./render/pdf.js";

const port = Number(process.env.PORT ?? 8080);
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
  const launchArgs = (process.env.CHROMIUM_EXTRA_ARGS ?? "").split(" ").filter(Boolean);
  const pdfRenderer = await createPdfRenderer({
    launchArgs,
    onDisconnected: () =>
      app.log.error("navigateur de rendu déconnecté — /healthz passe à 503 (recyclage)"),
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
