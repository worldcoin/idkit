/**
 * Smoke tests to ensure basic functionality works
 * These tests verify that the WASM integration and core APIs are functional
 */

import { describe, it, expect } from "vitest";
import {
  initIDKit,
  isInitialized,
  createSession,
  isNode,
  AppErrorCodes,
  VerificationState,
  computeRpSignature,
} from "../index";

describe("WASM Initialization", () => {
  it("should initialize WASM via initIDKit", async () => {
    // Call initIDKit to mark as initialized in our wrapper
    await initIDKit();
    expect(isInitialized()).toBe(true);
  });

  it("should be safe to call initIDKit multiple times", async () => {
    await initIDKit();
    await initIDKit();
    expect(isInitialized()).toBe(true);
  });
});

describe("Platform Detection", () => {
  it("should detect Node.js environment", () => {
    expect(isNode()).toBe(true);
    // Note: isWeb() returns true in test env because vitest provides window object
  });
});

describe("Session API", () => {
  //TODO: We should try to find a test with a signed payload to test full e2e
  // Helper to create a test RP context
  const createTestRpContext = () => ({
    rp_id: "rp_test123456789abc",
    nonce: "test-nonce-" + Date.now(),
    created_at: Math.floor(Date.now() / 1000),
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    signature: "test-signature",
  });

  it("should export createSession function", () => {
    expect(typeof createSession).toBe("function");
  });

  it("should throw error when requests is empty", async () => {
    await expect(
      createSession({
        app_id: "app_staging_test",
        action: "test-action",
        requests: [],
        rp_context: createTestRpContext(),
      }),
    ).rejects.toThrow("At least one request is required");
  });

  it("should throw error when rp_context is missing", async () => {
    await expect(
      createSession({
        app_id: "app_staging_test",
        action: "test-action",
        requests: [{ credential_type: "orb" }],
        // @ts-expect-error - testing missing rp_context
        rp_context: undefined,
      }),
    ).rejects.toThrow("rp_context is required");
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
    const signature = computeRpSignature(TEST_ACTION, TEST_SIGNING_KEY);

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
    const signature = computeRpSignature(
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
    const signature1 = computeRpSignature(TEST_ACTION, TEST_SIGNING_KEY);
    const signature2 = computeRpSignature(TEST_ACTION, TEST_SIGNING_KEY);

    // Nonces should be different (proving randomness)
    expect(signature1.nonce).not.toBe(signature2.nonce);

    // Both should be valid hex strings
    expect(signature1.nonce).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(signature2.nonce).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  it("should reject invalid signing keys", () => {
    // Test with wrong-length key (should be 32 bytes = 64 hex chars)
    const shortKey = "0xabcd";
    expect(() => computeRpSignature(TEST_ACTION, shortKey)).toThrow();

    // Test with non-hex key
    const invalidKey =
      "0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ";
    expect(() => computeRpSignature(TEST_ACTION, invalidKey)).toThrow();
  });
});
