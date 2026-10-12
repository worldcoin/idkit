import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  // Include the locally linked SDK packages in server output tracing.
  outputFileTracingRoot: fileURLToPath(new URL("../../../", import.meta.url)),
  webpack(config, { webpack }) {
    // Match the SDK build: SVG imports are URL strings, not Next image objects.
    config.module.rules.push({
      test: /\.svg$/i,
      include: fileURLToPath(
        new URL("../../packages/react/src/", import.meta.url),
      ),
      type: "asset/resource",
    });
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        /styles\/widget\.css\?inline$/,
        (resource) => {
          const loader = fileURLToPath(
            new URL("./inline-widget-css-loader.cjs", import.meta.url),
          );
          const stylesheet = fileURLToPath(
            new URL(
              "../../packages/react/src/styles/widget.css",
              import.meta.url,
            ),
          );
          resource.request = `!!${loader}!${stylesheet}`;
        },
      ),
    );
    return config;
  },
};

export default nextConfig;
