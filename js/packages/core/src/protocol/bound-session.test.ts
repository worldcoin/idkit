import { describe, expect, it } from "vitest";
import { hashSignal } from "../lib/hashing";
import type { BuilderConfig, Preset } from "../types/protocol";
import {
  bridgeResponseToResult,
  compileRequest,
  proofResponseToIDKitResult,
} from "./index";

const field = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}`;
const session = `session_${field(3n).slice(2)}01${"00".repeat(31)}` as const;
const sessionNullifier = `snil_${field(4n).slice(2)}02${"00".repeat(31)}`;
const config: BuilderConfig = {
  type: "request",
  app_id: "app_test",
  package_name: "idkit_js_core",
  package_version: "test",
  action: "enroll",
  session_id: "create",
  allow_legacy_proofs: false,
  rp_context: {
    rp_id: "rp_1",
    nonce: field(1n),
    signature: `0x${"00".repeat(64)}00`,
    created_at: 100,
    expires_at: 200,
  },
};
const options = { now: 100, requestId: "request-id" };
const item = {
  identifier: "selfie",
  issuer_schema_id: 11,
  proof: [1n, 2n, 3n, 4n, 5n]
    .map((n) => n.toString(16).padStart(64, "0"))
    .join(""),
  nullifier: `nil_${field(2n).slice(2)}`,
  expires_at_min: 100,
  claims: [field(10n)],
};
const response = {
  id: "response",
  version: 1,
  session_id: session,
  responses: [item],
};
const context = {
  nonce: field(1n),
  action: "enroll",
  session_id: "create" as const,
  legacy_signal_hash: "0x0",
  identity_attested: true,
};

// Deliberate JS-only extension: the Rust differential suite remains unchanged.
// These tests exercise the opt-in independently instead of accepting a mismatched oracle.
describe("uniqueness with a newly bound session", () => {
  it("compiles one uniqueness request with an action and a session creation directive", () => {
    const compiled = compileRequest(
      config,
      { constraints: { type: "selfie" } },
      options,
    );
    expect(compiled.payload).toMatchObject({
      action: "enroll",
      allow_legacy_proofs: false,
      proof_request: {
        proof_type: "uniqueness",
        action: hashSignal("enroll"),
        session_id: "create",
      },
    });
  });

  it.each<Preset>([
    { type: "SelfieCheck" },
    { type: "ProofOfHuman" },
    { type: "Passport" },
    { type: "Mnc" },
    { type: "IdentityCheck", attributes: [{ type: "minimum_age", value: 18 }] },
  ])("keeps modern preset $type v4-only after preset resolution", (preset) => {
    const { payload } = compileRequest(config, { preset }, options);
    expect(payload.allow_legacy_proofs).toBe(false);
    expect(payload.proof_request).toMatchObject({
      proof_type: "uniqueness",
      session_id: "create",
    });
  });

  it.each<Preset>([
    { type: "OrbLegacy" },
    { type: "DocumentLegacy" },
    { type: "SecureDocumentLegacy" },
    { type: "DeviceLegacy" },
    { type: "SelfieCheckLegacy" },
  ])("rejects legacy-only preset $type", (preset) => {
    expect(() => compileRequest(config, { preset }, options)).toThrow(
      "World ID v4 credential",
    );
  });

  it("rejects explicit legacy fallback and native v1 rather than dropping the binding", () => {
    expect(() =>
      compileRequest(
        { ...config, allow_legacy_proofs: true },
        { constraints: { type: "selfie" } },
        options,
      ),
    ).toThrow("allow_legacy_proofs: false");
    expect(() =>
      compileRequest(
        config,
        { preset: { type: "ProofOfHuman" } },
        { ...options, nativeVersion: 1 },
      ),
    ).toThrow("v4-compatible client");
  });

  it.each([session, null, true, ""])(
    "rejects unsupported uniqueness session_id %s",
    (session_id) => {
      expect(() =>
        compileRequest(
          { ...config, session_id } as BuilderConfig,
          { constraints: { type: "selfie" } },
          options,
        ),
      ).toThrow('Uniqueness session_id must be "create"');
    },
  );

  it("preserves action, session, uniqueness nullifier, claims, and identity attestation together", () => {
    expect(proofResponseToIDKitResult(response, context)).toMatchObject({
      protocol_version: "4.0",
      action: "enroll",
      session_id: session,
      identity_attested: true,
      responses: [{ nullifier: field(2n), sybil_score: 10 }],
    });
  });

  it.each([
    ["missing session", { ...response, session_id: undefined }],
    ["malformed session", { ...response, session_id: "session_bad" }],
    [
      "zero commitment",
      {
        ...response,
        session_id: `session_${field(0n).slice(2)}01${"00".repeat(31)}`,
      },
    ],
    ["empty responses", { ...response, responses: [] }],
    [
      "session-only proof",
      {
        ...response,
        responses: [
          { ...item, nullifier: null, session_nullifier: sessionNullifier },
        ],
      },
    ],
    [
      "ambiguous proof",
      {
        ...response,
        responses: [{ ...item, session_nullifier: sessionNullifier }],
      },
    ],
    [
      "mixed proof kinds",
      {
        ...response,
        responses: [
          item,
          { ...item, nullifier: null, session_nullifier: sessionNullifier },
        ],
      },
    ],
  ])(
    "rejects %s when a bound uniqueness proof was requested",
    (_name, invalid) => {
      expect(() => proofResponseToIDKitResult(invalid, context)).toThrow(
        "unexpected_response",
      );
    },
  );

  it("accepts a full-width uniqueness nullifier (the action has the namespace prefix)", () => {
    const nullifier = `01${"00".repeat(31)}`;
    expect(
      proofResponseToIDKitResult(
        {
          ...response,
          responses: [{ ...item, nullifier: `nil_${nullifier}` }],
        },
        context,
      ).responses[0],
    ).toHaveProperty("nullifier", `0x${nullifier}`);
  });

  it("requires a uniqueness action in the response context", () => {
    expect(() =>
      proofResponseToIDKitResult(response, { ...context, action: undefined }),
    ).toThrow("unexpected_response");
  });

  it("rejects a legacy success from an old client but retains app rejection errors", () => {
    const legacy = {
      proof: "0x1",
      merkle_root: "0x2",
      nullifier_hash: "0x3",
      verification_level: "orb",
    };
    expect(() => bridgeResponseToResult(legacy, context)).toThrow(
      "unexpected_response",
    );
    expect(
      bridgeResponseToResult({ error_code: "user_rejected" }, context),
    ).toEqual({ type: "failed", error: "user_rejected" });
  });

  it("keeps ordinary uniqueness and session requests/results unchanged", () => {
    const ordinary = { ...config, session_id: undefined };
    expect(
      compileRequest(ordinary, { constraints: { type: "selfie" } }, options)
        .payload.proof_request,
    ).toMatchObject({ proof_type: "uniqueness", session_id: null });
    const plainResult = proofResponseToIDKitResult(
      { ...response, session_id: undefined },
      { ...context, session_id: undefined },
    );
    expect(plainResult).toHaveProperty("action", "enroll");
    expect(plainResult).not.toHaveProperty("session_id");
    const sessionResult = proofResponseToIDKitResult(
      {
        ...response,
        responses: [
          { ...item, nullifier: null, session_nullifier: sessionNullifier },
        ],
      },
      { ...context, action: undefined, session_id: undefined },
    );
    expect(sessionResult).toHaveProperty("session_id", session);
    expect(sessionResult).not.toHaveProperty("action");
    expect(sessionResult.responses[0]).toHaveProperty("session_nullifier");
  });
});
