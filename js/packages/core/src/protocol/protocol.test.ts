import { describe, expect, it } from "vitest";
import nullifierVectors from "../../../../../test-vectors/nullifier.json";
import { hashSignal } from "../lib/hashing";
import { parseUrl, resolveBridgeEndpoint } from "../lib/url";
import type { BuilderConfig, Preset } from "../types/protocol";
import {
  bridgeResponseToResult,
  compileRequest,
  proofResponseToIDKitResult,
  validateWireStrings,
} from "./index";
import { FIELD_MODULUS, validateBridgeUrl } from "./validation";

const field = (number: bigint) => `0x${number.toString(16).padStart(64, "0")}`;
const config: BuilderConfig = {
  type: "request",
  app_id: "app_test",
  package_name: "idkit_js_core",
  package_version: "test",
  action: "0x1234",
  rp_context: {
    rp_id: "rp_1",
    nonce: field(1n),
    signature: `0x${"00".repeat(64)}00`,
    created_at: 100,
    expires_at: 200,
  },
};
const options = { now: 100, requestId: "fixed-request-id" };
const proof = [1n, 2n, 3n, 4n, (1n << 256n) - 1n]
  .map((v) => v.toString(16).padStart(64, "0"))
  .join("");
const item = {
  identifier: "face",
  issuer_schema_id: 11,
  proof,
  nullifier: `nil_${"0".repeat(63)}1`,
  expires_at_min: 100,
  claims: [field(10n)],
};
const response = { id: "response", version: 1, responses: [item] };
const context = {
  nonce: "nonce",
  action: "action",
  legacy_signal_hash: "legacy",
};

