/**
 * Signal hashing using keccak256.
 *
 * Copied from js/packages/core/src/lib/hashing.ts — pure TypeScript,
 * no WASM dependency. Matches Rust `hash_to_field` in rust/core/src/crypto.rs.
 */

import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";

/**
 * Hashes arbitrary bytes to a field element: `keccak256(input) >> 8`.
 */
export function hashToField(input: Uint8Array): Uint8Array {
  const hash = BigInt("0x" + bytesToHex(keccak_256(input))) >> 8n;
  return hexToBytes(hash.toString(16).padStart(64, "0"));
}

/**
 * Hashes a signal to its field element hex representation.
 *
 * @returns 0x-prefixed hex string
 */
export function hashSignal(signal: string | Uint8Array): string {
  let input: Uint8Array;

  if (signal instanceof Uint8Array) {
    input = signal;
  } else if (signal.startsWith("0x") && isValidHex(signal.slice(2))) {
    input = hexToBytes(signal.slice(2));
  } else {
    input = utf8ToBytes(signal);
  }

  return "0x" + bytesToHex(hashToField(input));
}

function isValidHex(s: string): boolean {
  if (s.length === 0 || s.length % 2 !== 0) return false;
  return /^[0-9a-fA-F]+$/.test(s);
}
