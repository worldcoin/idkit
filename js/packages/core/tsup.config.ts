import { resolve } from "node:path";
import { portableUrlPlugin } from "./build-plugins.mjs";
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
    ],
    format: ["esm", "cjs"],
    platform: "browser",
    target: "es2020",
    noExternal,
    esbuildPlugins: [portableUrlPlugin(resolve("src/lib/url-encoding.ts"))],
    dts: true,
    splitting: false,
    sourcemap: false,
    // Separate entry builds run concurrently. Each cleans only its own outputs.
    clean: [
      "index.*",
      "signing.*",
      "hashing.*",
      "session.*",
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
    esbuildPlugins: [portableUrlPlugin(resolve("src/lib/url-encoding.ts"))],
    dts: false,
    splitting: false,
    sourcemap: false,
    treeshake: true,
    outDir: "dist",
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
