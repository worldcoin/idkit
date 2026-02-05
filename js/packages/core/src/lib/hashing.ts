import { WasmModule } from "./wasm";

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
