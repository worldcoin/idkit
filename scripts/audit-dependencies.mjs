import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  closeSync,
  openSync,
  readSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const wasmName = /wasm|webassembly|(?:^|[\/_-])wasi(?:$|[\/_-])/i;
const wasmFile = /\.(?:wasm|wat)(?:$|[?#])/i;
const wasmLoader =
  /\bWebAssembly\s*[.\[]|\bidkit_wasm\b|["'`][^"'`\n]*\.wasm(?:[?][^"'`\n]*)?["'`]/;

export function auditLockfile(path) {
  const lock = parse(readFileSync(path, "utf8"));
  assert(lock.importers && lock.packages, `Expected pnpm lockfile: ${path}`);
  for (const name of Object.keys(lock.packages)) {
    assert(!wasmName.test(name), `WASM dependency in ${path}: ${name}`);
    assert(
      !lock.packages[name].cpu?.some((cpu) => /wasm/i.test(cpu)),
      `WASM platform in ${name}`,
    );
  }
  // The lock includes optional dependencies for other platforms, so these are
  // checked even when they are not materialized by the current host's install.
  for (const [name, entry] of Object.entries(lock.snapshots ?? {})) {
    for (const dependency of Object.keys({
      ...entry.dependencies,
      ...entry.optionalDependencies,
    }))
      assert(
        !wasmName.test(dependency),
        `WASM dependency edge: ${name} -> ${dependency}`,
      );
  }
  return Object.keys(lock.packages).length;
}

export function auditInstalledTree(directory) {
  const seen = new Set();
  function visit(path) {
    const real = realpathSync(path);
    if (seen.has(real)) return;
    seen.add(real);
    const stat = statSync(real);
    if (stat.isDirectory()) {
      for (const file of readdirSync(real)) visit(join(real, file));
      return;
    }
    assert(
      !wasmFile.test(real),
      `WASM file in installed dependency graph: ${real}`,
    );
    if (stat.isFile()) {
      const descriptor = openSync(real, "r");
      const header = Buffer.alloc(4);
      try {
        readSync(descriptor, header, 0, 4, 0);
      } finally {
        closeSync(descriptor);
      }
      assert(
        !header.equals(Buffer.from([0, 97, 115, 109])),
        `WASM binary in installed dependency graph: ${real}`,
      );
    }
    if (real.endsWith("/package.json")) {
      const manifest = JSON.parse(readFileSync(real, "utf8"));
      assert(
        !wasmName.test(manifest.name ?? ""),
        `WASM installed package: ${manifest.name}`,
      );
    }
  }
  visit(directory);
  return seen.size;
}

export function auditTarball(path) {
  const files = execFileSync("tar", ["-tzf", path], { encoding: "utf8" })
    .trim()
    .split("\n");
  assert(files.length > 0, `Empty package: ${path}`);
  for (const file of files) {
    assert(
      file.startsWith("package/") && !file.split("/").includes(".."),
      `Unsafe tarball member: ${file}`,
    );
    assert(!wasmFile.test(file), `WASM artifact: ${path}:${file}`);
    if (file.endsWith("/")) continue;
    const content = execFileSync("tar", ["-xOf", path, file], {
      maxBuffer: 20 * 1024 * 1024,
    });
    assert(
      !content.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109])),
      `WASM binary: ${file}`,
    );
    if (/\.(?:mjs|cjs|js)$/.test(file))
      assert(
        !wasmLoader.test(content.toString("utf8")),
        `WASM loader: ${file}`,
      );
    if (file === "package/package.json") {
      const manifest = JSON.parse(content);
      for (const dependencies of [
        manifest.dependencies,
        manifest.optionalDependencies,
        manifest.devDependencies,
      ])
        for (const name of Object.keys(dependencies ?? {}))
          assert(!wasmName.test(name), `WASM dependency in tarball: ${name}`);
    }
  }
  return files.length;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const packages = auditLockfile(join(root, "pnpm-lock.yaml"));
  const files = auditInstalledTree(join(root, "node_modules"));
  console.log(
    `SDK workspace: ${packages} locked packages and ${files} installed paths contain no WASM dependencies/assets.`,
  );
}
