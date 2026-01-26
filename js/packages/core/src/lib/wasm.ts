/**
 * WASM initialization and management
 */

import initWasm, * as WasmModule from "../../wasm/idkit_wasm.js";

let wasmInitialized = false;
let wasmInitPromise: Promise<void> | null = null;

/**
 * Initializes the WASM module
 * This must be called before using any WASM-powered functions
 * Safe to call multiple times - initialization only happens once
 */
export async function initIDKit(): Promise<void> {
  if (wasmInitialized) {
    return;
  }

  if (wasmInitPromise) {
    return wasmInitPromise;
  }

  wasmInitPromise = (async () => {
    try {
      await initWasm();
      wasmInitialized = true;
    } catch (error) {
      wasmInitPromise = null;
      throw new Error(`Failed to initialize IDKit WASM: ${error}`);
    }
  })();

  return wasmInitPromise;
}

/**
 * Checks if WASM has been initialized
 */
export function isInitialized(): boolean {
  return wasmInitialized;
}

/**
 * Re-exports WASM module for direct access
 */
export { WasmModule };
