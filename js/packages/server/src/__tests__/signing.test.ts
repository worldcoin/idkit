import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import {
  getPublicKey,
  Signature as SecpSignature,
  etc,
} from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3";
import initWasm, {
  computeRpSignatureMessage as wasmComputeRpSignatureMessage,
  hashSignal as wasmHashSignal,
  signRequest as wasmSignRequest,
} from "../../../core/wasm/idkit_wasm.js";
import {
  signRequest,
  computeRpSignatureMessage,
  hashToField,
} from "../lib/signing";

const bytesToHex = (input: Uint8Array): string =>
  Buffer.from(input).toString("hex");
const hexToBytes = (input: string): Uint8Array =>
  new Uint8Array(Buffer.from(input, "hex"));
const hashEthereumMessage = (message: Uint8Array): Uint8Array => {
  const prefix = new TextEncoder().encode(
    `\x19Ethereum Signed Message:\n${message.length}`,
  );
  return keccak_256(etc.concatBytes(prefix, message));
};
const ethereumAddressFromPublicKey = (publicKey: Uint8Array): string => {
  const digest = keccak_256(publicKey.slice(1));
  return "0x" + bytesToHex(digest.slice(-20));
};
const recoverAddressFromSignature = (
  signatureHex: string,
  message: Uint8Array,
): string => {
  const signatureBytes = hexToBytes(signatureHex.slice(2));
  const signature = SecpSignature.fromCompact(signatureBytes.slice(0, 64))
    .addRecoveryBit(signatureBytes[64] - 27)
    .recoverPublicKey(hashEthereumMessage(message));

  return ethereumAddressFromPublicKey(signature.toRawBytes(false));
};
type RandomValuesCrypto = {
  getRandomValues: (buffer: Uint8Array) => Uint8Array;
};

const TEST_KEY =
  "0xabababababababababababababababababababababababababababababababab";
const TEST_ACTION = "test-action";
const FIXED_NOW_MS = 1700000000_000;
const TEST_SIGNER_ADDRESS = ethereumAddressFromPublicKey(
  getPublicKey(hexToBytes(TEST_KEY.slice(2)), false),
);

// Stubs clock and randomness so JS and WASM no-action signRequest produce identical outputs.
const stubDeterministicRuntime = () => {
  vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW_MS);
  vi.stubGlobal("crypto", {
    getRandomValues: (buffer: Uint8Array) => {
      for (let i = 0; i < buffer.length; i += 1) {
        buffer[i] = i;
      }
      return buffer;
    },
  } satisfies RandomValuesCrypto);
};

beforeAll(async () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const wasmPath = join(__dirname, "../../../core/wasm/idkit_wasm_bg.wasm");
  const wasmBuffer = await readFile(wasmPath);
  await initWasm({ module_or_path: wasmBuffer });
});

describe("hashToField parity (server JS vs Rust WASM)", () => {
  it("should match for fixed vectors", () => {
    const inputs = [
      new TextEncoder().encode(""),
      new TextEncoder().encode("test_signal"),
      new Uint8Array([0x01, 0x02, 0x03]),
      hexToBytes("68656c6c6f"),
    ];

    for (const input of inputs) {
      expect("0x" + bytesToHex(hashToField(input))).toBe(wasmHashSignal(input));
    }
  });

  it("should match for deterministic generated inputs", () => {
    for (let len = 0; len <= 512; len += 1) {
      const input = new Uint8Array(len);
      for (let i = 0; i < len; i += 1) {
        input[i] = (i * 31 + len * 17) % 256;
      }

      expect("0x" + bytesToHex(hashToField(input))).toBe(wasmHashSignal(input));
    }
  });
});

describe("hashToField", () => {
  it("should hash empty string bytes to expected field element", () => {
    const input = new TextEncoder().encode("");
    expect("0x" + bytesToHex(hashToField(input))).toBe(
      "0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4",
    );
  });

  it('should hash "test_signal" bytes to expected field element', () => {
    const input = new TextEncoder().encode("test_signal");
    expect("0x" + bytesToHex(hashToField(input))).toBe(
      "0x00c1636e0a961a3045054c4d61374422c31a95846b8442f0927ad2ff1d6112ed",
    );
  });

  it("should hash raw [0x01, 0x02, 0x03] bytes to expected field element", () => {
    const input = new Uint8Array([0x01, 0x02, 0x03]);
    expect("0x" + bytesToHex(hashToField(input))).toBe(
      "0x00f1885eda54b7a053318cd41e2093220dab15d65381b1157a3633a83bfd5c92",
    );
  });

  it('should hash hex-decoded "0x68656c6c6f" bytes to expected field element', () => {
    const input = hexToBytes("68656c6c6f");
    expect("0x" + bytesToHex(hashToField(input))).toBe(
      "0x001c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36dea",
    );
  });
});