describe("protocol request boundaries", () => {
  it("replaces unpaired UTF16 in emitted text and identity attributes", () => {
    const compiled = compileRequest(
      { ...config, action: "\ud800", action_description: "\udc00" },
      {
        preset: {
          type: "IdentityCheck",
          attributes: [{ type: "full_name", value: "\ud800" }],
        },
      },
      options,
    );
    expect(compiled.payload).toMatchObject({
      action: "\ufffd",
      action_description: "\ufffd",
      identity_attributes: [{ type: "full_name", value: "\ufffd" }],
      proof_request: { action: hashSignal("\ufffd") },
    });
    expect(() => validateWireStrings(compiled.payload)).not.toThrow();
  });
  it("keeps preset string signals and serialized constraint signals distinct at empty hex", () => {
    const constraint = compileRequest(
      config,
      { constraints: { type: "selfie", signal: "0x" } },
      options,
    );
    const preset = compileRequest(
      config,
      { preset: { type: "SelfieCheck", signal: "0x" } },
      options,
    );
    expect(constraint.signal_hashes.selfie).toBe(hashSignal(new Uint8Array()));
    expect(preset.signal_hashes.selfie).toBe(hashSignal("0x"));
    expect(constraint.signal_hashes.selfie).not.toBe(
      preset.signal_hashes.selfie,
    );
  });
  it("hashes action text independently from signal hex semantics and normalizes the RP fields", () => {
    const { payload } = compileRequest(
      config,
      { constraints: { type: "proof_of_human", signal: "0x1234" } },
      options,
    );
    expect(payload.proof_request).toMatchObject({
      rp_id: "rp_0000000000000001",
      oprf_key_id: "0x1",
      session_id: null,
      signature: `0x${"00".repeat(64)}1b`,
      action: hashSignal(new TextEncoder().encode("0x1234")),
      proof_requests: [
        {
          identifier: "proof_of_human",
          issuer_schema_id: 1,
          signal: "0x1234",
          genesis_issued_at_min: null,
          expires_at_min: null,
        },
      ],
    });
  });
  it("matches untagged Rust variant fallback before structural validation", () => {
    const malformedItem = {
      type: "selfie",
      signal: 42,
      any: [{ type: "passport" }],
    } as unknown as import("../types/protocol").ConstraintNode;
    expect(
      compileRequest(config, { constraints: malformedItem }, options).payload
        .proof_request,
    ).toMatchObject({ constraints: { any: ["passport"] } });
    const emptyAny = {
      any: [],
      all: [{ type: "passport" }],
    } as import("../types/protocol").ConstraintNode;
    expect(() =>
      compileRequest(config, { constraints: emptyAny }, options),
    ).toThrow("Any constraint must have at least one child");
  });
  it("rejects uppercase signature prefixes", () => {
    expect(() =>
      compileRequest(
        {
          ...config,
          rp_context: {
            ...config.rp_context!,
            signature: `0X${"ab".repeat(64)}1b`,
          },
        },
        { constraints: { type: "selfie" } },
        options,
      ),
    ).toThrow("Invalid signature");
  });
  it("preserves duplicate request items and keeps the last supplied signal", () => {
    const { payload, signal_hashes } = compileRequest(
      config,
      {
        constraints: {
          all: [
            { type: "selfie", signal: "first" },
            { type: "selfie", signal: "last" },
            { type: "selfie" },
          ],
        },
      },
      options,
    );
    expect(
      (payload.proof_request as { proof_requests: unknown[] }).proof_requests,
    ).toHaveLength(3);
    expect(signal_hashes).toEqual({ selfie: hashSignal("last") });
  });
  it.each(["ProofOfHuman", "Passport", "Mnc"])(
    "preserves %s legacy fallback override",
    (type) => {
      expect(
        compileRequest(
          { ...config, allow_legacy_proofs: false },
          { preset: { type } as Preset },
          options,
        ).payload.allow_legacy_proofs,
      ).toBe(true);
    },
  );
  it("forces SelfieCheck to v4 and rejects unsupported native v1 presets", () => {
    expect(
      compileRequest(
        { ...config, allow_legacy_proofs: true },
        { preset: { type: "SelfieCheck" } },
        options,
      ).payload.allow_legacy_proofs,
    ).toBe(false);
    expect(() =>
      compileRequest(
        config,
        { preset: { type: "SelfieCheck" } },
        { ...options, nativeVersion: 1 },
      ),
    ).toThrow("not supported");
    expect(() =>
      compileRequest(
        config,
        { preset: { type: "IdentityCheck", attributes: [] } },
        { ...options, nativeVersion: 1 },
      ),
    ).toThrow("not supported");
  });
  it("only validates nonce/signature for v4 requests, preserving legacy-only behavior", () => {
    const legacyConfig = {
      ...config,
      rp_context: {
        ...config.rp_context!,
        signature: "legacy",
        nonce: "legacy",
      },
    };
    expect(
      compileRequest(legacyConfig, { preset: { type: "OrbLegacy" } }, options)
        .payload.proof_request,
    ).toBeUndefined();
    expect(() =>
      compileRequest(
        legacyConfig,
        { constraints: { type: "proof_of_human" } },
        options,
      ),
    ).toThrow("Invalid signature");
  });
  it("uses RP-created timestamps and keeps sessions free of legacy fallback", () => {
    const compiled = compileRequest(
      { ...config, type: "createSession", allow_legacy_proofs: true },
      { constraints: { type: "passport" } },
      { ...options, nativeVersion: 2 },
    );
    expect(compiled.payload).toMatchObject({
      action: "",
      timestamp: "1970-01-01T00:01:40Z",
      allow_legacy_proofs: false,
      proof_request: {
        action: null,
        session_id: "create",
        proof_type: "session",
      },
    });
    expect(() =>
      compileRequest(
        { ...config, type: "createSession" },
        { preset: { type: "OrbLegacy" } },
        options,
      ),
    ).toThrow("Presets are not supported for session flows");
  });
  it("enforces field modulus, session prefix, clock skew and empty recursive constraints", () => {
    expect(() =>
      compileRequest(
        {
          ...config,
          rp_context: { ...config.rp_context!, nonce: field(FIELD_MODULUS) },
        },
        { constraints: { type: "selfie" } },
        options,
      ),
    ).toThrow("Invalid nonce");
    expect(() =>
      compileRequest(
        {
          ...config,
          type: "proveSession",
          session_id: `session_${"00".repeat(64)}`,
        },
        { constraints: { type: "selfie" } },
        options,
      ),
    ).toThrow("session_id");
    expect(() =>
      compileRequest(
        { ...config, rp_context: { ...config.rp_context!, created_at: 161 } },
        { constraints: { type: "selfie" } },
        options,
      ),
    ).toThrow("future");
    expect(() =>
      compileRequest(
        config,
        { constraints: { all: [{ enumerate: [] }] } },
        options,
      ),
    ).toThrow("Enumerate constraint must have at least one child");
  });
  it("preserves staging LAN bridge relaxation and rejects explicit empty query/fragment in production", () => {
    expect(() =>
      validateBridgeUrl("http://192.168.1.3:4444/path?q#f", "app_staging_test"),
    ).not.toThrow();
    expect(() =>
      validateBridgeUrl("https://bridge.example?", "app_test"),
    ).toThrow("query");
    expect(() =>
      validateBridgeUrl("https://bridge.example#", "app_test"),
    ).toThrow("fragment");
  });
});

