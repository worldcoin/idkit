/**
 * Utility functions for IDKit
 */

import { wasmHashToField } from './wasm-loader.js';

/**
 * Encode a signal using Keccak256
 */
export function encodeSignal(signal: string): string {
  const bytes = new TextEncoder().encode(signal);
  const hash = wasmHashToField(bytes);
  return '0x' + Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a random AES-256-GCM key and IV
 */
export function generateKey(): { key: Uint8Array; iv: Uint8Array } {
  const key = new Uint8Array(32); // 256 bits
  const iv = new Uint8Array(12); // AES-GCM nonce length

  crypto.getRandomValues(key);
  crypto.getRandomValues(iv);

  return { key, iv };
}

/**
 * Encrypt data using AES-256-GCM
 */
export async function encrypt(
  key: Uint8Array,
  iv: Uint8Array,
  plaintext: Uint8Array
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    cryptoKey,
    plaintext as BufferSource
  );

  return new Uint8Array(ciphertext);
}

/**
 * Base64 encode bytes
 */
export function base64Encode(input: Uint8Array): string {
  return btoa(String.fromCharCode(...input));
}

/**
 * Base64 decode string
 */
export function base64Decode(input: string): Uint8Array {
  return new Uint8Array(atob(input).split('').map(c => c.charCodeAt(0)));
}
