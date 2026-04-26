/**
 * Smoke tests to ensure basic functionality works
 * These tests verify that the WASM integration and core APIs are functional
 */

import { describe, it, expect } from "vitest";
import {
  IDKit,
  CredentialRequest,
  any,
  enumerate,
  orbLegacy,
  deviceLegacy,
  selfieCheckLegacy,
  isNode,
  IDKitErrorCodes,
  signRequest,
  hashSignal,
} from "../index";
import { initIDKit, WasmModule } from "../lib/wasm";

const TEST_SESSION_ID = `session_${"11".repeat(64)}` as const;
const TEST_SESSION_CONFIG = {
  app_id: "app_staging_test" as const,
  rp_context: {
    rp_id: "rp_test",
    nonce: "0x01",
    created_at: 1,
    expires_at: 2,
    signature: "0x1234",
  },
};

describe("Platform Detection", () => {
  it("should detect Node.js environment", () => {
    expect(isNode()).toBe(true);
    // Note: isWeb() returns true in test env because vitest provides window object
  });
});

describe("IDKitRequest API", () => {
  //TODO: We should try to find a test with a signed payload to test full e2e

  it("should export IDKit.request function", () => {
    expect(typeof IDKit.request).toBe("function");
  });

  it("should export CredentialRequest and constraint helpers", () => {
    expect(typeof CredentialRequest).toBe("function");
    expect(typeof any).toBe("function");
    expect(typeof enumerate).toBe("function");
    expect(typeof orbLegacy).toBe("function");
    expect(typeof selfieCheckLegacy).toBe("function");
  });

  it("should create CredentialRequest correctly", () => {
    const item = CredentialRequest("proof_of_human", { signal: "test-signal" });
    expect(item).toHaveProperty("type", "proof_of_human");
    expect(item).toHaveProperty("signal", "test-signal");
  });

  it("should create any() constraint correctly", () => {
    const poh = CredentialRequest("proof_of_human");
    const face = CredentialRequest("face");
    const constraint = any(poh, face);
    expect(constraint).toHaveProperty("any");
    expect(constraint.any).toHaveLength(2);
  });

  it("should create enumerate() constraint correctly", () => {
    const poh = CredentialRequest("proof_of_human");
    const face = CredentialRequest("face");
    const constraint = enumerate(poh, face);
    expect(constraint).toHaveProperty("enumerate");
    expect(constraint.enumerate).toHaveLength(2);
  });

  it("should create orbLegacy preset correctly", () => {
    const preset = orbLegacy({ signal: "test-signal" });
    expect(preset).toHaveProperty("type", "OrbLegacy");
    expect(preset).toHaveProperty("signal", "test-signal");
  });

  it("should create selfieCheckLegacy preset correctly", () => {
    const preset = selfieCheckLegacy({ signal: "face-signal" });
    expect(preset).toHaveProperty("type", "SelfieCheckLegacy");
    expect(preset).toHaveProperty("signal", "face-signal");
  });

  it("should create deviceLegacy preset correctly", () => {
    const preset = deviceLegacy({ signal: "device-signal" });
    expect(preset).toHaveProperty("type", "DeviceLegacy");
    expect(preset).toHaveProperty("signal", "device-signal");
  });

  it("should throw error when rp_context is missing", () => {
    expect(() =>
      IDKit.request({
        app_id: "app_staging_test",
        action: "test-action",
        // @ts-expect-error - testing missing rp_context
        rp_context: undefined,
        allow_legacy_proofs: false,
      }),
    ).toThrow("rp_context is required");
  });

  it("should reject malformed session_id values in proveSession", () => {
    expect(() =>
      IDKit.proveSession(
        "session_1" as `session_${string}`,
        TEST_SESSION_CONFIG,
      ),
    ).toThrow("session_id must be in the format session_<128 hex characters>");
  });

  it("should accept protocol-shaped session_id values in proveSession", () => {
    expect(() =>
      IDKit.proveSession(TEST_SESSION_ID, TEST_SESSION_CONFIG),
    ).not.toThrow();
  });

  it("should allow any() with no items (validation happens in WASM)", () => {
    // any() returns an empty constraint object - validation happens in WASM layer
    const emptyConstraint = any();
    expect(emptyConstraint).toHaveProperty("any");
    expect(emptyConstraint.any).toHaveLength(0);
  });

  // TODO: re-enable once this is supported and World ID 4.0 is rolled out live
  // it("should reject empty constraints when creating session", async () => {
  //   // Create a valid hex nonce (field element format)
  //   const validNonce =
  //     "0x0000000000000000000000000000000000000000000000000000000000000001";
  //   // Create a valid signature (65 bytes = 130 hex chars + 0x prefix)
  //   const validSignature = "0x" + "00".repeat(64) + "1b"; // r(32) + s(32) + v(1)

  //   const createTestRpContext = () => ({
  //     rp_id: "rp_123456789abcdef0", // Valid format: rp_ + 16 hex chars
  //     nonce: validNonce,
  //     created_at: Math.floor(Date.now() / 1000),
  //     expires_at: Math.floor(Date.now() / 1000) + 3600,
  //     signature: validSignature,
  //   });

  //   // Empty any() constraint should fail validation in WASM layer
  //   const builder = await IDKit.request({
  //     app_id: "app_staging_test",
  //     action: "test-action",
  //     rp_context: createTestRpContext(),
  //     allow_legacy_proofs: false,
  //   });
  //   await expect(builder.constraints({ any: [] })).rejects.toThrow();
  // });

  it("should hash address-shaped legacy preset signals as raw bytes in WASM payloads", async () => {
    await initIDKit();

    const signal = "0x3df41d9d0ba00d8fbe5a9896bb01efc4b3787b7c";
    const utf8SignalHash = hashSignal(new TextEncoder().encode(signal));
    const rawAddressSignalHash = hashSignal(signal);
    const rpContext = new WasmModule.RpContextWasm(
      "rp_1234567890abcdef",
      "0x0000000000000000000000000000000000000000000000000000000000000001",
      1_700_000_000n,
      1_700_003_600n,
      "0x" + "00".repeat(64) + "1b",
    );
    const builder = new WasmModule.IDKitBuilder(
      "app_test",
      "test-action",
      rpContext,
      null,
      null,
      true,
      null,
      null,
      "production",
    );

    const result = builder.nativePayloadFromPreset(orbLegacy({ signal })) as {
      payload: { signal: string };
      legacy_signal_hash: string;
    };

    expect(rawAddressSignalHash).not.toBe(utf8SignalHash);
    expect(result.payload.signal).toBe(rawAddressSignalHash);
    expect(result.legacy_signal_hash).toBe(rawAddressSignalHash);
  });
});

