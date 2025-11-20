import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  
  // Webpack config for stable development in Docker (Turbopack disabled via TURBOPACK=0)
  webpack: (config, { isServer }) => {
    // Enable file watching with polling for Docker compatibility
    if (!isServer) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    return config;
  },
};

export default nextConfig;
