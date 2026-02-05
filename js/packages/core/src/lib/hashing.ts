import { WasmModule } from "./wasm";

/**
 * Hashes a signal string using Keccak256, shifted right 8 bits.
 * Returns raw bytes (32 bytes).
 *
 * @param signal - The signal string to hash
 * @returns Uint8Array (32 bytes) representing the field element
 */
export function hashSignal(signal: string): Uint8Array {
  return WasmModule.hashSignal(signal);
}

/**
 * Hashes raw bytes using Keccak256, shifted right 8 bits.
 * Returns raw bytes (32 bytes).
 *
 * @param bytes - The bytes to hash
 * @returns Uint8Array (32 bytes) representing the field element
 */
export function hashSignalBytes(bytes: Uint8Array): Uint8Array {
  return WasmModule.hashSignalBytes(bytes);
}

/**
 * Encodes a Signal (string or Uint8Array) to its hash representation.
 * This is the same encoding used internally when constructing proof requests.
 *
 * @param signal - The signal to encode (string or Uint8Array)
 * @returns 0x-prefixed hex string representing the signal hash
 */
export function encodeSignal(signal: string | Uint8Array): string {
  return WasmModule.encodeSignal(signal);
}
