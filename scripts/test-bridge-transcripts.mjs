import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createCipheriv, createDecipheriv } from "node:crypto";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { IDKit, RetryableBridgeError } from "../js/packages/core/dist/node.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const binary =
  process.env.IDKIT_RUST_ORACLE ??
  resolve(root, "target/debug/idkit-conformance");
const now = 1700000000;
const config = {
  kind: "request",
  app_id: "app_staging_test",
  package_name: "idkit_js_core",
  package_version: "test",
  action: "test-action",
  allow_legacy_proofs: false,
  rp_context: {
    rp_id: "rp_1234567890abcdef",
    nonce: "0x" + "00".repeat(31) + "01",
    created_at: now,
    expires_at: now + 300,
    signature: "0x" + "00".repeat(64) + "1b",
  },
};
let posts = [];
let mode = "success";
let pollReply;
let pollId;
let gets = [];
const server = createServer(async (req, res) => {
  if (req.method === "GET") {
    assert.equal(req.url, `/response/${pollId}`);
    gets.push(req.url);
    if (pollReply.disconnect) {
      req.socket.destroy();
      return;
    }
    res.writeHead(pollReply.status ?? 200, {
      "content-type": "application/json",
    });
    res.end(pollReply.raw ?? JSON.stringify(pollReply.body));
    return;
  }
  let text = "";
  for await (const bytes of req) text += bytes;
  assert.equal(req.url, "/request");
  assert.equal(req.method, "POST");
  const body = JSON.parse(text);
  posts.push(body);
  const status =
    mode === "conflict" || (mode === "retry" && posts.length === 1)
      ? 409
      : mode === "http-error"
        ? 503
        : 200;
  res.writeHead(status, { "content-type": "application/json" });
  if (mode === "duplicate-id") {
    const id = JSON.stringify(body.request_id ?? "bridge-request");
    res.end(`{"request_id":${id},"request_id":${id}}`);
    return;
  }
  if (mode === "invalid-id-utf8") {
    res.end(
      Buffer.concat([
        Buffer.from('{"request_id":"'),
        Buffer.from([0x82]),
        Buffer.from('"}'),
      ]),
    );
    return;
  }
  res.end(
    JSON.stringify({
      request_id:
        mode === "wrong-id" ? "wrong" : (body.request_id ?? "bridge-request"),
    }),
  );
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const bridge_url = `http://127.0.0.1:${server.address().port}/ignored-path`;
// Keep the actual native connection alive across JSONL calls. In particular,
// poll_live uses the state produced by create_live instead of rebuilding it
// from test-owned keys, caches, or config fields.
function rustSession() {
  const child = spawn(binary, [], { cwd: root });
  const lines = createInterface({ input: child.stdout });
  let pending;
  let stderr = "";
  child.stderr.on("data", (bytes) => (stderr += bytes));
  const closed = new Promise((resolve, reject) => {
    child.once("error", (error) => {
      pending?.reject(error);
      reject(error);
    });
    child.once("close", (code) => {
      if (pending)
        pending.reject(new Error(`Native runner closed: ${code}: ${stderr}`));
      if (code === 0) resolve();
      else reject(new Error(`Native runner exited ${code}: ${stderr}`));
    });
  });
  // A failed command is reported by send(); consume a possible early exit too.
  void closed.catch(() => {});
  lines.on("line", (line) => {
    if (!pending) return;
    const current = pending;
    pending = undefined;
    clearTimeout(current.timer);
    try {
      current.resolve(JSON.parse(line));
    } catch (error) {
      current.reject(error);
    }
  });
  return {
    send(input) {
      assert.equal(pending, undefined, "native commands must be sequential");
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending = undefined;
          child.kill();
          reject(
            new Error(`Native runner timed out for ${input.op}: ${stderr}`),
          );
        }, 20_000);
        pending = {
          resolve,
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
          timer,
        };
        child.stdin.write(JSON.stringify(input) + "\n");
      });
    },
    async close() {
      child.stdin.end();
      await closed;
      lines.close();
    },
  };
}
async function rust(input) {
  const session = rustSession();
  try {
    return await session.send(input);
  } finally {
    await session.close();
  }
}
function plaintext(body, connector) {
  const key = Buffer.from(new URL(connector).searchParams.get("k"), "base64");
  const encrypted = Buffer.from(body.payload, "base64");
  const iv = Buffer.from(body.iv, "base64");
  assert.equal(iv.length, 12);
  assert.equal(key.length, 32);
  const cipher = createDecipheriv("aes-256-gcm", key, iv);
  cipher.setAuthTag(encrypted.subarray(-16));
  return JSON.parse(
    Buffer.concat([
      cipher.update(encrypted.subarray(0, -16)),
      cipher.final(),
    ]).toString(),
  );
}
function encryptedReply(connector, value, tamper = false) {
  const key = Buffer.from(new URL(connector).searchParams.get("k"), "base64");
  const iv = Buffer.alloc(12, 7); // The app chooses its own response IV.
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = typeof value === "string" ? value : JSON.stringify(value);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  if (tamper) ciphertext[ciphertext.length - 1] ^= 1;
  return {
    body: {
      status: "completed",
      response: {
        iv: iv.toString("base64"),
        payload: ciphertext.toString("base64"),
      },
    },
  };
}
async function jsCreate(input) {
  const cfg = input.config;
  const builder =
    cfg.kind === "create_session"
      ? IDKit.createSession(cfg)
      : cfg.kind === "prove_session"
        ? IDKit.proveSession(cfg.session_id, cfg)
        : input.invite_code
          ? IDKit.requestWithInviteCode(cfg)
          : IDKit.request(cfg);
  return "preset" in input.selection
    ? builder.preset(input.selection.preset)
    : builder.constraints(input.selection.constraints);
}
function normalize(payload) {
  const copy = structuredClone(payload);
  if (copy.proof_request) {
    assert.match(copy.proof_request.id, /^[0-9a-f-]{36}$/);
    copy.proof_request.id = "<generated UUID>";
  }
  // Public namespace metadata is intentionally SDK-specific, never protocol data.
  copy.package_version = "<package version>";
  return copy;
}
const scenarios = [
  {
    name: "URL request",
    selection: { preset: { type: "ProofOfHuman", signal: "🌍" } },
  },
  {
    name: "Self Check",
    selection: { preset: { type: "SelfieCheck", signal: "0x01" } },
  },
  {
    name: "create session",
    kind: "create_session",
    selection: {
      constraints: { any: [{ type: "proof_of_human" }, { type: "selfie" }] },
    },
  },
  {
    name: "prove session",
    kind: "prove_session",
    selection: { constraints: { type: "proof_of_human" } },
  },
  {
    name: "invite",
    invite_code: true,
    selection: { preset: { type: "ProofOfHuman" } },
  },
  {
    name: "invite retry",
    invite_code: true,
    mode: "retry",
    selection: { preset: { type: "OrbLegacy" } },
  },
  ...[
    "conflict",
    "http-error",
    "wrong-id",
    "duplicate-id",
    "invalid-id-utf8",
  ].map((mode) => ({
    name: mode,
    mode,
    invite_code: mode !== "invalid-id-utf8",
    selection: { preset: { type: "OrbLegacy" } },
    failure: true,
  })),
];
try {
  for (const scenario of scenarios) {
    const input = {
      op: "create",
      config: {
        ...config,
        bridge_url,
        kind: scenario.kind ?? "request",
        ...(scenario.kind === "prove_session"
          ? { session_id: `session_${"00".repeat(31)}01${"01".repeat(32)}` }
          : {}),
      },
      selection: scenario.selection,
      now,
      invite_code: scenario.invite_code ?? false,
    };
    mode = scenario.mode ?? "success";
    posts = [];
    const native = await rust(input);
    const nativePosts = posts;
    posts = [];
    let js;
    try {
      const cfg = input.config;
      const builder =
        cfg.kind === "create_session"
          ? IDKit.createSession(cfg)
          : cfg.kind === "prove_session"
            ? IDKit.proveSession(cfg.session_id, cfg)
            : input.invite_code
              ? IDKit.requestWithInviteCode(cfg)
              : IDKit.request(cfg);
      const handle =
        "preset" in scenario.selection
          ? await builder.preset(scenario.selection.preset)
          : await builder.constraints(scenario.selection.constraints);
      js = {
        ok: true,
        value: {
          connector_uri: handle.connectorURI,
          request_id: handle.requestId,
          expires_at: handle.expiresAt,
          debug_report: handle.getDebugReport(),
        },
      };
    } catch (error) {
      js = { ok: false, error };
    }
    assert.equal(
      native.ok,
      !scenario.failure,
      `${scenario.name}: native ${JSON.stringify(native)}`,
    );
    assert.equal(js.ok, native.ok, `${scenario.name}: JavaScript ${js.error}`);
    assert.equal(
      posts.length,
      nativePosts.length,
      `${scenario.name}: request attempts`,
    );
    assert.equal(posts.length, ["retry", "conflict"].includes(mode) ? 2 : 1);
    if (!js.ok && !native.ok) {
      assert.equal(
        js.error.constructor,
        Error,
        "programming errors must not satisfy a failure case",
      );
      const parserFailure =
        mode === "duplicate-id" || mode === "invalid-id-utf8";
      assert.equal(
        native.error.kind,
        // Rust invite creation wraps deserialization in BridgeError; URL
        // creation propagates the HTTP client's decoding error directly.
        parserFailure && !input.invite_code ? "http_error" : "bridge_error",
      );
      const reason =
        mode === "conflict"
          ? /collision after retries/
          : mode === "http-error"
            ? /failed with status 503/
            : mode === "wrong-id"
              ? /mismatched request_id/
              : /unexpected_response/;
      assert.match(js.error.message, reason);
    }
    if (js.ok && native.ok) {
      const a = plaintext(nativePosts.at(-1), native.value.connector_uri),
        b = plaintext(posts.at(-1), js.value.connector_uri);
      assert.deepEqual(a, native.value.debug_report.request_payload);
      assert.deepEqual(b, js.value.debug_report.request_payload);
      assert.deepEqual(normalize(a), normalize(b), scenario.name);
      for (const value of [native.value, js.value]) {
        const query = new URL(value.connector_uri).searchParams;
        assert.equal(query.get("i"), value.request_id);
        assert.equal(query.get("b"), bridge_url);
        if (input.invite_code) {
          assert.match(query.get("c"), /^[A-Z0-9]{6}$/);
          assert.ok(Math.abs(value.expires_at - (Date.now() / 1000 + 900)) < 5);
        }
      }
      if (mode === "retry") {
        assert.notEqual(posts[0].request_id, posts[1].request_id);
        assert.notEqual(nativePosts[0].request_id, nativePosts[1].request_id);
      }
    }
    console.log(`Native/JS HTTP transcript PASS: ${scenario.name}`);
  }

  const field = config.rp_context.nonce;
  const sessionId = `session_${"00".repeat(31)}01${"01".repeat(32)}`;
  const item = {
    identifier: "proof_of_human",
    issuer_schema_id: 1,
    proof: [1, 2, 3, 4, 5]
      .map((n) => n.toString(16).padStart(64, "0"))
      .join(""),
    nullifier: `nil_${field.slice(2)}`,
    expires_at_min: now,
  };
  const proof = {
    id: "00000000-0000-4000-8000-000000000001",
    version: 1,
    responses: [item],
  };
  const sessionProof = {
    ...proof,
    session_id: sessionId,
    responses: [
      {
        ...item,
        nullifier: null,
        session_nullifier: `snil_${field.slice(2)}02${"00".repeat(30)}01`,
      },
    ],
  };
  const pollScenarios = [
    {
      name: "URL v4",
      selection: { preset: { type: "ProofOfHuman", signal: "🌍" } },
      proof,
    },
    {
      name: "invite legacy",
      invite_code: true,
      selection: { preset: { type: "OrbLegacy", signal: "0x01" } },
      proof: {
        verification_level: "orb",
        proof: "0x01",
        merkle_root: "0x02",
        nullifier_hash: "0x03",
      },
    },
    {
      name: "create session",
      kind: "create_session",
      selection: { constraints: { type: "proof_of_human" } },
      proof: { ...proof, session_id: sessionId },
    },
    {
      name: "prove session",
      kind: "prove_session",
      selection: { constraints: { type: "proof_of_human" } },
      proof: sessionProof,
    },
    {
      name: "Self Check presence",
      require_user_presence: true,
      selection: { preset: { type: "SelfieCheck" } },
      proof: {
        ...proof,
        user_presence_completed: true,
        responses: [
          {
            ...item,
            identifier: "selfie",
            issuer_schema_id: 11,
            claims: [field],
          },
        ],
      },
    },
  ];
  for (const scenario of pollScenarios) {
    const runner = rustSession();
    try {
      mode = "success";
      const input = {
        op: "create_live",
        now,
        invite_code: scenario.invite_code ?? false,
        config: {
          ...config,
          bridge_url,
          kind: scenario.kind ?? "request",
          require_user_presence: scenario.require_user_presence ?? false,
          ...(scenario.kind === "prove_session"
            ? { session_id: sessionId }
            : {}),
        },
        selection: scenario.selection,
      };
      const native = await runner.send(input);
      assert.equal(native.ok, true, JSON.stringify(native));
      const handle = await jsCreate(input);
      let lastPlaintext;
      const steps = [
        {
          name: "initialized",
          reply: () => ({ body: { status: "initialized" } }),
          expected: { type: "waiting_for_connection" },
        },
        {
          name: "retrieved",
          reply: () => ({ body: { status: "retrieved" } }),
          expected: { type: "awaiting_confirmation" },
        },
        {
          name: "confirmed",
          plaintext: JSON.stringify(scenario.proof),
          reply: (uri) => encryptedReply(uri, scenario.proof),
          expectedType: "confirmed",
        },
        {
          name: "user rejected",
          plaintext: '{"error_code":"user_rejected"}',
          reply: (uri) => encryptedReply(uri, { error_code: "user_rejected" }),
          expected: { type: "failed", error: "user_rejected" },
        },
        {
          name: "HTTP 404",
          reply: () => ({ status: 404, body: {} }),
          expected: { type: "failed", error: "connection_failed" },
        },
        ...[408, 429, 500, 502, 503, 504].map((status) => ({
          name: `HTTP ${status}`,
          reply: () => ({ status, body: {} }),
          nativeError: "bridge_error",
          jsClass: RetryableBridgeError,
          jsError: /^Bridge poll returned HTTP /,
        })),
        {
          name: "missing encrypted envelope",
          reply: () => ({ body: { status: "completed" } }),
          nativeError: "unexpected_response",
          jsError: /^unexpected_response$/,
        },
        {
          name: "malformed HTTP JSON",
          reply: () => ({ raw: "{" }),
          nativeError: "http_error",
          jsClass: SyntaxError,
        },
        {
          name: "duplicate HTTP status",
          reply: () => ({
            raw: '{"status":"retrieved","status":"initialized"}',
          }),
          nativeError: "http_error",
          jsError: /^unexpected_response$/,
        },
        {
          name: "socket disconnected",
          reply: () => ({ disconnect: true }),
          nativeError: "http_error",
          jsClass: RetryableBridgeError,
          jsError: /^Bridge poll could not connect$/,
        },
        {
          name: "authentication failure",
          reply: (uri) => encryptedReply(uri, scenario.proof, true),
          nativeError: "crypto_error",
          jsError: /^aes\/gcm: invalid ghash tag$/,
        },
        {
          name: "malformed decrypted proof",
          plaintext: '{"responses":"not a proof"}',
          reply: (uri) => encryptedReply(uri, '{"responses":"not a proof"}'),
          nativeError: "json_error",
          jsError: /^unexpected_response$/,
        },
        // A later status proves failures did not destroy the connection, and
        // exposes the last debug plaintext retained by both implementations.
        {
          name: "still pollable",
          reply: () => ({ body: { status: "retrieved" } }),
          expected: { type: "awaiting_confirmation" },
        },
      ];
      if (scenario.require_user_presence)
        steps.splice(3, 0, {
          name: "missing required presence",
          plaintext: JSON.stringify({
            ...scenario.proof,
            user_presence_completed: false,
          }),
          reply: (uri) =>
            encryptedReply(uri, {
              ...scenario.proof,
              user_presence_completed: false,
            }),
          expected: { type: "failed", error: "user_presence_failed" },
        });
      for (const step of steps) {
        gets = [];
        pollId = native.value.request_id;
        pollReply = step.reply(native.value.connector_uri);
        const actualNative = await runner.send({ op: "poll_live" });
        assert.ok(
          gets.length >= 1,
          `${scenario.name}/${step.name}: native HTTP GET`,
        );
        gets = [];
        pollId = handle.requestId;
        pollReply = step.reply(handle.connectorURI);
        let actualJs;
        try {
          actualJs = { ok: true, status: await handle.pollOnce() };
        } catch (error) {
          actualJs = { ok: false, error };
        }
        assert.ok(
          gets.length >= 1,
          `${scenario.name}/${step.name}: JS HTTP GET`,
        );
        const label = `${scenario.name}/${step.name}`;
        if (step.nativeError) {
          assert.equal(actualNative.ok, false, label);
          assert.equal(actualNative.error.kind, step.nativeError, label);
          assert.equal(actualJs.ok, false, label);
          assert.equal(
            actualJs.error.constructor,
            step.jsClass ?? Error,
            label,
          );
          if (step.jsError)
            assert.match(actualJs.error.message, step.jsError, label);
        } else {
          assert.equal(
            actualNative.ok,
            true,
            `${label}: ${JSON.stringify(actualNative)}`,
          );
          assert.equal(actualJs.ok, true, `${label}: ${actualJs.error}`);
          assert.deepEqual(actualJs.status, actualNative.value.status, label);
          if (step.expected)
            assert.deepEqual(actualJs.status, step.expected, label);
          if (step.expectedType)
            assert.equal(actualJs.status.type, step.expectedType, label);
        }
        if (step.plaintext !== undefined) lastPlaintext = step.plaintext;
        assert.equal(
          handle.getDebugReport().response_payload,
          lastPlaintext,
          `${label}: JS debug payload`,
        );
        if (actualNative.ok)
          assert.equal(
            actualNative.value.debug_report.response_payload ?? undefined,
            lastPlaintext,
            `${label}: native debug payload`,
          );
      }
      console.log(
        `Native/JS HTTP polling PASS: ${scenario.name} (${steps.length} steps)`,
      );
    } finally {
      await runner.close();
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
