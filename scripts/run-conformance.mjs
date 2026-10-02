import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
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
  { ...process.env, IDKIT_RUST_ORACLE: binary },
);
// Vitest transpiles TypeScript without checking types. Run tsc after the
// optional fixture refresh so the public DTO gate sees the latest manifest.
run("pnpm", ["--filter", "@worldcoin/idkit-core", "type-check"]);
run(process.execPath, ["scripts/test-bridge-transcripts.mjs"], {
  ...process.env,
  IDKIT_RUST_ORACLE: binary,
});
