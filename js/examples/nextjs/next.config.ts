import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  // Include the locally linked SDK packages in server output tracing.
  outputFileTracingRoot: fileURLToPath(new URL("../../../", import.meta.url)),
};

export default nextConfig;