describe("portable URL parsing", () => {
  it("uses IDNA and relative resolution without relying on host URL getters", () => {
    expect(parseUrl("https://BÜCHER.example:443/")).toMatchObject({
      hostname: "xn--bcher-kva.example",
      port: "",
      pathname: "/",
      hostKind: "domain",
    });
    expect(
      resolveBridgeEndpoint(
        "https://BÜCHER.example:443/old?old#fragment",
        "/response/x y",
      ),
    ).toBe("https://xn--bcher-kva.example/response/x%20y");
  });
  it("classifies numeric opaque hosts separately from IPv4", () => {
    expect(() =>
      validateBridgeUrl("http://2130706433/path", "app_staging_test"),
    ).not.toThrow();
    expect(() =>
      validateBridgeUrl("custom://10.1.2.3/path", "app_staging_test"),
    ).toThrow("HTTPS");
    expect(() =>
      validateBridgeUrl("custom://localhost/path", "app_staging_test"),
    ).not.toThrow();
  });
});

describe("protocol response boundaries", () => {
  const canonicalVectors = [
    ...new Map(
      nullifierVectors.valid.map((vector) => [vector.canonical, vector]),
    ).values(),
  ];
  it.each(canonicalVectors)(
    "converts canonical nullifier $canonical to the existing hex result",
    ({ canonical, hex }) => {
      const payload = {
        ...response,
        responses: [{ ...item, nullifier: canonical }],
      };
      const result = proofResponseToIDKitResult(payload, context);
      expect(result.responses[0]).toHaveProperty("nullifier", hex);
    },
  );
  it.each(nullifierVectors.invalid_canonical)(
    "rejects invalid protocol nullifier %j through the response error path",
    (nullifier) => {
      const payload = {
        ...response,
        responses: [{ ...item, nullifier }],
      };
      expect(() => proofResponseToIDKitResult(payload, context)).toThrow(
        "unexpected_response",
      );
    },
  );
  it("rejects isolated surrogate escapes from JSON wire values and keys", () => {
    expect(() =>
      validateWireStrings(JSON.parse('{"nested":["\\ud800"]}')),
    ).toThrow("unexpected_response");
    expect(() =>
      validateWireStrings(JSON.parse('{"\\udc00":"value"}')),
    ).toThrow("unexpected_response");
    expect(() =>
      validateWireStrings({ text: "🌍", replacement: "\ufffd" }),
    ).not.toThrow();
  });
  it("normalizes native JS strings at the former WASM boundary", () => {
    const converted = proofResponseToIDKitResult(
      { ...response, responses: [{ ...item, identifier: "\ud800" }] },
      { ...context, nonce: "\udc00", signal_hashes: { ["\ud800"]: "hash" } },
    );
    expect(converted).toMatchObject({
      nonce: "\ufffd",
      responses: [{ identifier: "\ufffd", signal_hash: "hash" }],
    });
  });
  it("decodes compressed proof words as decimal, canonical nullifiers as hex, and schema-11 claims", () => {
    const result = proofResponseToIDKitResult(response, {
      ...context,
      signal_hashes: { selfie: "preferred", face: "fallback" },
    });
    expect(result.responses[0]).toEqual({
      identifier: "selfie",
      issuer_schema_id: 11,
      proof: ["1", "2", "3", "4", ((1n << 256n) - 1n).toString()],
      nullifier: field(1n),
      expires_at_min: 100,
      sybil_score: 10,
      signal_hash: "preferred",
    });
  });
  it("looks up only own signal-hash keys", () => {
    const result = proofResponseToIDKitResult(
      {
        ...response,
        responses: [
          { ...item, identifier: "__proto__" },
          { ...item, identifier: "constructor" },
        ],
      },
      context,
    );
    for (const resultItem of result.responses)
      expect(resultItem).not.toHaveProperty("signal_hash");
  });
  it("retains face for another schema and discards non-selfie claims", () => {
    const result = proofResponseToIDKitResult(
      { ...response, responses: [{ ...item, issuer_schema_id: 1 }] },
      context,
    );
    expect(result.responses[0].identifier).toBe("face");
    expect(result.responses[0]).not.toHaveProperty("sybil_score");
  });
  it("rejects missing/empty/unsafe selfie claims and malformed compressed proofs", () => {
    for (const claims of [undefined, [], [field(1n << 64n)]]) {
      expect(() =>
        proofResponseToIDKitResult(
          { ...response, responses: [{ ...item, claims }] },
          context,
        ),
      ).toThrow();
    }
    expect(() =>
      proofResponseToIDKitResult(
        { ...response, responses: [{ ...item, proof: `0x${proof}` }] },
        context,
      ),
    ).toThrow();
  });
  it("prefers a valid session nullifier when both are present and omits uniqueness fields for sessions", () => {
    const session = `session_${"00".repeat(32)}01${"00".repeat(31)}`;
    const result = proofResponseToIDKitResult(
      {
        ...response,
        session_id: session,
        responses: [
          {
            ...item,
            session_nullifier: `snil_${"00".repeat(32)}02${"00".repeat(31)}`,
          },
        ],
      },
      { ...context, identity_attested: true },
    );
    expect(result).toMatchObject({
      session_id: session,
      responses: [{ session_nullifier: [field(0n), field(2n << 248n)] }],
    });
    expect(result).not.toHaveProperty("action");
    expect(result).not.toHaveProperty("identity_attested");
    expect(result.responses[0]).not.toHaveProperty("nullifier");
  });
  it("preserves protocol-error priority over presence while validating the wire shape first", () => {
    expect(
      bridgeResponseToResult(
        {
          proof_response: {
            ...response,
            error: "nullifier_replay",
            responses: [],
          },
        },
        { ...context, require_user_presence: true },
      ),
    ).toEqual({ type: "failed", error: "nullifier_replayed" });
    expect(() =>
      bridgeResponseToResult(
        {
          proof_response: {
            ...response,
            error: "user_rejected",
            responses: [{}],
          },
        },
        context,
      ),
    ).toThrow();
    expect(
      bridgeResponseToResult(
        { proof_response: response },
        { ...context, require_user_presence: true },
      ),
    ).toEqual({ type: "failed", error: "user_presence_failed" });
  });
  it("preserves bridge enum precedence and ignores extension fields on raw v4", () => {
    expect(
      bridgeResponseToResult({ ...response, error_code: "new_error" }, context),
    ).toEqual({ type: "failed", error: "generic_error" });
    const raw = bridgeResponseToResult(
      { ...response, identity_attested: true },
      context,
    );
    expect(raw.type === "confirmed" && raw.result).not.toHaveProperty(
      "identity_attested",
    );
    const wrapped = bridgeResponseToResult(
      { proof_response: response, identity_attested: true },
      context,
    );
    expect(wrapped).toMatchObject({
      type: "confirmed",
      result: { identity_attested: true },
    });
  });
  it("keeps v1 and multi-legacy signal lookup rules distinct", () => {
    const legacy = {
      proof: "proof",
      merkle_root: "root",
      nullifier_hash: "nullifier",
      credential_type: "face",
    };
    const expected = {
      identifier: "selfie",
      proof: "proof",
      merkle_root: "root",
      nullifier: "nullifier",
    };
    expect(
      bridgeResponseToResult(legacy, {
        ...context,
        signal_hashes: { face: "face", selfie: "selfie" },
      }),
    ).toMatchObject({
      type: "confirmed",
      result: { responses: [{ ...expected, signal_hash: "legacy" }] },
    });
    expect(
      bridgeResponseToResult(
        { legacy_responses: [legacy] },
        { ...context, signal_hashes: { face: "face", selfie: "selfie" } },
      ),
    ).toMatchObject({
      type: "confirmed",
      result: { responses: [{ ...expected, signal_hash: "face" }] },
    });
  });
});
