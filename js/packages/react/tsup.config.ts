import { defineConfig } from "tsup";

export default defineConfig((options) => ({
  entry: [
    "src/index.ts",
    "src/signing.ts",
    "src/hashing.ts",
    "src/session.ts",
    "src/hooks.ts",
    "src/expo.ts",
    "src/nullifier.ts",
  ],
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: !options.watch,
  treeshake: true,
  loader: {
    ".css": "text",
    ".svg": "dataurl",
  },
  outDir: "dist",
  external: ["react", "react-dom"],
}));
