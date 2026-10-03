import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditLockfile,
  auditInstalledTree,
  auditTarball,
} from "./audit-dependencies.mjs";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGES = {
  server: "@worldcoin/idkit-server",
  core: "@worldcoin/idkit-core",
  react: "@worldcoin/idkit",
};
export const pnpmVersion = "9.15.4";
export function runPnpm(args, cwd = root) {
  const cli = process.env.npm_execpath;
  const command = cli?.includes("pnpm") ? process.execPath : "corepack";
  const prefix = cli?.includes("pnpm") ? [cli] : ["pnpm"];
  assert.equal(
    execFileSync(command, [...prefix, "--version"], {
      cwd,
      encoding: "utf8",
    }).trim(),
    pnpmVersion,
  );
  execFileSync(command, [...prefix, ...args], { cwd, stdio: "inherit" });
}

export function packLocal(directory) {
  const packages = {};
  for (const [id, name] of Object.entries(PACKAGES)) {
    const cwd = join(root, "js/packages", id);
    const manifest = JSON.parse(
      readFileSync(join(cwd, "package.json"), "utf8"),
    );
    runPnpm(["pack", "--pack-destination", directory], cwd);
    const filename = `${name.replace(/^@/, "").replaceAll("/", "-")}-${manifest.version}.tgz`;
    packages[id] = { name, version: manifest.version, filename };
    auditTarball(join(directory, filename));
  }
  return { packages };
}

export function candidatePackages() {
  const directory = mkdtempSync(join(tmpdir(), "idkit-tarballs-"));
  return { directory, manifest: packLocal(directory) };
}

export function installConsumer(candidate) {
  const scratch = mkdtempSync(join(tmpdir(), "idkit-packages-"));
  const dependencies = { react: "18.3.1", "react-dom": "18.3.1" };
  const overrides = {};
  for (const entry of Object.values(candidate.manifest.packages)) {
    const tarball = `file:${join(candidate.directory, entry.filename)}`;
    dependencies[entry.name] = tarball;
    overrides[entry.name] = tarball;
  }
  writeFileSync(
    join(scratch, "package.json"),
    JSON.stringify(
      {
        name: "idkit-packed-consumer",
        private: true,
        type: "module",
        packageManager: `pnpm@${pnpmVersion}`,
        dependencies,
        pnpm: { overrides },
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(join(scratch, ".npmrc"), "auto-install-peers=false\n");
  runPnpm(["install", "--prefer-offline", "--ignore-scripts"], scratch);
  auditLockfile(join(scratch, "pnpm-lock.yaml"));
  auditInstalledTree(join(scratch, "node_modules"));
  return scratch;
}
