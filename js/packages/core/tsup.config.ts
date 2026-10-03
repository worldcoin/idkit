import { resolve } from "node:path";
import { portableUrlPlugin, sharedRuntimePlugin } from "./build-plugins.mjs";
import { defineConfig } from "tsup";

const noExternal = [
  "@noble/hashes",
  "@noble/ciphers",
  "@scure/base",
  "@stablelib/utf8",
  "whatwg-url",
  "tr46",
  "punycode",
];

export default defineConfig([
  {
    entry: [
      "src/index.ts",
      "src/signing.ts",
      "src/hashing.ts",
      "src/session.ts",
      "src/expo.ts",
    ],
    format: ["esm", "cjs"],
    platform: "browser",
    target: "es2020",
    noExternal,
    external: ["expo-crypto"],
    esbuildPlugins: [
      portableUrlPlugin(resolve("src/lib/url-encoding.ts")),
      sharedRuntimePlugin(resolve("src/lib/runtime.ts")),
    ],
    dts: true,
    splitting: false,
    sourcemap: false,
    // Separate entry builds run concurrently. Each cleans only its own outputs.
    clean: [
      "index.*",
      "signing.*",
      "hashing.*",
      "session.*",
      "expo.*",
      "*.wasm",
      "idkit_wasm*",
    ],
    treeshake: true,
    outDir: "dist",
  },
  {
    entry: ["src/node.ts"],
    clean: ["node.*"],
    format: ["esm", "cjs"],
    platform: "browser",
    external: ["node:crypto"],
    target: "es2020",
    noExternal,
    esbuildPlugins: [
      portableUrlPlugin(resolve("src/lib/url-encoding.ts")),
      sharedRuntimePlugin(resolve("src/lib/runtime.ts")),
    ],
    dts: false,
    splitting: false,
    sourcemap: false,
    treeshake: true,
    outDir: "dist",
  },
  {
    // A CJS leaf has one module instance under both import() and require().
    // Portable bundlers can inline it; the separate IIFE keeps its own runtime.
    entry: { runtime: "src/lib/runtime.ts" },
    clean: ["runtime.*"],
    format: ["cjs"],
    platform: "browser",
    target: "es2020",
    dts: false,
    splitting: false,
    sourcemap: false,
    treeshake: true,
    outDir: "dist",
    outExtension: () => ({ js: ".cjs" }),
  },
  {
    entry: { idkit: "src/browser.ts" },
    clean: ["idkit.global.*"],
    format: ["iife"],
    globalName: "IDKitBundle",
    platform: "browser",
    target: "es2020",
    noExternal,
    esbuildPlugins: [portableUrlPlugin(resolve("src/lib/url-encoding.ts"))],
    dts: false,
    splitting: false,
    sourcemap: false,
    treeshake: true,
    minify: true,
    outDir: "dist",
    outExtension: () => ({ js: ".global.js" }),
  },
]);
