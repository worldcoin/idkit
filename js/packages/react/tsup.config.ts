import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/signing.ts", "src/hashing.ts", "src/session.ts"],
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  outDir: "dist",
  external: ["react", "react-dom"],
});
