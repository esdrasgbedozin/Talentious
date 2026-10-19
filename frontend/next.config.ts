import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Package de rendu partagé consommé en source (workspace npm) — M0-T06,
  // ADR-RENDER-PACKAGE. Next le transpile comme le reste de l'app. Non encore
  // importé par le frontend (l'extraction de CVRenderer est M0-T08).
  transpilePackages: ["@talentious/cv-render"],
  // Racine du monorepo (workspaces npm) : fige la racine de traçage de la
  // sortie `standalone` pour que Next inclue le package partagé et produise
  // une arborescence déterministe (`.next/standalone/frontend/server.js`).
  // UNIQUEMENT en build standalone (prod) : en dev (docker-compose, contexte
  // ./frontend monté en volume), `__dirname` vaut `/app` et `../` vaudrait `/`,
  // ce qui ferait tracer toute la racine du système de fichiers. Hors
  // standalone, cette racine n'a aucun intérêt. M0-T07 — voir ADR-RENDER-PACKAGE.
  ...(process.env.NEXT_OUTPUT === "standalone"
    ? { outputFileTracingRoot: path.join(__dirname, "..") }
    : {}),
  // Prod image only (Dockerfile.prod sets NEXT_OUTPUT=standalone): minimal
  // self-contained server output. Unset in dev so `next dev`/`next start`
  // keep working unchanged in docker-compose.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  async redirects() {
    return [
      {
        // La liste des CV vit sur /cvs (cohérence libellé « Mes CVs » ↔ URL).
        // Redirection permanente pour les favoris/liens vers l'ancienne route.
        source: "/dashboard",
        destination: "/cvs",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