describe("Enums", () => {
  it("should export IDKitErrorCodes enum", () => {
    expect(IDKitErrorCodes.ConnectionFailed).toBe("connection_failed");
    expect(IDKitErrorCodes.VerificationRejected).toBe("verification_rejected");
    expect(IDKitErrorCodes.CredentialUnavailable).toBe(
      "credential_unavailable",
    );
    expect(IDKitErrorCodes.Timeout).toBe("timeout");
    expect(IDKitErrorCodes.Cancelled).toBe("cancelled");
  });
});

describe("Type Safety", () => {
  it("should enforce app_id format at type level", () => {
    // This is a compile-time check, but we can verify the type exists
    const validAppId: `app_${string}` = "app_staging_123";
    expect(validAppId).toBe("app_staging_123");

    // TypeScript would error on this: const invalid: `app_${string}` = 'invalid'
  });
});

describe("RP Signature Generation", () => {
  const TEST_SIGNING_KEY =
    "0xabababababababababababababababababababababababababababababababab";
  const TEST_ACTION = "test-action";
  it("should compute RP signature with default TTL", () => {
    const signature = signRequest({
      action: TEST_ACTION,
      signingKeyHex: TEST_SIGNING_KEY,
    });

    // Verify signature format: 65 bytes (0x + 130 hex chars)
    expect(signature.sig).toMatch(/^0x[0-9a-f]{130}$/i);
    expect(signature.sig.length).toBe(132);

    // Verify nonce format: 32 bytes (0x + 64 hex chars)
    expect(signature.nonce).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(signature.nonce.length).toBe(66);

    // Verify timestamps
    expect(signature.expiresAt).toBeGreaterThan(signature.createdAt);

    // Verify TTL is approximately 300 seconds (allow ±2 seconds for timing variance)
    const actualTtl = Number(signature.expiresAt) - Number(signature.createdAt);
    expect(actualTtl).toBeGreaterThanOrEqual(298);
    expect(actualTtl).toBeLessThanOrEqual(302);
  });

  it("should compute RP signature with custom TTL", () => {
    const customTtl = 600; // 10 minutes
    const signature = signRequest({
      action: TEST_ACTION,
      signingKeyHex: TEST_SIGNING_KEY,
      ttl: customTtl,
    });

    // Verify TTL matches custom value (±2 seconds for timing variance)
    const actualTtl = Number(signature.expiresAt) - Number(signature.createdAt);
    expect(actualTtl).toBeGreaterThanOrEqual(598);
    expect(actualTtl).toBeLessThanOrEqual(602);
  });

  it("should generate unique nonces", () => {
    const signature1 = signRequest({
      action: TEST_ACTION,
      signingKeyHex: TEST_SIGNING_KEY,
    });
    const signature2 = signRequest({
      action: TEST_ACTION,
      signingKeyHex: TEST_SIGNING_KEY,
    });

    // Nonces should be different (proving randomness)
    expect(signature1.nonce).not.toBe(signature2.nonce);

    // Both should be valid hex strings
    expect(signature1.nonce).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(signature2.nonce).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  it("should reject invalid signing keys", () => {
    // Test with wrong-length key (should be 32 bytes = 64 hex chars)
    const shortKey = "0xabcd";
    expect(() =>
      signRequest({ action: TEST_ACTION, signingKeyHex: shortKey }),
    ).toThrow();

    // Test with non-hex key
    const invalidKey =
      "0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ";
    expect(() =>
      signRequest({ action: TEST_ACTION, signingKeyHex: invalidKey }),
    ).toThrow();
  });
});
