import { defineConfig } from "tsup";
import { copyFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const moduleCleanPaths = [
  "index.*",
  "internal.*",
  "signing.*",
  "hashing.*",
  "session.*",
];

function copyWasmToDist(): void {
  // Copy WASM file to dist folder so it can be resolved by ESM imports and the
  // script-tag build when published to a CDN.
  const wasmSrc = resolve(__dirname, "wasm/idkit_wasm_bg.wasm");
  const wasmDst = resolve(__dirname, "dist/idkit_wasm_bg.wasm");
  if (existsSync(wasmSrc)) {
    copyFileSync(wasmSrc, wasmDst);
    console.log("Copied idkit_wasm_bg.wasm to dist/");
  }
}

export default defineConfig([
  {
    entry: [
      "src/index.ts",
      "src/internal.ts",
      "src/signing.ts",
      "src/hashing.ts",
      "src/session.ts",
    ],
    format: ["esm", "cjs"],
    dts: true,
    splitting: false,
    sourcemap: false,
    clean: moduleCleanPaths,
    treeshake: true,
    outDir: "dist",
    onSuccess: copyWasmToDist,
  },
  {
    entry: { idkit: "src/browser.ts" },
    format: ["iife"],
    globalName: "IDKitBundle",
    platform: "browser",
    target: "es2020",
    dts: false,
    splitting: false,
    sourcemap: false,
    clean: ["idkit.global.js"],
    treeshake: true,
    minify: true,
    outDir: "dist",
    outExtension: () => ({ js: ".global.js" }),
    onSuccess: copyWasmToDist,
  },
]);
