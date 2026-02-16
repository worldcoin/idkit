/**
 * Smoke tests for pure JS hashing and signing implementations
 * Test vectors cross-verified with the Rust/WASM implementation
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { hashSignal } from "../hashing";
import { signRequest, computeRpSignatureMessage } from "../signing";

// Rust ref: rust/core/src/crypto.rs (hash_to_field)
// Algorithm: keccak256(input) >> 8, returns 0x-prefixed 64-char hex
describe("hashSignal (pure JS)", () => {
  it("should hash empty string correctly", () => {
    expect(hashSignal("")).toBe(
      "0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4",
    );
  });

  it("should hash UTF-8 string correctly", () => {
    expect(hashSignal("test_signal")).toBe(
      "0x00c1636e0a961a3045054c4d61374422c31a95846b8442f0927ad2ff1d6112ed",
    );
  });

  it("should hash raw bytes correctly", () => {
    expect(hashSignal(new Uint8Array([1, 2, 3]))).toBe(
      "0x00f1885eda54b7a053318cd41e2093220dab15d65381b1157a3633a83bfd5c92",
    );
  });

  it("should decode 0x-prefixed hex strings to bytes before hashing", () => {
    // "hello" in hex is 68656c6c6f
    const fromHex = hashSignal("0x68656c6c6f");
    const fromString = hashSignal("hello");
    expect(fromHex).toBe(fromString);
    expect(fromHex).toBe(
      "0x001c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36dea",
    );
  });
});

// Rust ref: https://github.com/worldcoin/world-id-protocol/blob/0008eab1efe200e572f27258793f9be5cb32858b/crates/primitives/src/rp.rs#L95-L105
// Message format: nonce(32) || createdAt_u64_be(8) || expiresAt_u64_be(8)
describe("computeRpSignatureMessage", () => {
  it("should produce a 48-byte message", () => {
    const nonce = new Uint8Array(32).fill(0xaa);
    const msg = computeRpSignatureMessage(nonce, 1000, 1300);
    expect(msg.length).toBe(48);
  });

  it("should embed nonce as the first 32 bytes", () => {
    const nonce = new Uint8Array(32);
    nonce[0] = 0x00;
    nonce[1] = 0xff;
    nonce[31] = 0x42;
    const msg = computeRpSignatureMessage(nonce, 0, 0);
    expect(msg.slice(0, 32)).toEqual(nonce);
  });

  it("should encode timestamps as big-endian u64", () => {
    const nonce = new Uint8Array(32);
    const createdAt = 1700000000;
    const expiresAt = 1700000300;
    const msg = computeRpSignatureMessage(nonce, createdAt, expiresAt);

    const view = new DataView(msg.buffer);
    expect(view.getBigUint64(32, false)).toBe(BigInt(createdAt));
    expect(view.getBigUint64(40, false)).toBe(BigInt(expiresAt));
  });

  it("should be deterministic for the same inputs", () => {
    const nonce = new Uint8Array(32).fill(0x01);
    const msg1 = computeRpSignatureMessage(nonce, 100, 400);
    const msg2 = computeRpSignatureMessage(nonce, 100, 400);
    expect(msg1).toEqual(msg2);
  });
});

// Rust ref: rust/core/src/rp_signature.rs (signRequest)
// Nonce generation ref: https://github.com/worldcoin/world-id-protocol/blob/31405df8bcd5a2784e04ad9890cf095111dcac13/crates/primitives/src/lib.rs#L134-L149
describe("signRequest (pure JS)", () => {
  const TEST_KEY =
    "0xabababababababababababababababababababababababababababababababab";
  const TEST_ACTION = "test-action";
  const FIXED_NOW_MS = 1700000000_000; // 2023-11-14T22:13:20Z

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return correctly formatted signature", () => {
    const sig = signRequest(TEST_ACTION, TEST_KEY);

    // 65 bytes = 0x + 130 hex chars
    expect(sig.sig).toMatch(/^0x[0-9a-f]{130}$/);
    expect(sig.sig.length).toBe(132);

    // 32 bytes = 0x + 64 hex chars
    expect(sig.nonce).toMatch(/^0x[0-9a-f]{64}$/);
    expect(sig.nonce.length).toBe(66);
  });

  it("should use default TTL of 300 seconds", () => {
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW_MS);
    const sig = signRequest(TEST_ACTION, TEST_KEY);

    expect(sig.createdAt).toBe(1700000000);
    expect(sig.expiresAt).toBe(1700000300);
    expect(sig.expiresAt - sig.createdAt).toBe(300);
  });

  it("should use custom TTL", () => {
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW_MS);
    const sig = signRequest(TEST_ACTION, TEST_KEY, 600);

    expect(sig.createdAt).toBe(1700000000);
    expect(sig.expiresAt).toBe(1700000600);
    expect(sig.expiresAt - sig.createdAt).toBe(600);
  });

  it("should generate unique nonces", () => {
    const sig1 = signRequest(TEST_ACTION, TEST_KEY);
    const sig2 = signRequest(TEST_ACTION, TEST_KEY);
    expect(sig1.nonce).not.toBe(sig2.nonce);
  });

  it("should produce v value of 27 or 28", () => {
    const sig = signRequest(TEST_ACTION, TEST_KEY);
    // Last byte of 65-byte sig is v
    const vHex = sig.sig.slice(-2);
    const v = parseInt(vHex, 16);
    expect(v === 27 || v === 28).toBe(true);
  });

  it("should have nonce with leading zero byte (field element)", () => {
    const sig = signRequest(TEST_ACTION, TEST_KEY);
    // After 0x prefix, first two hex chars should be "00"
    expect(sig.nonce.slice(2, 4)).toBe("00");
  });

  it("should accept key without 0x prefix", () => {
    const keyNoPrefix =
      "abababababababababababababababababababababababababababababababab";
    const sig = signRequest(TEST_ACTION, keyNoPrefix);
    expect(sig.sig).toMatch(/^0x[0-9a-f]{130}$/);
  });

  it("should reject signing key that is too short", () => {
    expect(() => signRequest(TEST_ACTION, "0xabcd")).toThrow();
  });

  it("should reject signing key with invalid hex", () => {
    const invalidKey =
      "0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ";
    expect(() => signRequest(TEST_ACTION, invalidKey)).toThrow();
  });
});
