import { WasmModule } from "./wasm";

/**
 * Hashes a Signal (string or Uint8Array) to its hash representation.
 * This is the same hashing used internally when constructing proof requests.
 *
 * @param signal - The signal to hash (string or Uint8Array)
 * @returns 0x-prefixed hex string representing the signal hash
 */
export function hashSignal(signal: string | Uint8Array): string {
  return WasmModule.hashSignal(signal);
}