describe("computeRpSignatureMessage", () => {
  it("should be deterministic for the same inputs", () => {
    const nonce = new Uint8Array(32).fill(0x01);
    const msg1 = computeRpSignatureMessage(nonce, 100, 400);
    const msg2 = computeRpSignatureMessage(nonce, 100, 400);
    expect(msg1).toEqual(msg2);
  });

  it("should match Rust WASM for representative message vectors", () => {
    const cases = [
      {
        nonce: new Uint8Array(32),
        createdAt: 0,
        expiresAt: 0,
      },
      {
        nonce: hashToField(new Uint8Array(32).fill(0xaa)),
        createdAt: 1000,
        expiresAt: 1300,
      },
      {
        nonce: hashToField(Uint8Array.from({ length: 32 }, (_, i) => i)),
        createdAt: 1700000000,
        expiresAt: 1700000300,
      },
    ];

    for (const { nonce, createdAt, expiresAt } of cases) {
      const jsMsg = computeRpSignatureMessage(nonce, createdAt, expiresAt);
      const wasmMsg = wasmComputeRpSignatureMessage(
        "0x" + bytesToHex(nonce),
        BigInt(createdAt),
        BigInt(expiresAt),
      );

      expect(wasmMsg).toEqual(jsMsg);
    }
  });

  it("should append the hashed action field when provided", () => {
    const nonce = hashToField(new Uint8Array(32).fill(0x11));
    const createdAt = 1700000000;
    const expiresAt = 1700000300;
    const msg = computeRpSignatureMessage(
      nonce,
      createdAt,
      expiresAt,
      TEST_ACTION,
    );

    expect(msg.length).toBe(81);
    expect(msg[0]).toBe(0x01);
    expect(msg.slice(1, 33)).toEqual(nonce);

    const view = new DataView(msg.buffer);
    expect(view.getBigUint64(33, false)).toBe(BigInt(createdAt));
    expect(view.getBigUint64(41, false)).toBe(BigInt(expiresAt));
    expect(msg.slice(49)).toEqual(
      hashToField(new TextEncoder().encode(TEST_ACTION)),
    );

    const wasmMsg = wasmComputeRpSignatureMessage(
      "0x" + bytesToHex(nonce),
      BigInt(createdAt),
      BigInt(expiresAt),
      TEST_ACTION,
    );
    expect(wasmMsg).toEqual(msg);
  });

  it("should append the hashed empty action when explicitly provided", () => {
    const nonce = hashToField(new Uint8Array(32).fill(0x22));
    const msg = computeRpSignatureMessage(nonce, 1700000000, 1700000300, "");

    expect(msg.length).toBe(81);
    expect(msg.slice(49)).toEqual(hashToField(new TextEncoder().encode("")));
  });
});

