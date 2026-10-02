import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PACKAGES = {
  server: "@worldcoin/idkit-server",
  core: "@worldcoin/idkit-core",
  react: "@worldcoin/idkit",
};
export const MANIFEST = "release-manifest.json";
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) =>
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
const digest = (path) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const packagePath = (root, id) => join(root, "js/packages", id);
const manifestPath = (root, id) => join(packagePath(root, id), "package.json");
const filename = (name, version) =>
  `${name.replace(/^@/, "").replaceAll("/", "-")}-${version}.tgz`;
const exec = (command, args, options = {}) =>
  execFileSync(command, args, { encoding: "utf8", ...options });

function versionParts(version) {
  assert.equal(typeof version, "string", "Package versions must be strings");
  const parsed = version.match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/,
  );
  assert(parsed, `Invalid package version: ${version}`);
  for (const identifier of parsed[4]?.split(".") ?? []) {
    assert(
      identifier && !/^0\d+$/.test(identifier),
      `Invalid prerelease version: ${version}`,
    );
  }
  assert(
    !parsed[5]?.split(".").some((identifier) => !identifier),
    `Invalid build version: ${version}`,
  );
  return { stable: parsed.slice(1, 4).map(BigInt), pre: parsed[4]?.split(".") };
}

export function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let i = 0; i < 3; i++)
    if (a.stable[i] !== b.stable[i]) return a.stable[i] > b.stable[i] ? 1 : -1;
  if (!a.pre || !b.pre) return a.pre ? -1 : b.pre ? 1 : 0;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === y) continue;
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const xn = /^\d+$/.test(x);
    const yn = /^\d+$/.test(y);
    if (xn && yn) return BigInt(x) > BigInt(y) ? 1 : -1;
    if (xn !== yn) return xn ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}

export function planRelease({ target, tag, sourceSha, manifests }) {
  assert(Object.hasOwn(PACKAGES, target), `Unknown release target: ${target}`);
  assert(["latest", "dev"].includes(tag), `Unsupported release tag: ${tag}`);
  assert(
    /^[a-f0-9]{40}$/.test(sourceSha),
    "Release source must be a full Git commit SHA",
  );
  const versions = {};
  for (const [id, name] of Object.entries(PACKAGES)) {
    assert.equal(manifests[id].name, name);
    const version = manifests[id].version;
    const parsed = versionParts(version);
    // The prefix keeps an all-numeric SHA with a leading zero valid SemVer.
    versions[id] =
      tag === "dev"
        ? `${parsed.stable.join(".")}-dev.g${sourceSha.slice(0, 12)}`
        : version;
  }
  return { format_version: 1, source_sha: sourceSha, target, tag, versions };
}

export function planFromRepository(root, target, tag, run = exec) {
  return planRelease({
    target,
    tag,
    sourceSha: run("git", ["rev-parse", "HEAD"], { cwd: root }).trim(),
    manifests: Object.fromEntries(
      Object.keys(PACKAGES).map((id) => [id, readJson(manifestPath(root, id))]),
    ),
  });
}

export function stampManifests(root, plan) {
  for (const [id, name] of Object.entries(PACKAGES)) {
    const path = manifestPath(root, id);
    const manifest = readJson(path);
    assert.equal(manifest.name, name);
    manifest.version = plan.versions[id];
    if (id === "core")
      manifest.dependencies[PACKAGES.server] = plan.versions.server;
    if (id === "react")
      manifest.dependencies[PACKAGES.core] = plan.versions.core;
    writeJson(path, manifest);
  }
}

/** Registry prerequisites apply to dev and stable releases; no silent stable fallback. */
export function checkRegistry(
  plan,
  view = (spec, field) =>
    JSON.parse(exec("npm", ["view", spec, field, "--json"])),
) {
  if (plan.tag === "latest") {
    const latest = view(PACKAGES[plan.target], "version");
    assert(
      compareVersions(plan.versions[plan.target], latest) > 0,
      `Candidate ${plan.versions[plan.target]} must be newer than published ${latest}`,
    );
  }
  const dependencies =
    plan.target === "server"
      ? []
      : plan.target === "core"
        ? ["server"]
        : ["server", "core"];
  for (const id of dependencies) {
    const spec = `${PACKAGES[id]}@${plan.versions[id]}`;
    assert.equal(
      view(spec, "version"),
      plan.versions[id],
      `Publish ${spec} before ${PACKAGES[plan.target]}`,
    );
  }
  if (plan.target === "react") {
    const core = `${PACKAGES.core}@${plan.versions.core}`;
    assert.equal(
      view(core, "dependencies")[PACKAGES.server],
      plan.versions.server,
      `${core} must depend on the candidate server version`,
    );
  }
}

