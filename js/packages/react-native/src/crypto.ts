/**
 * AES-256-GCM encryption/decryption using @noble/ciphers.
 *
 * Matches the Rust implementation in rust/core/src/crypto.rs.
 * Key: 32 bytes, Nonce: 12 bytes (standard AES-GCM).
 */

import { gcm } from "@noble/ciphers/aes";

const KEY_LENGTH = 32;
const NONCE_LENGTH = 12;

export function generateKey(): { key: Uint8Array; nonce: Uint8Array } {
  const key = new Uint8Array(KEY_LENGTH);
  const nonce = new Uint8Array(NONCE_LENGTH);
  crypto.getRandomValues(key);
  crypto.getRandomValues(nonce);
  return { key, nonce };
}

export function encrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  plaintext: Uint8Array,
): Uint8Array {
  return gcm(key, nonce).encrypt(plaintext);
}

export function decrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
): Uint8Array {
  return gcm(key, nonce).decrypt(ciphertext);
}

// ── Base64 helpers ──────────────────────────────────────────────────────────

export function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function decodeBase64(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
