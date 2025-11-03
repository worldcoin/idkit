/**
 * WASM module loader
 */

import initWasm, {
  WasmAppId,
  WasmRequest,
  WasmConstraints,
  encodeSignal as wasmEncodeSignal,
  hashToField as wasmHashToField,
} from '../wasm/idkit_wasm.js';

let wasmInitialized = false;

/**
 * Initialize the WASM module
 * Must be called before using any other IDKit functions
 */
export async function initIDKit(): Promise<void> {
  if (wasmInitialized) {
    return;
  }

  await initWasm();
  wasmInitialized = true;
}

/**
 * Check if WASM is initialized
 */
export function isInitialized(): boolean {
  return wasmInitialized;
}

/**
 * Ensure WASM is initialized
 * @internal
 */
export async function ensureInitialized(): Promise<void> {
  if (!wasmInitialized) {
    await initIDKit();
  }
}

// Re-export WASM types
export { WasmAppId, WasmRequest, WasmConstraints, wasmEncodeSignal, wasmHashToField };
