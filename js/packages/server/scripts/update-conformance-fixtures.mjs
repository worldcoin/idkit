import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(packageDir, "../../..");
const binary =
  process.env.IDKIT_CONFORMANCE_BIN ||
  resolve(root, "target/debug/idkit-conformance");
if (!process.env.IDKIT_CONFORMANCE_BIN) {
  execFileSync(
    "cargo",
    [
      "build",
      "--locked",
      "-p",
      "idkit-core",
      "--bin",
      "idkit-conformance",
      "--features",
      "conformance",
    ],
    { cwd: root, stdio: "inherit" },
  );
}
function oracle(requests) {
  const output = execFileSync(binary, [], {
    input: requests.map((request) => JSON.stringify(request)).join("\n") + "\n",
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  const responses = output
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  if (
    responses.length !== requests.length ||
    responses.some((response) => !response.ok)
  ) {
    throw new Error(`Native oracle rejected fixture inputs: ${output}`);
  }
  return responses;
}

const randomBytesHex = Buffer.from(
  Array.from({ length: 32 }, (_, i) => i),
).toString("hex");
const [{ value: nonce }] = oracle([
  { op: "hash_to_field", input_hex: randomBytesHex },
]);
const cases = [];
for (const inputHex of [
  "",
  Buffer.from("test_signal").toString("hex"),
  "010203",
  "68656c6c6f",
]) {
  cases.push({
    name: `hash-fixed-${inputHex || "empty"}`,
    request: { op: "hash_to_field", input_hex: inputHex },
  });
}
for (const length of [
  1, 2, 7, 15, 16, 17, 31, 32, 33, 63, 64, 65, 127, 128, 129, 255, 256, 257,
  511, 512,
]) {
  const inputHex = Buffer.from(
    Array.from({ length }, (_, i) => (i * 31 + length * 17) % 256),
  ).toString("hex");
  cases.push({
    name: `hash-generated-${length}`,
    request: { op: "hash_to_field", input_hex: inputHex },
  });
}
for (const [name, action] of [
  ["session", undefined],
  ["action", "test-action"],
  ["empty-action", ""],
  ["unicode-action", "id-🙂-世界"],
  ["hex-text-action", "0x010203"],
]) {
  const context = {
    nonce,
    created_at: 1700000000,
    expires_at: 1700000300,
    ...(action === undefined ? {} : { action }),
  };
  cases.push({
    name: `message-${name}`,
    request: { op: "signature_message", ...context },
  });
  cases.push({
    name: `sign-${name}`,
    request: { op: "sign", key_hex: "ab".repeat(32), ...context },
    random_bytes_hex: randomBytesHex,
  });
}
cases.push({
  name: "message-zero",
  request: {
    op: "signature_message",
    nonce: `0x${"00".repeat(32)}`,
    created_at: 0,
    expires_at: 0,
  },
});
const responses = oracle(cases.map(({ request }) => request));
const lockfile = readFileSync(resolve(root, "Cargo.lock"), "utf8");
const fixture = {
  format: 1,
  reference: {
    rust_revision: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    cargo_lock_sha256: createHash("sha256").update(lockfile).digest("hex"),
    world_id_primitives_version: lockfile.match(
      /name = "world-id-primitives"\nversion = "([^"]+)"/,
    )?.[1],
    generator: "native idkit-conformance; synthetic test inputs only",
  },
  cases: cases.map((entry, i) => ({ ...entry, response: responses[i] })),
};
const target = resolve(packageDir, "src/__tests__/fixtures/rust-signing.json");
writeFileSync(target, `${JSON.stringify(fixture, null, 2)}\n`);
process.stdout.write(
  `Wrote ${cases.length} native Rust fixtures to ${target}. Review the diff before committing.\n`,
);
