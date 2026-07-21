import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
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
