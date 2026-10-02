import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import {
  PACKAGES,
  MANIFEST,
  checkRegistry,
  compareVersions,
  planRelease,
  prepareArtifacts,
  verifyArtifacts,
} from "./js-release.mjs";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value));
function manifests() {
  return {
    server: {
      name: PACKAGES.server,
      version: "2.5.7",
      files: ["dist"],
      dependencies: { "@noble/hashes": "^1.8.0" },
    },
    core: {
      name: PACKAGES.core,
      version: "7.2.1",
      files: ["dist"],
      dependencies: { [PACKAGES.server]: "workspace:*" },
    },
    react: {
      name: PACKAGES.react,
      version: "8.0.3",
      files: ["dist"],
      dependencies: { [PACKAGES.core]: "workspace:*", qrcode: "^1.5.4" },
      peerDependenciesMeta: { "react-dom": { optional: true } },
    },
  };
}
const plan = (target = "react", tag = "dev") =>
  planRelease({ target, tag, sourceSha: SHA, manifests: manifests() });

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "idkit-release-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [id, manifest] of Object.entries(manifests())) {
    const path = join(root, "js/packages", id);
    mkdirSync(path, { recursive: true });
    writeJson(join(path, "package.json"), manifest);
  }
  const directory = join(root, "artifacts");
  const calls = [];
  // External package-manager execution is substituted, while real manifests,
  // tarballs, hashes and verifier run unchanged. Tests never install or publish.
  const run = (command, args, options) => {
    calls.push([command, args, options.cwd]);
    if (command === "git") return SHA + "\n";
    assert.equal(command, "/cached/pnpm9");
    if (args[0] === "--version") return "9.15.4\n";
    if (args[0] === "--filter") {
      const id = Object.keys(PACKAGES).find((id) => PACKAGES[id] === args[1]);
      assert(id);
      assert.equal(args[2], "build");
      const path = join(root, "js/packages", id);
      mkdirSync(join(path, "dist"));
      // Models package attribution embedded during compilation.
      writeFileSync(
        join(path, "dist/index.js"),
        `export const version = ${JSON.stringify(json(join(path, "package.json")).version)};`,
      );
      return "";
    }
    assert.equal(args[0], "pack");
    const manifest = json(join(options.cwd, "package.json"));
    const staging = mkdtempSync(join(root, "pack-"));
    mkdirSync(join(staging, "package/dist"), { recursive: true });
    copyFileSync(
      join(options.cwd, "package.json"),
      join(staging, "package/package.json"),
    );
    copyFileSync(
      join(options.cwd, "dist/index.js"),
      join(staging, "package/dist/index.js"),
    );
    const file = `${manifest.name.slice(1).replace("/", "-")}-${manifest.version}.tgz`;
    execFileSync("tar", [
      "-czf",
      join(directory, file),
      "-C",
      staging,
      "package",
    ]);
    return "";
  };
  return {
    root,
    directory,
    calls,
    run,
    pnpm: "/cached/pnpm9",
    target: "react",
    tag: "dev",
  };
}

test("prerelease versions and dependency prerequisites share one source revision", () => {
  const candidate = plan();
  assert.deepEqual(candidate.versions, {
    server: "2.5.7-dev.g0123456789ab",
    core: "7.2.1-dev.g0123456789ab",
    react: "8.0.3-dev.g0123456789ab",
  });
  const requests = [];
  checkRegistry(candidate, (spec, field) => {
    requests.push([spec, field]);
    if (field === "dependencies")
      return { [PACKAGES.server]: candidate.versions.server };
    const id = Object.keys(PACKAGES).find(
      (id) => spec === `${PACKAGES[id]}@${candidate.versions[id]}`,
    );
    assert(id, `Unexpected stable-version fallback: ${spec}`);
    return candidate.versions[id];
  });
  assert.equal(requests.length, 3);
  assert.throws(
    () =>
      checkRegistry(candidate, (spec, field) =>
        field === "dependencies"
          ? { [PACKAGES.server]: "2.5.7" }
          : spec.slice(spec.lastIndexOf("@") + 1),
      ),
    /candidate server version/,
  );
  assert.throws(
    () =>
      checkRegistry(plan("core"), () => {
        throw new Error("registry unavailable");
      }),
    /registry unavailable/,
  );
});

test("stable versions must advance, with semantic prerelease comparison", () => {
  assert.equal(compareVersions("3.0.0-rc.10", "3.0.0-rc.9"), 1);
  assert.equal(compareVersions("3.0.0", "3.0.0-rc.10"), 1);
  assert.equal(compareVersions("2.10.0", "2.9.9"), 1);
  assert.equal(compareVersions("2.0.0+one", "2.0.0+two"), 0);
  assert.throws(
    () => checkRegistry(plan("server", "latest"), () => "2.5.7"),
    /must be newer/,
  );
  checkRegistry(plan("server", "latest"), () => "2.5.6");
});

