import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { portableUrlPlugin } from "../js/packages/core/build-plugins.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const binary = process.env.HERMES_BIN;
if (!binary)
  throw new Error("Set HERMES_BIN to the React Native Hermes VM executable.");
const require = createRequire(resolve(root, "js/packages/core/package.json"));
const { build } = require("tsup");
const { transformFileSync } = require("@babel/core");
const directory = mkdtempSync(join(tmpdir(), "idkit-hermes-entry-"));
const marker = "IDKIT_HERMES_ENTRY_RESULT:";

try {
  const corpus = join(directory, "corpus.json");
  execFileSync(
    process.execPath,
    [resolve(root, "scripts/run-conformance.mjs"), "--export-corpus", corpus],
    { cwd: root, stdio: "inherit" },
  );
  const entry = join(directory, "entry.ts");
  writeFileSync(
    entry,
    `
import { assertConformanceRejection, dispatch } from ${JSON.stringify(resolve(root, "js/packages/core/src/conformance/dispatch.ts"))};
import corpus from ${JSON.stringify(corpus)};
import { IDKit, configureIDKitRuntime, hashSignal, getSessionCommitment } from ${JSON.stringify(resolve(root, "js/packages/core/dist/index.js"))};
import { IDKit as ReactIDKit, useIDKitRequest, useIDKitSession, useIDKitInviteCodeRequest, configureIDKitRuntime as configureHooksRuntime } from ${JSON.stringify(resolve(root, "js/packages/react/dist/hooks.js"))};
// The standalone Hermes VM lacks AbortController. React Native supplies it.
// Model only that host API here; actual fetch cancellation is tested in RN.
class TestAbortController {
  constructor() {
    const listeners = new Set();
    this.signal = {
      aborted: false,
      addEventListener(type, listener) { if (type === "abort") listeners.add(listener); },
      removeEventListener(type, listener) { if (type === "abort") listeners.delete(listener); },
    };
    this.abort = () => {
      if (this.signal.aborted) return;
      this.signal.aborted = true;
      for (const listener of listeners) listener();
      listeners.clear();
    };
  }
}
globalThis.AbortController = TestAbortController;
function check(value, message) { if (!value) throw new Error(message); }
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") return "{" + Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => JSON.stringify(key) + ":" + canonical(value[key])).join(",") + "}";
  return JSON.stringify(value);
}
async function main() {
  for (const test of corpus.cases) {
    let value, failure;
    let rejected = false;
    try { value = dispatch(test.input); } catch (error) { rejected = true; failure = error; }
    if (test.expected.ok) {
      check(!rejected, test.name + ": " + String(failure));
      check(canonical(value) === canonical(test.expected.value), test.name + ": Rust output mismatch");
    } else {
      check(rejected, test.name + ": accepted input rejected by Rust");
      assertConformanceRejection(test.input.op, test.expected.error, failure);
    }
  }
  print("Hermes: " + corpus.cases.length + " live Rust cases PASS");
  check(typeof useIDKitRequest === "function" && typeof useIDKitSession === "function" && typeof useIDKitInviteCodeRequest === "function", "hooks imports");
  check(configureHooksRuntime === configureIDKitRuntime, "hooks/core runtime configuration must share an instance");
  check(hashSignal("hello") === "0x001c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36dea", "hashing facade");
  check(getSessionCommitment("session_" + "00".repeat(31) + "01" + "02".repeat(32)) === 1n, "server session facade");
  const config = { app_id:"app_staging_test", action:"test", allow_legacy_proofs:false, rp_context:{rp_id:"rp_1234567890abcdef",nonce:"0x"+"00".repeat(31)+"01",created_at:1,expires_at:2,signature:"0x"+"00".repeat(64)+"1b"} };
  let missingEntropyRejected = false;
  try { await IDKit.request(config).preset({type:"ProofOfHuman"}); }
  catch (error) { missingEntropyRejected = String(error).includes("cryptographically secure randomness"); }
  check(missingEntropyRejected, "missing entropy must fail closed");
  let counter = 0;
  let posts = 0;
  configureHooksRuntime({
    // Deterministic synthetic entropy is exclusively for this test. A host app
    // must supply its cryptographically secure random implementation.
    getRandomValues(bytes) { for (let i=0; i<bytes.length; i++) bytes[i]=(counter++)%256; return bytes; },
    async fetch(url, init) {
      if (init?.method === "POST") {
        posts++;
        const body = JSON.parse(init.body);
        check(typeof body.iv === "string" && typeof body.payload === "string", "encrypted request envelope");
        const response = {request_id:body.request_id ?? "hermes-request"};
        return {ok:true,status:200,text:async()=>JSON.stringify(response),json:async()=>response};
      }
      return {ok:true,status:200,text:async()=>JSON.stringify({status:"initialized"}),json:async()=>({status:"initialized"})};
    },
  });
  const request = await IDKit.request(config).preset({type:"ProofOfHuman",signal:"🌍"});
  check(request.connectorURI.startsWith("https://world.org/verify?t=wld"), "connector URI");
  check((await request.pollOnce()).type === "waiting_for_connection", "poll result");
  check(request.getDebugReport().request_payload.package_name === "idkit_js_core", "core namespace metadata");
  const invite = await ReactIDKit.requestWithInviteCode(config).preset({type:"ProofOfHuman"});
  check(/&c=[A-Z0-9]{6}&a=app_staging_test$/.test(invite.connectorURI), "invite connector");
  check(typeof invite.expiresAt === "number", "invite expiry");
  check(invite.getDebugReport().request_payload.package_name === "idkit_react", "React namespace metadata");
  check(posts === 2, "request and invite POST count");
  check(globalThis.crypto === undefined && globalThis.URL === undefined && globalThis.TextEncoder === undefined && globalThis.TextDecoder === undefined, "SDK must not install platform globals");
  return {ok:true, requests:posts};
}
main().then(value=>print(${JSON.stringify(marker)}+JSON.stringify(value)), error=>print(${JSON.stringify(marker)}+JSON.stringify({ok:false,error:String(error),stack:error?.stack})));
`,
  );

  let inputs = [];
  await build({
    entry: [entry],
    config: false,
    format: ["iife"],
    platform: "browser",
    target: "es2020",
    noExternal: [/.*/],
    outDir: directory,
    dts: false,
    splitting: false,
    treeshake: true,
    silent: true,
    esbuildOptions(options) {
      options.metafile = true;
      options.supported = { ...options.supported, "async-await": false };
    },
    esbuildPlugins: [
      portableUrlPlugin(
        resolve(root, "js/packages/core/src/lib/url-encoding.ts"),
      ),
      {
        name: "inspect-portable-imports",
        setup(builder) {
          builder.onEnd((result) => {
            inputs = Object.keys(result.metafile?.inputs ?? {});
          });
        },
      },
    ],
  });
  assert(
    inputs.some((path) => path.endsWith("server/dist/index.js")),
    "server portable export must be selected",
  );
  assert(
    !inputs.some((path) =>
      /server\/dist\/node\.|core\/dist\/node\.|react-dom|qrcode/.test(path),
    ),
    "portable hooks must not load Node or web widget modules",
  );
  const bundle = join(directory, "entry.global.js");
  // Match Metro syntax; the entry supplies a test AbortController, not a native renderer.
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
    `globalThis.crypto=undefined; globalThis.URL=undefined; globalThis.TextEncoder=undefined; globalThis.TextDecoder=undefined; globalThis.WebAssembly=undefined;\n${transformed.code}`,
  );
  const result = spawnSync(binary, ["-Xmicrotask-queue", "-exec", bundle], {
    encoding: "utf8",
    timeout: 60_000,
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    result.stderr
      .split("\n")
      .filter((line) => /error:|Error| at /.test(line))
      .join("\n") || result.stderr.slice(-4000),
  );
  const report = result.stdout
    .split("\n")
    .find((line) => line.startsWith(marker));
  assert(
    report,
    `Hermes did not finish the async entry smoke: ${result.stdout}\n${result.stderr}`,
  );
  const outcome = JSON.parse(report.slice(marker.length));
  if (!outcome.ok) {
    const line = Number(outcome.stack?.match(/entry\.global\.js:(\d+):/)?.[1]);
    if (line)
      console.error(
        transformed.code
          .split("\n")
          .slice(line - 3, line + 1)
          .join("\n"),
      );
  }
  assert.deepEqual(outcome, { ok: true, requests: 2 });
  console.log(
    `Hermes: ${JSON.parse(readFileSync(corpus, "utf8")).cases.length} live Rust cases + built core/hooks PASS (no crypto/URL/UTF-8/WASM globals)`,
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