export function prepareArtifacts({
  root,
  directory,
  target,
  tag,
  pnpm = "pnpm",
  run = exec,
}) {
  const plan = planFromRepository(root, target, tag, run);
  const pnpmVersion = run(pnpm, ["--version"], { cwd: root }).trim();
  assert.equal(
    pnpmVersion,
    "9.15.4",
    `Use the pinned pnpm 9.15.4 binary, received ${pnpmVersion}`,
  );
  mkdirSync(directory, { recursive: true });
  assert(
    !existsSync(join(directory, MANIFEST)),
    "Refusing to replace prepared release artifacts",
  );
  stampManifests(root, plan);
  // Installation happens before stamping, preserving existing workspace links.
  // Once workspace: protocols become exact registry pins, pnpm no longer
  // guarantees dependency ordering, so compile each package once in order.
  for (const name of Object.values(PACKAGES)) {
    run(pnpm, ["--filter", name, "build"], { cwd: root, stdio: "inherit" });
  }
  const packages = {};
  for (const [id, name] of Object.entries(PACKAGES)) {
    const tarball = filename(name, plan.versions[id]);
    assert(
      !existsSync(join(directory, tarball)),
      `Tarball already exists: ${tarball}`,
    );
    run(pnpm, ["pack", "--pack-destination", directory], {
      cwd: packagePath(root, id),
      stdio: "inherit",
    });
    packages[id] = {
      name,
      version: plan.versions[id],
      filename: tarball,
      sha256: digest(join(directory, tarball)),
    };
  }
  writeJson(join(directory, MANIFEST), { ...plan, packages });
  return verifyArtifacts(directory, {
    target,
    tag,
    sourceSha: plan.source_sha,
  });
}

export function verifyArtifacts(
  directory,
  expected = {},
  readPacked = (path) =>
    JSON.parse(exec("tar", ["-xOf", path, "package/package.json"])),
) {
  const manifest = readJson(join(directory, MANIFEST));
  assert.equal(
    manifest.format_version,
    1,
    "Unsupported release artifact format",
  );
  assert(Object.hasOwn(PACKAGES, manifest.target), "Unknown artifact target");
  assert(["latest", "dev"].includes(manifest.tag), "Unknown artifact tag");
  assert(
    /^[a-f0-9]{40}$/.test(manifest.source_sha),
    "Invalid artifact source SHA",
  );
  if (expected.target)
    assert.equal(manifest.target, expected.target, "Release target mismatch");
  if (expected.tag)
    assert.equal(manifest.tag, expected.tag, "Release tag mismatch");
  if (expected.sourceSha)
    assert.equal(
      manifest.source_sha,
      expected.sourceSha,
      "Release revision mismatch",
    );
  assert.deepEqual(
    Object.keys(manifest.packages).sort(),
    Object.keys(PACKAGES).sort(),
  );
  assert.deepEqual(
    Object.keys(manifest.versions).sort(),
    Object.keys(PACKAGES).sort(),
  );
  for (const [id, name] of Object.entries(PACKAGES)) {
    const entry = manifest.packages[id];
    const version = manifest.versions[id];
    versionParts(version);
    if (manifest.tag === "dev")
      assert(
        version.endsWith(`-dev.g${manifest.source_sha.slice(0, 12)}`),
        "Prerelease versions must share the source SHA",
      );
    assert.equal(entry.name, name);
    assert.equal(entry.version, version);
    assert.equal(
      entry.filename,
      basename(entry.filename),
      "Unsafe tarball path",
    );
    assert.equal(
      entry.filename,
      filename(name, version),
      "Unexpected tarball filename",
    );
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    const path = join(directory, entry.filename);
    assert.equal(
      digest(path),
      entry.sha256,
      `Tarball checksum mismatch: ${entry.filename}`,
    );
    const packed = readPacked(path);
    assert.equal(packed.name, name);
    assert.equal(packed.version, version);
    for (const deps of [
      packed.dependencies,
      packed.optionalDependencies,
      packed.peerDependencies,
    ]) {
      assert(
        !Object.values(deps ?? {}).some((value) =>
          /^(?:workspace|file|link):/.test(value),
        ),
        `Unpublished dependency protocol in ${name}`,
      );
    }
    if (id === "core")
      assert.equal(
        packed.dependencies[PACKAGES.server],
        manifest.versions.server,
        "Core/server version mismatch",
      );
    if (id === "react")
      assert.equal(
        packed.dependencies[PACKAGES.core],
        manifest.versions.core,
        "React/core version mismatch",
      );
  }
  return manifest;
}

function outputs(values) {
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(values)
        .map(([key, value]) => `${key}=${value}\n`)
        .join(""),
    );
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  assert(args.length % 2 === 0, "Expected --option value pairs");
  const options = Object.fromEntries(
    Array.from({ length: args.length / 2 }, (_, i) => [
      args[2 * i],
      args[2 * i + 1],
    ]),
  );
  const root = resolve(options["--root"] ?? repository);
  const directory = resolve(
    options["--directory"] ?? join(root, "release-artifacts"),
  );
  const target = options["--target"];
  const tag = options["--tag"];
  if (command === "plan") {
    const plan = planFromRepository(root, target, tag);
    checkRegistry(plan);
    outputs({
      version: plan.versions[target],
      source_sha: plan.source_sha,
      versions: JSON.stringify(plan.versions),
    });
    process.stdout.write(JSON.stringify(plan, null, 2) + "\n");
  } else if (command === "prepare") {
    const manifest = prepareArtifacts({
      root,
      directory,
      target,
      tag,
      pnpm: options["--pnpm"] ?? "pnpm",
    });
    process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
  } else if (command === "verify") {
    const manifest = verifyArtifacts(directory, {
      target,
      tag,
      sourceSha: options["--source-sha"],
    });
    const tarball = join(
      directory,
      manifest.packages[manifest.target].filename,
    );
    outputs({ tarball, version: manifest.versions[manifest.target] });
    process.stdout.write(`Verified ${tarball}\n`);
  } else
    throw new Error(
      "Usage: js-release.mjs plan|prepare|verify --target server|core|react --tag dev|latest [--directory path]",
    );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main();
