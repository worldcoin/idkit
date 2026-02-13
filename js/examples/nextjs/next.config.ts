import type { NextConfig } from "next";

// **Note**: This is a workaround to make the vercel deployment work with idkit.
// You do NOT need to do this in your own project, because the idkit package is pulled from npm and not linked from the monorepo.
const nextConfig: NextConfig = {
  // Prevent Next.js from bundling idkit-core on the server.
  // This preserves the file structure so import.meta.url resolves
  // the .wasm file correctly from node_modules.
  serverExternalPackages: ["@worldcoin/idkit-core"],

  // Include the WASM binary in serverless function bundles
  outputFileTracingIncludes: {
    "/api/rp-signature": ["../../packages/core/dist/*.wasm"],
  },
};

export default nextConfig;
