import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { candidatePackages, installConsumer } from "./package-consumer.mjs";

const args = process.argv.slice(2);
if (args.length % 2)
  throw new Error(
    "Expected --artifacts directory [--target server|core|react] [--source-sha sha]",
  );
const options = Object.fromEntries(
  Array.from({ length: args.length / 2 }, (_, i) => [
    args[i * 2],
    args[i * 2 + 1],
  ]),
);
const candidate = candidatePackages(options["--artifacts"], {
  target: options["--target"],
  sourceSha: options["--source-sha"],
});
const scratch = installConsumer(candidate);
function run(cmd, args, cwd = scratch) {
  const result = spawnSync(cmd, args, { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const body = `
const assert = require('node:assert/strict');
Object.defineProperty(globalThis, 'crypto', {value: undefined, configurable: true});
const core = CORE_IMPORT;
const hooks = HOOKS_IMPORT;
if (hooks) { assert.equal(typeof hooks.useIDKitRequest, 'function'); assert.equal(hooks.configureIDKitRuntime, core.configureIDKitRuntime); }
assert.equal(core.hashSignal('hello'), '0x001c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36dea');
const signature = core.signRequest({signingKeyHex:'ab'.repeat(32), action:'test'});
assert.match(signature.sig, /^0x[0-9a-f]{130}$/);
assert.equal(globalThis.crypto, undefined, 'Node fallback must not mutate the global');
const config = {app_id:'app_staging_test',action:'test',allow_legacy_proofs:false,rp_context:{rp_id:'rp_1234567890abcdef',nonce:'0x'+'00'.repeat(31)+'01',created_at:1,expires_at:2,signature:'0x'+'00'.repeat(64)+'1b'}};
let postCount=0;
core.configureIDKitRuntime({fetch:async (url,init)=>{
 if(init?.method === 'POST'){postCount++;const body=JSON.parse(init.body);assert.ok(body.iv && body.payload);return {ok:true,status:200,json:async()=>({request_id:body.request_id??'test-request'})};}
 return {ok:true,status:200,json:async()=>({status:'initialized'})};
}});
const request=await core.IDKit.request(config).preset(core.proofOfHuman());
assert.equal(request.getDebugReport().request_payload.package_version, EXPECTED_VERSION);
assert.equal(request.getDebugReport().request_payload.package_name, EXPECTED_NAMESPACE);
assert.match(request.connectorURI,/^https:\\/\\/world.org\\/verify\\?t=wld/);
assert.equal((await request.pollOnce()).type,'waiting_for_connection');
const invite=await core.IDKit.requestWithInviteCode(config).preset(core.proofOfHuman());
assert.match(invite.connectorURI,/&c=[A-Z0-9]{6}&a=app_staging_test$/);
assert.equal(typeof invite.expiresAt,'number');
assert.equal(postCount,2);
console.log('Packed FORMAT core/hooks: import, hashing, signing, bridge and invite PASS');
`;
writeFileSync(
  join(scratch, "smoke.cjs"),
  `(async()=>{${body.replace("CORE_IMPORT", "require('@worldcoin/idkit-core')").replace("HOOKS_IMPORT", "require('@worldcoin/idkit/hooks')").replace("EXPECTED_VERSION", JSON.stringify(candidate.manifest.packages.core.version)).replace("EXPECTED_NAMESPACE", JSON.stringify("idkit_js_core")).replace("FORMAT", "CommonJS")}})().catch(e=>{console.error(e);process.exitCode=1});`,
);
writeFileSync(
  join(scratch, "smoke.mjs"),
  `import {createRequire} from 'node:module';const require=createRequire(import.meta.url);\n${body.replace("CORE_IMPORT", "await import('@worldcoin/idkit-core')").replace("HOOKS_IMPORT", "await import('@worldcoin/idkit/hooks')").replace("EXPECTED_VERSION", JSON.stringify(candidate.manifest.packages.core.version)).replace("EXPECTED_NAMESPACE", JSON.stringify("idkit_js_core")).replace("FORMAT", "ESM")}`,
);
writeFileSync(
  join(scratch, "smoke-native.mjs"),
  `
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomFillSync} from 'node:crypto';
const require = createRequire(import.meta.url);
const esm = await import('@worldcoin/idkit-core');
const cjs = require('@worldcoin/idkit-core');
const hooks = await import('@worldcoin/idkit/hooks');
assert.equal(esm.configureIDKitRuntime, cjs.configureIDKitRuntime);
assert.equal(esm.configureIDKitRuntime, hooks.configureIDKitRuntime);
assert.equal(esm.configureIDKitRuntime, require('@worldcoin/idkit/hooks').configureIDKitRuntime);
let creates=0;
esm.configureIDKitRuntime({getRandomValues:randomFillSync,fetch:async (_url,init)=>{
  assert.equal(init.method,'POST'); assert.ok(init.signal); creates++;
  return {ok:true,status:200,json:async()=>({request_id:'mixed-import'})};
}});
await cjs.IDKit.request({app_id:'app_staging_test',action:'test',allow_legacy_proofs:false,rp_context:{rp_id:'rp_1234567890abcdef',nonce:'0x'+'00'.repeat(31)+'01',created_at:1,expires_at:2,signature:'0x'+'00'.repeat(64)+'1b'}}).preset(cjs.proofOfHuman());
assert.equal(creates,1);
console.log('Packed React Native condition: mixed ESM/CommonJS core/hooks share configured runtime PASS');
`,
);
run(
  process.execPath,
  ["--conditions=react-native", "smoke-native.mjs"],
  scratch,
);
run(process.execPath, ["smoke.cjs"], scratch);
run(process.execPath, ["smoke.mjs"], scratch);
console.log(`Packed consumer retained for other Node versions: ${scratch}`);

if (options["--artifacts"] && options["--target"]) {
  const target = options["--target"];
  const registryConsumer = installConsumer(candidate, { target });
  const entry = candidate.manifest.packages[target];
  // This install includes only the target tarball. All IDKit prerequisites are
  // resolved from the registry, with no overrides to conceal bad version pins.
  const serverSmoke = `const assert=require('node:assert/strict');Object.defineProperty(globalThis,'crypto',{value:undefined,configurable:true});const sdk=SDK_IMPORT;const signature=sdk.signRequest({signingKeyHex:'ab'.repeat(32),action:'test'});assert.match(signature.sig,/^0x[0-9a-f]{130}$/);assert.equal(globalThis.crypto,undefined);console.log('Registry prerequisite graph: ${entry.name} FORMAT PASS');`;
  for (const [extension, format] of [
    ["cjs", "CommonJS"],
    ["mjs", "ESM"],
  ]) {
    const load = (spec) =>
      extension === "cjs" ? `require('${spec}')` : `(await import('${spec}'))`;
    const smoke =
      target === "server"
        ? serverSmoke.replace("SDK_IMPORT", load(entry.name))
        : body
            .replace(
              "CORE_IMPORT",
              target === "core"
                ? load(entry.name)
                : `({...${load(entry.name + "/hooks")}, ...${load(entry.name + "/hashing")}})`,
            )
            .replace(
              "HOOKS_IMPORT",
              target === "react" ? load(entry.name + "/hooks") : "null",
            )
            .replace(
              "Packed FORMAT core/hooks",
              `Registry prerequisite graph: ${entry.name} FORMAT`,
            );
    const content = smoke
      .replace("EXPECTED_VERSION", JSON.stringify(entry.version))
      .replace(
        "EXPECTED_NAMESPACE",
        JSON.stringify(target === "react" ? "idkit_react" : "idkit_js_core"),
      )
      .replace("FORMAT", format);
    writeFileSync(
      join(registryConsumer, `target.${extension}`),
      extension === "cjs"
        ? `(async()=>{${content}})().catch(e=>{console.error(e);process.exitCode=1});`
        : `import {createRequire} from 'node:module';const require=createRequire(import.meta.url);\n${content}`,
    );
    run(process.execPath, [`target.${extension}`], registryConsumer);
  }
}
