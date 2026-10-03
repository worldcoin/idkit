import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", nullifier: "src/lib/nullifier.ts" },
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  treeshake: true,
  outDir: "dist",
  // Bundle ESM-only @noble deps into CJS output to avoid ERR_REQUIRE_ESM at runtime
  noExternal: ["@noble/secp256k1", "@noble/hashes"],
});
