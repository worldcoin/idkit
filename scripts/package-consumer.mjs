import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PACKAGES, verifyArtifacts } from "./js-release.mjs";
import {
  auditLockfile,
  auditInstalledTree,
  auditTarball,
} from "./audit-dependencies.mjs";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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

// Release artifacts are always verified before extraction or installation. The
// local mode deliberately packs the working tree, including uncommitted edits.
export function candidatePackages(artifacts, expected = {}) {
  const directory = artifacts
    ? resolve(artifacts)
    : mkdtempSync(join(tmpdir(), "idkit-tarballs-"));
  const manifest = artifacts
    ? verifyArtifacts(directory, expected)
    : packLocal(directory);
  for (const entry of Object.values(manifest.packages))
    auditTarball(join(directory, entry.filename));
  return { directory, manifest };
}

export function installConsumer(candidate, { target, directory } = {}) {
  const scratch = directory ?? mkdtempSync(join(tmpdir(), "idkit-packages-"));
  const dependencies = { react: "18.3.1", "react-dom": "18.3.1" };
  const overrides = {};
  for (const [id, entry] of Object.entries(candidate.manifest.packages)) {
    const tarball = `file:${join(candidate.directory, entry.filename)}`;
    if (!target || id === target) dependencies[entry.name] = tarball;
    if (!target) overrides[entry.name] = tarball;
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
        // Target-only release consumers have NO overrides: prerequisites really
        // resolve from the registry according to the tarball's declared versions.
        ...(!target ? { pnpm: { overrides } } : {}),
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