describe("signRequest", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("should return correctly formatted signature", () => {
    const sig = signRequest({ action: TEST_ACTION, signingKeyHex: TEST_KEY });

    expect(sig.sig).toMatch(/^0x[0-9a-f]{130}$/);
    expect(sig.sig.length).toBe(132);

    expect(sig.nonce).toMatch(/^0x[0-9a-f]{64}$/);
    expect(sig.nonce.length).toBe(66);
  });

  it("should use default TTL of 300 seconds", () => {
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW_MS);
    const sig = signRequest({ action: TEST_ACTION, signingKeyHex: TEST_KEY });

    expect(sig.createdAt).toBe(1700000000);
    expect(sig.expiresAt).toBe(1700000300);
    expect(sig.expiresAt - sig.createdAt).toBe(300);
  });

  it("should use custom TTL", () => {
    vi.spyOn(Date, "now").mockReturnValue(FIXED_NOW_MS);
    const sig = signRequest({
      action: TEST_ACTION,
      signingKeyHex: TEST_KEY,
      ttl: 600,
    });

    expect(sig.createdAt).toBe(1700000000);
    expect(sig.expiresAt).toBe(1700000600);
    expect(sig.expiresAt - sig.createdAt).toBe(600);
  });

  it("should generate unique nonces", () => {
    const sig1 = signRequest({ action: TEST_ACTION, signingKeyHex: TEST_KEY });
    const sig2 = signRequest({ action: TEST_ACTION, signingKeyHex: TEST_KEY });
    expect(sig1.nonce).not.toBe(sig2.nonce);
  });

  it("should produce v value of 27 or 28", () => {
    const sig = signRequest({ action: TEST_ACTION, signingKeyHex: TEST_KEY });
    const vHex = sig.sig.slice(-2);
    const v = parseInt(vHex, 16);
    expect(v === 27 || v === 28).toBe(true);
  });

  it("should have nonce with leading zero byte (field element)", () => {
    const sig = signRequest({ action: TEST_ACTION, signingKeyHex: TEST_KEY });
    expect(sig.nonce.slice(2, 4)).toBe("00");
  });

  it("should accept key without 0x prefix", () => {
    const keyNoPrefix =
      "abababababababababababababababababababababababababababababababab";
    const sig = signRequest({
      action: TEST_ACTION,
      signingKeyHex: keyNoPrefix,
    });
    expect(sig.sig).toMatch(/^0x[0-9a-f]{130}$/);
  });

  it("should reject signing key that is too short", () => {
    expect(() =>
      signRequest({ action: TEST_ACTION, signingKeyHex: "0xabcd" }),
    ).toThrow();
  });

  it("should reject signing key with invalid hex", () => {
    const invalidKey =
      "0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ";
    expect(() =>
      signRequest({ action: TEST_ACTION, signingKeyHex: invalidKey }),
    ).toThrow();
  });

  it("should reject non-string actions", () => {
    expect(() =>
      signRequest({ action: null as any, signingKeyHex: TEST_KEY }),
    ).toThrow("Invalid action");
    expect(() =>
      signRequest({ action: 123 as any, signingKeyHex: TEST_KEY }),
    ).toThrow("Invalid action");
  });

  it("should support signing without an action", () => {
    const sig = signRequest({ signingKeyHex: TEST_KEY });

    expect(sig.sig).toMatch(/^0x[0-9a-f]{130}$/);
    expect(sig.nonce).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("should change the signature when action is included", () => {
    stubDeterministicRuntime();

    const sigWithoutAction = signRequest({ signingKeyHex: TEST_KEY });
    const sigWithAction = signRequest({
      action: TEST_ACTION,
      signingKeyHex: TEST_KEY,
    });

    expect(sigWithAction.nonce).toBe(sigWithoutAction.nonce);
    expect(sigWithAction.createdAt).toBe(sigWithoutAction.createdAt);
    expect(sigWithAction.expiresAt).toBe(sigWithoutAction.expiresAt);
    expect(sigWithAction.sig).not.toBe(sigWithoutAction.sig);
  });

  it("should match Rust WASM for deterministic signature generation", () => {
    stubDeterministicRuntime();

    const jsSig = signRequest({ signingKeyHex: TEST_KEY });
    const wasmSig = wasmSignRequest(TEST_KEY).toJSON();

    expect(wasmSig).toEqual(jsSig);
  });

  it("should match Rust WASM for deterministic signature generation with action", () => {
    stubDeterministicRuntime();

    const jsSig = signRequest({
      action: TEST_ACTION,
      signingKeyHex: TEST_KEY,
    });
    const wasmSig = wasmSignRequest(TEST_KEY, undefined, TEST_ACTION).toJSON();

    expect(wasmSig).toEqual(jsSig);
  });

  it("should recover the expected signer address for session proofs", () => {
    stubDeterministicRuntime();

    const sig = signRequest({ signingKeyHex: TEST_KEY });
    const message = computeRpSignatureMessage(
      hexToBytes(sig.nonce.slice(2)),
      sig.createdAt,
      sig.expiresAt,
    );

    expect(recoverAddressFromSignature(sig.sig, message)).toBe(
      TEST_SIGNER_ADDRESS,
    );
  });

  it("should recover the expected signer address for action proofs", () => {
    stubDeterministicRuntime();

    const sig = signRequest({ action: TEST_ACTION, signingKeyHex: TEST_KEY });
    const message = computeRpSignatureMessage(
      hexToBytes(sig.nonce.slice(2)),
      sig.createdAt,
      sig.expiresAt,
      TEST_ACTION,
    );

    expect(recoverAddressFromSignature(sig.sig, message)).toBe(
      TEST_SIGNER_ADDRESS,
    );
  });

  it("should serialize sig as a single string in WASM JSON output", () => {
    stubDeterministicRuntime();

    const wasmSig = wasmSignRequest(TEST_KEY);
    expect(typeof wasmSig.sig).toBe("string");

    const jsonValue = wasmSig.toJSON();
    expect(typeof jsonValue.sig).toBe("string");
    expect(jsonValue.sig).toBe(wasmSig.sig);

    const serialized = JSON.parse(JSON.stringify(wasmSig));
    expect(typeof serialized.sig).toBe("string");
    expect(serialized.sig).toBe(wasmSig.sig);
  });
});
