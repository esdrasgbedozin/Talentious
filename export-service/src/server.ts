/**
 * Point d'entrée du service d'export — écoute sur $PORT (8080 par défaut,
 * convention Cloud Run) et 0.0.0.0 (requis en conteneur).
 */
import { buildApp } from "./app.js";
import { loadCvCss } from "./render/css.js";

const port = Number(process.env.PORT ?? 8080);
const app = buildApp({ logger: true });

try {
  // Échec RAPIDE (revue T04) : sans l'artefact CSS, chaque rendu ferait 500
  // alors que /healthz passerait — Cloud Run doit refuser la révision ici.
  loadCvCss();
  await app.listen({ port, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
