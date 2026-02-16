import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex } from "@noble/hashes/utils";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha2";
import { sign, etc } from "@noble/secp256k1";
import { isServerEnvironment } from "./platform";
import { hashToField } from "./hashing";

// Configure @noble/secp256k1 with synchronous HMAC-SHA256 from @noble/hashes
etc.hmacSha256Sync = (key: Uint8Array, ...msgs: Uint8Array[]) =>
  hmac(sha256, key, etc.concatBytes(...msgs));

const DEFAULT_TTL_SEC = 300;

export interface RpSignature {
  sig: string; // 0x-prefixed, 65 bytes (r || s || v)
  nonce: string; // 0x-prefixed, 32 bytes field element
  createdAt: number; // unix seconds
  expiresAt: number; // unix seconds
}

/**
 * Builds the 48-byte message that gets signed for RP signature verification.
 *
 * Message format: nonce(32) || createdAt_u64_be(8) || expiresAt_u64_be(8)
 *
 * Matches Rust `compute_rp_signature_msg`:
 * https://github.com/worldcoin/world-id-protocol/blob/0008eab1efe200e572f27258793f9be5cb32858b/crates/primitives/src/rp.rs#L95-L105
 *
 * @param nonceBytes - 32-byte nonce as Uint8Array
 * @param createdAt - unix timestamp in seconds
 * @param expiresAt - unix timestamp in seconds
 * @returns 48-byte message ready to be hashed and signed
 */
export function computeRpSignatureMessage(
  nonceBytes: Uint8Array,
  createdAt: number,
  expiresAt: number,
): Uint8Array {
  const message = new Uint8Array(48);
  message.set(nonceBytes, 0);

  const view = new DataView(message.buffer);
  view.setBigUint64(32, BigInt(createdAt), false); // big-endian
  view.setBigUint64(40, BigInt(expiresAt), false); // big-endian

  return message;
}

/**
 * Signs an RP request using pure JS (no WASM required).
 *
 * Algorithm matches Rust implementation in rust/core/src/rp_signature.rs
 *
 * Nonce generation matches `from_arbitrary_raw_bytes`:
 * https://github.com/worldcoin/world-id-protocol/blob/31405df8bcd5a2784e04ad9890cf095111dcac13/crates/primitives/src/lib.rs#L134-L149
 *
 * @param action - The action tied to the proof request (accepted for API compat, not used in signature)
 * @param signingKeyHex - The ECDSA private key as hex (0x-prefixed or not, 32 bytes)
 * @param ttl - Time-to-live in seconds (defaults to 300 = 5 minutes)
 * @returns RpSignature object with sig, nonce, createdAt, expiresAt
 */
export function signRequest(
  _action: string,
  signingKeyHex: string,
  ttl: number = DEFAULT_TTL_SEC,
): RpSignature {
  if (!isServerEnvironment()) {
    throw new Error(
      "signRequest can only be used in Node.js environments. " +
        "This function requires access to signing keys and should never be called from browser/client-side code.",
    );
  }

  // 1. Parse signing key
  const keyHex = signingKeyHex.startsWith("0x")
    ? signingKeyHex.slice(2)
    : signingKeyHex;

  if (!/^[0-9a-fA-F]+$/.test(keyHex)) {
    throw new Error("Invalid signing key: contains non-hex characters");
  }
  if (keyHex.length !== 64) {
    throw new Error(
      `Invalid signing key: expected 32 bytes (64 hex chars), got ${keyHex.length / 2} bytes`,
    );
  }

  const privKey = etc.hexToBytes(keyHex);

  // 2. Generate nonce: keccak256(random) >> 8 (from_arbitrary_raw_bytes)
  const randomBytes = crypto.getRandomValues(new Uint8Array(32));
  const nonceBytes = hashToField(randomBytes);

  // 3. Timestamps
  const createdAt = Math.floor(Date.now() / 1000);
  const expiresAt = createdAt + ttl;

  // 4. Build message and sign
  const message = computeRpSignatureMessage(nonceBytes, createdAt, expiresAt);
  const msgHash = keccak_256(message);

  // 5. Sign with recoverable signature
  const recSig = sign(msgHash, privKey);
  const compact = recSig.toCompactRawBytes(); // 64 bytes: r(32) || s(32)

  // 6. Encode 65-byte sig: r(32) || s(32) || v(1) where v = recovery + 27
  const sig65 = new Uint8Array(65);
  sig65.set(compact, 0);
  sig65[64] = recSig.recovery + 27;

  return {
    sig: "0x" + bytesToHex(sig65),
    nonce: "0x" + bytesToHex(nonceBytes),
    createdAt,
    expiresAt,
  };
}
