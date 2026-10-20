import { describe, expect, it } from "vitest";
import {
  config as baseConfig,
  context as baseContext,
  legacy,
  NOW,
  response,
  SESSION,
  SESSION_NULLIFIER,
} from "../conformance/cases";
import { hashSignal } from "../lib/hashing";
import type { BuilderConfig } from "../types/protocol";
import {
  bridgeResponseToResult,
  compileRequest,
  proofResponseToIDKitResult,
} from "./index";

const config: BuilderConfig = {
  ...baseConfig,
  type: "request",
  session_id: "create",
};
const context = {
  ...baseContext,
  environment: "production" as const,
  session_id: "create" as const,
};
const options = { now: NOW, requestId: "request-id" };
const selection = { preset: { type: "ProofOfHuman" as const } };
const boundResponse = { ...response, session_id: SESSION };

// This JS-only opt-in extends the unchanged Rust differential suite.
describe("uniqueness with a newly bound session", () => {
  it.each([selection, { constraints: { type: "proof_of_human" as const } }])(
    "compiles action + session creation and disables even implicit preset fallback",
    (selection) => {
      expect(compileRequest(config, selection, options).payload).toMatchObject({
        action: config.action,
        allow_legacy_proofs: false,
        proof_request: {
          proof_type: "uniqueness",
          action: hashSignal(config.action!),
          session_id: "create",
        },
      });
    },
  );

  it("refuses configurations that cannot deliver a bound v4 uniqueness proof", () => {
    expect(() =>
      compileRequest(
        { ...config, allow_legacy_proofs: true },
        selection,
        options,
      ),
    ).toThrow("allow_legacy_proofs: false");
    expect(() =>
      compileRequest(config, { preset: { type: "OrbLegacy" } }, options),
    ).toThrow("World ID v4 credential");
    expect(() =>
      compileRequest(config, selection, { ...options, nativeVersion: 1 }),
    ).toThrow("v4-compatible client");
    expect(() =>
      compileRequest(
        { ...config, session_id: SESSION } as BuilderConfig,
        selection,
        options,
      ),
    ).toThrow('Uniqueness session_id must be "create"');
  });

  it("preserves action, session, full-width uniqueness nullifier and attestation", () => {
    const nullifier = `01${"00".repeat(31)}`;
    expect(
      proofResponseToIDKitResult(
        {
          ...boundResponse,
          responses: [
            { ...response.responses[0], nullifier: `nil_${nullifier}` },
          ],
        },
        { ...context, identity_attested: true },
      ),
    ).toMatchObject({
      protocol_version: "4.0",
      action: config.action,
      session_id: SESSION,
      identity_attested: true,
      responses: [{ nullifier: `0x${nullifier}` }],
    });
  });

  it.each([
    ["missing session", response],
    ["malformed session", { ...response, session_id: "session_bad" }],
    [
      "zero commitment",
      {
        ...response,
        session_id: `session_${"00".repeat(32)}${"01".repeat(32)}`,
      },
    ],
    ["empty responses", { ...boundResponse, responses: [] }],
    [
      "session-only proof",
      {
        ...boundResponse,
        responses: [
          {
            ...response.responses[0],
            nullifier: null,
            session_nullifier: SESSION_NULLIFIER,
          },
        ],
      },
    ],
  ])("rejects %s for a bound uniqueness request", (_name, invalid) => {
    expect(() => proofResponseToIDKitResult(invalid, context)).toThrow(
      "unexpected_response",
    );
  });

  it("refuses a legacy success but preserves app rejection errors", () => {
    expect(() => bridgeResponseToResult(legacy, context)).toThrow(
      "unexpected_response",
    );
    expect(
      bridgeResponseToResult({ error_code: "user_rejected" }, context),
    ).toEqual({ type: "failed", error: "user_rejected" });
  });
});
