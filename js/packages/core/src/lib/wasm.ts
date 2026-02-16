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
 * Re-exports WASM module for direct access
 */
export { WasmModule };

/**
 * Re-export types from WASM-generated .d.ts
 * Source of truth: rust/core/src/wasm_bindings.rs (typescript_custom_section)
 */
export type {
  // Uniqueness proof response types
  ResponseItemV4,
  ResponseItemV3,
  IDKitResult,
  IDKitResultV3,
  IDKitResultV4,
  // Session proof response types
  IDKitResultSession,
  ResponseItemSession,
  Status,
  IDKitErrorCode,
  // Shared types
  CredentialType,
  ConstraintNode,
  CredentialRequestType,
  // Preset types
  Preset,
  OrbLegacyPreset,
  SecureDocumentLegacyPreset,
  DocumentLegacyPreset,
} from "../../wasm/idkit_wasm.js";
