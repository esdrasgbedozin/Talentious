import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Prod image only (Dockerfile.prod sets NEXT_OUTPUT=standalone): minimal
  // self-contained server output. Unset in dev so `next dev`/`next start`
  // keep working unchanged in docker-compose.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
};

export default nextConfig;
