/**
 * Smoke tests to ensure basic functionality works
 * These tests verify that the WASM integration and core APIs are functional
 */

import { describe, it, expect } from "vitest";
import {
  IDKit,
  CredentialRequest,
  any,
  orbLegacy,
  isNode,
  AppErrorCodes,
  VerificationState,
  signRequest,
} from "../index";

describe("WASM Initialization", () => {
  it("should initialize WASM via IDKit.init", async () => {
    // Call IDKit.init to initialize WASM
    await IDKit.init();
    // If we get here without throwing, WASM is initialized
    expect(true).toBe(true);
  });

  it("should be safe to call IDKit.init multiple times", async () => {
    await IDKit.init();
    await IDKit.init();
    // If we get here without throwing, multiple init calls are safe
    expect(true).toBe(true);
  });
});

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
    expect(typeof orbLegacy).toBe("function");
  });

  it("should create CredentialRequest correctly", () => {
    const item = CredentialRequest("orb", { signal: "test-signal" });
    expect(item).toHaveProperty("type", "orb");
    expect(item).toHaveProperty("signal", "test-signal");
  });

  it("should create any() constraint correctly", () => {
    const orb = CredentialRequest("orb");
    const face = CredentialRequest("face");
    const constraint = any(orb, face);
    expect(constraint).toHaveProperty("any");
    expect(constraint.any).toHaveLength(2);
  });

  it("should create orbLegacy preset correctly", () => {
    const preset = orbLegacy({ signal: "test-signal" });
    expect(preset).toHaveProperty("type", "OrbLegacy");
    expect(preset).toHaveProperty("data");
    expect(preset.data).toHaveProperty("signal", "test-signal");
  });

  it("should throw error when rp_context is missing", () => {
    expect(() =>
      IDKit.request({
        app_id: "app_staging_test",
        action: "test-action",
        // @ts-expect-error - testing missing rp_context
        rp_context: undefined,
      }),
    ).toThrow("rp_context is required");
  });

  it("should allow any() with no items (validation happens in WASM)", () => {
    // any() returns an empty constraint object - validation happens in WASM layer
    const emptyConstraint = any();
    expect(emptyConstraint).toHaveProperty("any");
    expect(emptyConstraint.any).toHaveLength(0);
  });

  it("should reject empty constraints when creating session", async () => {
    const createTestRpContext = () => ({
      rp_id: "rp_test123456789abc",
      nonce: "test-nonce-" + Date.now(),
      created_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      signature: "test-signature",
    });

    // Empty any() constraint should fail validation in WASM layer
    await expect(
      IDKit.request({
        app_id: "app_staging_test",
        action: "test-action",
        rp_context: createTestRpContext(),
      }).constraints({ any: [] }),
    ).rejects.toThrow();
  });
});

describe("Enums", () => {
  it("should export AppErrorCodes enum", () => {
    expect(AppErrorCodes.ConnectionFailed).toBe("connection_failed");
    expect(AppErrorCodes.VerificationRejected).toBe("verification_rejected");
    expect(AppErrorCodes.CredentialUnavailable).toBe("credential_unavailable");
  });

  it("should export VerificationState enum", () => {
    expect(VerificationState.PreparingClient).toBe("loading_widget");
    expect(VerificationState.WaitingForConnection).toBe("awaiting_connection");
    expect(VerificationState.WaitingForApp).toBe("awaiting_app");
    expect(VerificationState.Confirmed).toBe("confirmed");
    expect(VerificationState.Failed).toBe("failed");
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
  const TEST_ACTION = "test-backend-action";

  it("should compute RP signature with default TTL", () => {
    const signature = signRequest(TEST_ACTION, TEST_SIGNING_KEY);

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
    const signature = signRequest(
      TEST_ACTION,
      TEST_SIGNING_KEY,
      customTtl,
    );

    // Verify TTL matches custom value (±2 seconds for timing variance)
    const actualTtl = Number(signature.expiresAt) - Number(signature.createdAt);
    expect(actualTtl).toBeGreaterThanOrEqual(598);
    expect(actualTtl).toBeLessThanOrEqual(602);
  });

  it("should generate unique nonces", () => {
    const signature1 = signRequest(TEST_ACTION, TEST_SIGNING_KEY);
    const signature2 = signRequest(TEST_ACTION, TEST_SIGNING_KEY);

    // Nonces should be different (proving randomness)
    expect(signature1.nonce).not.toBe(signature2.nonce);

    // Both should be valid hex strings
    expect(signature1.nonce).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(signature2.nonce).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  it("should reject invalid signing keys", () => {
    // Test with wrong-length key (should be 32 bytes = 64 hex chars)
    const shortKey = "0xabcd";
    expect(() => signRequest(TEST_ACTION, shortKey)).toThrow();

    // Test with non-hex key
    const invalidKey =
      "0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ";
    expect(() => signRequest(TEST_ACTION, invalidKey)).toThrow();
  });
});
