import { defineConfig, type Options } from "tsup";

const common: Options = {
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: false,
  treeshake: true,
  outDir: "dist",
  // Bundle ESM-only @noble deps into CJS output to avoid ERR_REQUIRE_ESM at runtime
  noExternal: ["@noble/secp256k1", "@noble/hashes"],
};

export default defineConfig([
  {
    ...common,
    entry: { index: "src/index.ts", nullifier: "src/lib/nullifier.ts" },
    platform: "browser",
    clean: ["index.*", "nullifier.*"],
  },
  {
    ...common,
    entry: ["src/node.ts"],
    platform: "node",
    clean: ["node.*"],
  },
]);
