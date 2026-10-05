import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { candidatePackages, installConsumer } from "./package-consumer.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(resolve(root, "js/packages/core/package.json"));
const { build } = require("tsup");
const runtimeRequire = createRequire(
  resolve(root, "tools/runtime/package.json"),
);
const { chromium } = runtimeRequire("playwright");
const { Miniflare } = runtimeRequire("miniflare");
const candidate = candidatePackages();
const consumer = installConsumer(candidate);
const coreDirectory = resolve(consumer, "node_modules/@worldcoin/idkit-core");
const reactDirectory = resolve(consumer, "node_modules/@worldcoin/idkit");
const directory = mkdtempSync(join(tmpdir(), "idkit-portable-"));
const config = {
  app_id: "app_staging_test",
  action: "test",
  allow_legacy_proofs: false,
  rp_context: {
    rp_id: "rp_1234567890abcdef",
    nonce: "0x" + "00".repeat(31) + "01",
    created_at: 1,
    expires_at: 2,
    signature: "0x" + "00".repeat(64) + "1b",
  },
};
const check = `
function check(value, message) { if (!value) throw new Error(message); }
async function smoke(IDKit) {
  const config = ${JSON.stringify(config)};
  const request = await IDKit.request(config).preset({type:"ProofOfHuman",signal:"🌍"});
  check(request.connectorURI.startsWith("https://world.org/verify?t=wld"), "connector URI");
  check((await request.pollOnce()).type === "waiting_for_connection", "poll state");
  const invite = await IDKit.requestWithInviteCode(config).preset({type:"ProofOfHuman"});
  check(/&c=[A-Z0-9]{6}&a=app_staging_test$/.test(invite.connectorURI), "invite code");
  check(typeof invite.expiresAt === "number", "invite expiry");
  check(request.getDebugReport().request_payload.proof_request.id.length === 36, "request UUID");
  check(request.getDebugReport().request_payload.package_version === ${JSON.stringify(candidate.manifest.packages.core.version)}, "packed version metadata");
  return {ok:true, requests:2};
}
const fakeFetch = async (_url,init) => {
  if(init?.method === "POST") {
    const body = JSON.parse(init.body);
    check(typeof body.iv === "string" && typeof body.payload === "string", "encrypted POST");
    return new Response(JSON.stringify({request_id:body.request_id ?? "test-request"}));
  }
  return new Response(JSON.stringify({status:"initialized"}));
};
`;
const entry = join(directory, "portable.ts");
writeFileSync(
  entry,
  `
import { IDKit, configureIDKitRuntime, hashSignal } from ${JSON.stringify(resolve(coreDirectory, "dist/index.js"))};
import { useIDKitRequest } from ${JSON.stringify(resolve(reactDirectory, "dist/hooks.js"))};
${check}
export async function run() {
  check(typeof useIDKitRequest === "function", "headless hooks import");
  check(hashSignal("hello") === "0x001c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36dea", "hash vector");
  configureIDKitRuntime({fetch:fakeFetch});
  return smoke(IDKit);
}
export default { async fetch() { return Response.json(await run()); } };
`,
);
let browser;
let worker;
try {
  await build({
    entry: [entry],
    config: false,
    format: ["esm"],
    platform: "browser",
    target: "es2020",
    noExternal: [/.*/],
    outDir: directory,
    dts: false,
    splitting: false,
    treeshake: true,
    silent: true,
    outExtension: () => ({ js: ".js" }),
  });
  const module = readFileSync(join(directory, "portable.js"), "utf8");
  assert.doesNotMatch(
    module,
    /(?:from\s*|require\()["']node:|WebAssembly\.|idkit_wasm/,
  );
  worker = new Miniflare({
    modules: true,
    script: module,
    compatibilityDate: "2025-01-01",
    cf: false,
  });
  assert.deepEqual(
    await (await worker.dispatchFetch("https://idkit.test")).json(),
    { ok: true, requests: 2 },
  );
  console.log(
    "workerd: browser export + hooks, hashing, bridge, invite PASS (no nodejs_compat)",
  );
  browser = await chromium.launch(
    process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {},
  );
  const page = await browser.newPage();
  // A local secure origin supplies browser entropy without any external service.
  await page.route("https://idkit.test/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>IDKit compatibility</title>",
    }),
  );
  await page.goto("https://idkit.test/");
  await page.evaluate(() => {
    globalThis.WebAssembly = undefined;
  });
  const result = await page.evaluate(async (source) => {
    const url = URL.createObjectURL(
      new Blob([source], { type: "text/javascript" }),
    );
    try {
      return await (await import(url)).run();
    } finally {
      URL.revokeObjectURL(url);
    }
  }, module);
  assert.deepEqual(result, { ok: true, requests: 2 });
  console.log(
    "Chromium: browser ESM + hooks, hashing, bridge, invite PASS (WebAssembly absent)",
  );
  await page.addScriptTag({
    content: `${check}\nglobalThis.fetch = fakeFetch; globalThis.checkIife = smoke;`,
  });
  await page.addScriptTag({
    content: readFileSync(
      resolve(coreDirectory, "dist/idkit.global.js"),
      "utf8",
    ),
  });
  assert.deepEqual(
    await page.evaluate(() => globalThis.checkIife(globalThis.IDKit)),
    { ok: true, requests: 2 },
  );
  console.log(
    "Chromium: distributed IIFE bridge + invite PASS (WebAssembly absent)",
  );
} finally {
  await browser?.close();
  await worker?.dispose();
  rmSync(directory, { recursive: true, force: true });
}
