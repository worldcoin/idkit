import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  auditLockfile,
  auditInstalledTree,
  auditTarball,
} from "./audit-dependencies.mjs";

test("dependency audit includes optional off-platform dependencies", () => {
  const directory = mkdtempSync(join(tmpdir(), "idkit-audit-"));
  try {
    const lock = join(directory, "pnpm-lock.yaml");
    writeFileSync(
      lock,
      'importers: {}\npackages:\n  tool@1.0.0: {}\nsnapshots:\n  tool@1.0.0:\n    optionalDependencies:\n      "@img/sharp-wasm32": 1.0.0\n',
    );
    assert.throws(() => auditLockfile(lock), /WASM dependency edge/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("artifact audit finds nested binary assets and inline WASM loaders", () => {
  const directory = mkdtempSync(join(tmpdir(), "idkit-audit-"));
  try {
    const nested = join(directory, "package/dist/nested");
    mkdirSync(nested, { recursive: true });
    const tarball = join(directory, "candidate.tgz");
    writeFileSync(
      join(nested, "hidden.bin"),
      Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]),
    );
    execFileSync("tar", ["-czf", tarball, "-C", directory, "package"]);
    assert.throws(() => auditTarball(tarball), /WASM binary/);
    rmSync(join(nested, "hidden.bin"));
    writeFileSync(
      join(nested, "loader.js"),
      'WebAssembly["instantiate"](bytes)',
    );
    execFileSync("tar", ["-czf", tarball, "-C", directory, "package"]);
    assert.throws(() => auditTarball(tarball), /WASM loader/);
    writeFileSync(join(nested, "compiled.wasm"), "fixture");
    assert.throws(
      () => auditInstalledTree(join(directory, "package")),
      /WASM file/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
