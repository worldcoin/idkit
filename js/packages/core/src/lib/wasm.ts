/**
 * WASM initialization and management
 */

import initWasm, * as WasmModule from "../../wasm/idkit_wasm.js";

let wasmInitialized = false;
let wasmInitPromise: Promise<void> | null = null;

/**
 * Initializes the WASM module for browser environments
 * Uses fetch-based loading (works with http/https URLs)
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
 * Initializes the WASM module for Node.js/server environments
 * Uses fs-based loading since Node.js fetch doesn't support file:// URLs
 * This must be called before using any WASM-powered functions
 * Safe to call multiple times - initialization only happens once
 */
export async function initIDKitServer(): Promise<void> {
  if (wasmInitialized) {
    return;
  }

  if (wasmInitPromise) {
    return wasmInitPromise;
  }

  wasmInitPromise = (async () => {
    try {
      const { readFile } = await import("node:fs/promises");
      const { fileURLToPath } = await import("node:url");
      // WASM file is copied to dist/ by tsup, same directory as the bundled JS
      const wasmUrl = new URL("idkit_wasm_bg.wasm", import.meta.url);
      const wasmBuffer = await readFile(fileURLToPath(wasmUrl));
      await initWasm({ module_or_path: wasmBuffer });
      wasmInitialized = true;
    } catch (error) {
      wasmInitPromise = null;
      throw new Error(`Failed to initialize IDKit WASM for server: ${error}`);
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
