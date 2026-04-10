/**
 * AES-256-GCM encryption/decryption using @noble/ciphers.
 *
 * Matches the Rust implementation in rust/core/src/crypto.rs.
 * Key: 32 bytes, Nonce: 12 bytes (standard AES-GCM).
 *
 * React Native does not provide globalThis.crypto by default.
 * Users must install a polyfill and import it before this package:
 *
 *   import 'react-native-get-random-values';  // must be first import
 *   import { IDKit } from '@worldcoin/idkit-react-native';
 */

import { gcm } from "@noble/ciphers/aes";

const KEY_LENGTH = 32;
const NONCE_LENGTH = 12;

function getRandomValues<T extends ArrayBufferView>(array: T): T {
  if (
    typeof globalThis.crypto === "undefined" ||
    typeof globalThis.crypto.getRandomValues !== "function"
  ) {
    throw new Error(
      "crypto.getRandomValues is not available. " +
        "React Native does not provide a built-in Web Crypto API.\n\n" +
        "Install a polyfill and import it at the top of your entry file " +
        "(before any other imports):\n\n" +
        "  npm install react-native-get-random-values\n\n" +
        "Then in your App.tsx (or index.js):\n\n" +
        "  import 'react-native-get-random-values'; // must be first import\n",
    );
  }
  return globalThis.crypto.getRandomValues(array);
}

export function generateKey(): { key: Uint8Array; nonce: Uint8Array } {
  const key = new Uint8Array(KEY_LENGTH);
  const nonce = new Uint8Array(NONCE_LENGTH);
  getRandomValues(key);
  getRandomValues(nonce);
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
