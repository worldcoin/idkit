import { defineConfig } from "tsup";
import { copyFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  treeshake: true,
  outDir: "dist",
  onSuccess: async () => {
    // Copy WASM file to dist folder so it can be resolved via import.meta.url
    const wasmSrc = resolve(__dirname, "wasm/idkit_wasm_bg.wasm");
    const wasmDst = resolve(__dirname, "dist/idkit_wasm_bg.wasm");
    if (existsSync(wasmSrc)) {
      copyFileSync(wasmSrc, wasmDst);
      console.log("Copied idkit_wasm_bg.wasm to dist/");
    }
  },
});
