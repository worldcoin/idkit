import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { portableUrlPlugin } from "../js/packages/core/build-plugins.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const binary = process.env.HERMES_BIN;
if (!binary)
  throw new Error(
    "Set HERMES_BIN to the Hermes JavaScript VM executable from your React Native distribution (not hermesc).",
  );
const require = createRequire(resolve(root, "js/packages/core/package.json"));
const { build } = require("tsup");
const { transformFileSync } = require("@babel/core");
const directory = mkdtempSync(join(tmpdir(), "idkit-hermes-"));
try {
  process.stdout.write(
    execFileSync(binary, ["-version"], { encoding: "utf8" }),
  );
  const entry = join(directory, "compatibility.ts");
  writeFileSync(
    entry,
    `
import { assertConformanceRejection, dispatch } from ${JSON.stringify(resolve(root, "js/packages/core/src/conformance/dispatch.ts"))};
import corpus from ${JSON.stringify(resolve(root, "js/packages/core/src/conformance/fixtures.json"))};
function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  return JSON.stringify(value);
}
const failures: string[] = [];
for (const test of corpus.cases) {
  let value: unknown;
  let failure: unknown;
  let rejected = false;
  try { value = dispatch(test.input); } catch (error) { rejected = true; failure = error; }
  if (test.expected.ok) {
    if (rejected) failures.push(test.name + ": " + String(failure));
    else if (canonical(value) !== canonical(test.expected.value)) failures.push(test.name + ": output mismatch: " + canonical(value).slice(0, 180));
  } else if (!rejected) failures.push(test.name + ": accepted input rejected by Rust");
  else {
    try { assertConformanceRejection(test.input.op, test.expected.error, failure); }
    catch (error) { failures.push(test.name + ": " + String(error)); }
  }
}
print(JSON.stringify({engine: "Hermes", cases: corpus.cases.length, failures}));
if (failures.length) throw new Error("Hermes compatibility failures: " + failures.length);
`,
  );
  await build({
    entry: [entry],
    config: false,
    format: ["iife"],
    platform: "browser",
    target: "es2020",
    noExternal: [
      "@noble/hashes",
      "@noble/ciphers",
      "@scure/base",
      "@stablelib/utf8",
      "whatwg-url",
      "tr46",
      "punycode",
    ],
    esbuildPlugins: [
      portableUrlPlugin(
        resolve(root, "js/packages/core/src/lib/url-encoding.ts"),
      ),
    ],
    outDir: directory,
    dts: false,
    splitting: false,
    treeshake: true,
    silent: true,
  });
  const bundle = join(directory, "compatibility.global.js");
  // Metro lowers classes and per-iteration lexical bindings before invoking
  // Hermes. The standalone VM needs those transforms too. This adds no
  // platform or crypto polyfills and does not run the Metro bundler.
  const transformed = transformFileSync(bundle, {
    configFile: false,
    babelrc: false,
    compact: false,
    plugins: [
      require.resolve("@babel/plugin-transform-classes"),
      require.resolve("@babel/plugin-transform-block-scoping"),
    ],
  });
  if (!transformed?.code) throw new Error("Babel produced no Hermes input");
  writeFileSync(
    bundle,
    `globalThis.TextEncoder = undefined; globalThis.TextDecoder = undefined;\n${transformed.code}`,
  );
  const result = spawnSync(binary, ["-exec", bundle], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
