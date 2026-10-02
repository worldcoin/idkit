import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";

const root = fileURLToPath(new URL("../", import.meta.url));
const [option, corpusPath, ...extra] = process.argv.slice(2);
if (option && (option !== "--export-corpus" || !corpusPath || extra.length))
  throw new Error(
    "Usage: node scripts/run-conformance.mjs [--export-corpus <path>]",
  );
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} exited ${result.status}`);
}
run("cargo", [
  "build",
  "--locked",
  "-p",
  "idkit-core",
  "--bin",
  "idkit-conformance",
  "--features",
  "conformance",
]);
const binary = resolve(
  process.env.CARGO_TARGET_DIR ?? resolve(root, "target"),
  "debug",
  process.platform === "win32" ? "idkit-conformance.exe" : "idkit-conformance",
);
run(
  "pnpm",
  [
    "--filter",
    "@worldcoin/idkit-core",
    "exec",
    "vitest",
    "run",
    "src/conformance/conformance.test.ts",
  ],
  {
    ...process.env,
    IDKIT_RUST_ORACLE: binary,
    ...(corpusPath ? { IDKIT_CONFORMANCE_CORPUS: resolve(corpusPath) } : {}),
  },
);
// Instantiate the public type checks with today's native DTOs. Keep this file
// under ignored target/, so ordinary JS builds never need generated sources.
const output = JSON.parse(
  execFileSync(binary, [], {
    input: JSON.stringify({ op: "manifest" }) + "\n",
    encoding: "utf8",
  }),
);
if (!output.ok) throw new Error(output.error.message);
const target = resolve(root, "target");
mkdirSync(target, { recursive: true });
const directory = mkdtempSync(join(target, "conformance-"));
try {
  const contract = resolve(
    root,
    "js/packages/core/src/conformance/public-contract",
  );
  writeFileSync(
    join(directory, "contract.ts"),
    `
import type { PublicContractChecks } from ${JSON.stringify(contract)};
const rust = ${JSON.stringify(output.value)} as const;
const checks: PublicContractChecks<typeof rust> = [true, true, true, true, true, true, true, true];
`,
  );
  writeFileSync(
    join(directory, "tsconfig.json"),
    JSON.stringify({
      extends: resolve(root, "js/packages/core/tsconfig.json"),
      compilerOptions: {
        noEmit: true,
        typeRoots: [resolve(root, "js/packages/core/node_modules/@types")],
      },
      include: ["contract.ts", resolve(root, "js/packages/core/src/**/*")],
      exclude: [],
    }),
  );
  run("pnpm", [
    "--filter",
    "@worldcoin/idkit-core",
    "exec",
    "tsc",
    "--project",
    join(directory, "tsconfig.json"),
  ]);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
run(process.execPath, ["scripts/test-bridge-transcripts.mjs"], {
  ...process.env,
  IDKIT_RUST_ORACLE: binary,
});
