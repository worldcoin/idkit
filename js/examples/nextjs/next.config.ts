import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  // Match OpenNext's root detection for this separately installed workspace.
  outputFileTracingRoot: fileURLToPath(new URL(".", import.meta.url)),
  transpilePackages: [
    "@worldcoin/idkit",
    "@worldcoin/idkit-core",
    "@worldcoin/idkit-server",
  ],
};

export default nextConfig;
