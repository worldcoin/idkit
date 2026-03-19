import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha2";
import { sign, etc } from "@noble/secp256k1";
import { isServerEnvironment } from "./platform";

// Configure @noble/secp256k1 with synchronous HMAC-SHA256 from @noble/hashes
etc.hmacSha256Sync = (key: Uint8Array, ...msgs: Uint8Array[]) =>
  hmac(sha256, key, etc.concatBytes(...msgs));

const DEFAULT_TTL_SEC = 300;
const RP_SIGNATURE_MSG_VERSION = 0x01;
const ETHEREUM_MESSAGE_PREFIX = "\x19Ethereum Signed Message:\n";
const textEncoder = new TextEncoder();

export function hashToField(input: Uint8Array): Uint8Array {
  const hash = BigInt("0x" + bytesToHex(keccak_256(input))) >> 8n;
  return hexToBytes(hash.toString(16).padStart(64, "0"));
}

export interface RpSignature {
  sig: string; // 0x-prefixed, 65 bytes (r || s || v)
  nonce: string; // 0x-prefixed, 32 bytes field element
  createdAt: number; // unix seconds
  expiresAt: number; // unix seconds
}

export interface SignRequestParams {
  signingKeyHex: string;
  action?: string;
  ttl?: number;
}

/**
 * Builds the message that gets signed for RP signature verification.
 *
 * Message format: version(1) || nonce(32) || createdAt_u64_be(8) || expiresAt_u64_be(8) || action?(32)
 *
 * Matches Rust `compute_rp_signature_msg` in `world-id-primitives`.
 * Session proofs omit `action`, while uniqueness proofs append the action field element.
 *
 * @param nonceBytes - 32-byte nonce as Uint8Array
 * @param createdAt - unix timestamp in seconds
 * @param expiresAt - unix timestamp in seconds
 * @param action - Optional action string hashed into a field element and appended to the message
 * @returns 49-byte or 81-byte message ready to be hashed and signed
 */
export function computeRpSignatureMessage(
  nonceBytes: Uint8Array,
  createdAt: number,
  expiresAt: number,
  action?: string,
): Uint8Array {
  const actionBytes =
    action === undefined ? undefined : hashToField(textEncoder.encode(action));
  const message = new Uint8Array(49 + (actionBytes?.length ?? 0));
  message[0] = RP_SIGNATURE_MSG_VERSION;
  message.set(nonceBytes, 1);

  const view = new DataView(message.buffer);
  view.setBigUint64(33, BigInt(createdAt), false); // big-endian
  view.setBigUint64(41, BigInt(expiresAt), false); // big-endian

  if (actionBytes) {
    message.set(actionBytes, 49);
  }

  return message;
}

function hashEthereumMessage(message: Uint8Array): Uint8Array {
  const prefix = textEncoder.encode(
    `${ETHEREUM_MESSAGE_PREFIX}${message.length}`,
  );
  return keccak_256(etc.concatBytes(prefix, message));
}

/**
 * Signs an RP request using pure JS (no WASM required).
 *
 * Algorithm matches the protocol verifier path:
 * Ethereum EIP-191 message signing over the RP signature payload bytes.
 *
 * Nonce generation matches `from_arbitrary_raw_bytes`:
 * https://github.com/worldcoin/world-id-protocol/blob/31405df8bcd5a2784e04ad9890cf095111dcac13/crates/primitives/src/lib.rs#L134-L149
 *
 * Accepts a single options object: `signRequest({ signingKeyHex, action?, ttl? })`.
 * When `action` is provided, it is hashed to a field element and appended to the signed message.
 * This is required for non-session proofs. Session proofs omit the action.
 * @returns RpSignature object with sig, nonce, createdAt, expiresAt
 */
export function signRequest(params: SignRequestParams): RpSignature {
  if (!isServerEnvironment()) {
    throw new Error(
      "signRequest can only be used in Node.js environments. " +
        "This function requires access to signing keys and should never be called from browser/client-side code.",
    );
  }

  if (typeof params !== "object" || params === null) {
    throw new Error(
      "signRequest expects an options object: signRequest({ signingKeyHex, action?, ttl? })",
    );
  }

  const { action, signingKeyHex, ttl = DEFAULT_TTL_SEC } = params;

  if (typeof signingKeyHex !== "string") {
    throw new Error(
      "Invalid signing key: expected signingKeyHex to be a string",
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
  const message = computeRpSignatureMessage(
    nonceBytes,
    createdAt,
    expiresAt,
    action,
  );
  const msgHash = hashEthereumMessage(message);

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
