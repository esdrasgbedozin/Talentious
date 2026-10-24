/**
 * Build de production de l'export-service (M2-T04) — esbuild, remplace le tsc
 * d'émission (le typecheck reste `tsc --noEmit`).
 *
 * Pourquoi un bundle : @talentious/cv-render est consommé EN SOURCE (.tsx,
 * convention du monorepo — Next le transpile via transpilePackages). `tsc`
 * seul ne peut pas émettre un dist multi-workspace propre ; esbuild bundle
 * l'app + le package + react/react-dom (devDependencies : ABSENTS du runtime,
 * aucun node_modules React dans l'image). Les dépendances de PRODUCTION
 * (fastify, ajv-formats, playwright-core) restent EXTERNES : résolues dans
 * node_modules au runtime, elles gardent leurs chargements dynamiques.
 *
 * esbuild est épinglé en version exacte (package.json) : le dist embarqué
 * dans l'image doit être reproductible.
 */
import { readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const serviceRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(serviceRoot, "package.json"), "utf8"));

// esbuild ne vide pas outdir : un artefact orphelin de l'hôte survivrait au
// rebuild et pourrait être embarqué dans l'image (revue T04).
rmSync(join(serviceRoot, "dist"), { recursive: true, force: true });

await build({
  entryPoints: [join(serviceRoot, "src", "server.ts")],
  outfile: join(serviceRoot, "dist", "server.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  // Stack traces exploitables (--enable-source-maps au start) SANS embarquer
  // les sources : sourcesContent exclu — l'image ne contient ni source React
  // ni source du package, seulement les chemins/lignes (ADR décision 5).
  sourcemap: true,
  sourcesContent: false,
  jsx: "automatic",
  // NODE_ENV=production au BUILD : react-dom/server embarque sa variante prod
  // (pas d'avertissements dev dans les logs du service). NOTE : le define
  // remplace AUSSI tout process.env.NODE_ENV du code applicatif bundlé —
  // aucun aujourd'hui dans src/ ; ne pas s'appuyer dessus au runtime.
  define: { "process.env.NODE_ENV": '"production"' },
  // Sortie ESM + modules CJS embarqués (react-dom) : leurs `require("util")`
  // natifs ont besoin d'un require réel — bannière createRequire canonique.
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
  external: Object.keys(pkg.dependencies ?? {}),
  logLevel: "info",
});
