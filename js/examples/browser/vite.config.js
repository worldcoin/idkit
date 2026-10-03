import { defineConfig } from "vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const idkitGlobal = fileURLToPath(
  new URL("../../packages/core/dist/idkit.global.js", import.meta.url),
);

export default defineConfig({
  plugins: [
    {
      name: "local-idkit-browser-build",
      configureServer(server) {
        server.middlewares.use(
          "/idkit.global.js",
          (_request, response, next) => {
            try {
              response.setHeader("Content-Type", "text/javascript");
              response.end(readFileSync(idkitGlobal));
            } catch (error) {
              next(error);
            }
          },
        );
      },
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "idkit.global.js",
          source: readFileSync(idkitGlobal),
        });
      },
    },
  ],
  server: {
    port: 4000,
    open: true,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