test("version planning accepts numeric commit prefixes and rejects invalid SemVer", () => {
  const candidate = planRelease({
    target: "server",
    tag: "dev",
    sourceSha: "0".repeat(40),
    manifests: manifests(),
  });
  assert.equal(candidate.versions.server, "2.5.7-dev.g000000000000");
  assert.equal(compareVersions(candidate.versions.server, "2.5.7"), -1);
  for (const version of ["1.2.3-01", "1.2.3-a..b", "1.2.3+a..b"]) {
    assert.throws(() => compareVersions(version, "1.2.3"), /Invalid/);
  }
});

test("stable dependencies must also exist at the exact candidate versions", () => {
  const candidate = plan("core", "latest");
  const requests = [];
  checkRegistry(candidate, (spec, field) => {
    requests.push([spec, field]);
    return spec === PACKAGES.core ? "7.2.0" : candidate.versions.server;
  });
  assert.deepEqual(requests, [
    [PACKAGES.core, "version"],
    [`${PACKAGES.server}@2.5.7`, "version"],
  ]);
  assert.throws(
    () =>
      checkRegistry(candidate, (spec) =>
        spec === PACKAGES.core ? "7.2.0" : "2.5.6",
      ),
    /Publish/,
  );
});

test("builds final manifests once, packs once, and qualifies the exact tarball bytes", (t) => {
  const context = fixture(t);
  const candidate = prepareArtifacts(context);
  assert.deepEqual(
    context.calls
      .filter(([, args]) => args[0] === "--filter")
      .map(([, args]) => args[1]),
    [PACKAGES.server, PACKAGES.core, PACKAGES.react],
  );
  assert.equal(
    context.calls.filter(([, args]) => args[0] === "pack").length,
    3,
  );
  assert.equal(
    json(join(context.root, "js/packages/core/package.json")).dependencies[
      PACKAGES.server
    ],
    candidate.versions.server,
  );
  assert.equal(
    json(join(context.root, "js/packages/react/package.json")).dependencies[
      PACKAGES.core
    ],
    candidate.versions.core,
  );
  assert.deepEqual(
    json(join(context.root, "js/packages/react/package.json"))
      .peerDependenciesMeta,
    { "react-dom": { optional: true } },
  );
  for (const id of Object.keys(PACKAGES)) {
    const entry = candidate.packages[id];
    const embedded = execFileSync(
      "tar",
      [
        "-xOf",
        join(context.directory, entry.filename),
        "package/dist/index.js",
      ],
      { encoding: "utf8" },
    );
    assert(
      embedded.includes(candidate.versions[id]),
      "Final version must be set before compilation",
    );
  }
  assert.deepEqual(
    verifyArtifacts(context.directory, {
      target: "react",
      tag: "dev",
      sourceSha: SHA,
    }),
    candidate,
  );
  assert.throws(() => prepareArtifacts(context), /Refusing to replace/);
});

test("rejects wrong revisions and tarball modification before publication", (t) => {
  const context = fixture(t);
  const candidate = prepareArtifacts(context);
  assert.throws(
    () => verifyArtifacts(context.directory, { sourceSha: "f".repeat(40) }),
    /revision mismatch/,
  );
  assert.throws(
    () => verifyArtifacts(context.directory, { target: "core" }),
    /target mismatch/,
  );
  appendFileSync(
    join(context.directory, candidate.packages.core.filename),
    "changed",
  );
  assert.throws(() => verifyArtifacts(context.directory), /checksum mismatch/);
});

test("rejects manifest traversal and dependency pins even when checksums match", (t) => {
  const context = fixture(t);
  const candidate = prepareArtifacts(context);
  const path = join(context.directory, MANIFEST);
  const traversal = structuredClone(candidate);
  traversal.packages.core.filename = "../" + traversal.packages.core.filename;
  writeJson(path, traversal);
  assert.throws(
    () => verifyArtifacts(context.directory),
    /Unsafe tarball path/,
  );
  writeJson(path, candidate);
  assert.throws(
    () =>
      verifyArtifacts(context.directory, {}, (tarball) => {
        const packed = JSON.parse(
          execFileSync("tar", ["-xOf", tarball, "package/package.json"], {
            encoding: "utf8",
          }),
        );
        if (packed.name === PACKAGES.core)
          packed.dependencies[PACKAGES.server] = "2.5.7";
        return packed;
      }),
    /Core\/server version mismatch/,
  );
  // Check that a newly recorded checksum alone cannot conceal a bad package name.
  assert.throws(
    () =>
      verifyArtifacts(context.directory, {}, (tarball) => ({
        name: "unexpected",
        version:
          candidate.packages[
            basename(tarball).includes("server") ? "server" : "core"
          ].version,
      })),
    /unexpected/,
  );
});

test("refuses a package manager upgrade before writing manifests or building", (t) => {
  const context = fixture(t);
  const before = readFileSync(
    join(context.root, "js/packages/core/package.json"),
    "utf8",
  );
  assert.throws(
    () =>
      prepareArtifacts({
        ...context,
        run: (command, args, options) => (command === "git" ? SHA : "11.0.0"),
      }),
    /pinned pnpm 9.15.4/,
  );
  assert.equal(
    readFileSync(join(context.root, "js/packages/core/package.json"), "utf8"),
    before,
  );
});
