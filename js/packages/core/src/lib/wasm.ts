/**
 * WASM initialization and management
 */

import initWasm, * as WasmModule from "../../wasm/idkit_wasm.js";

let wasmInitialized = false;
let wasmInitPromise: Promise<void> | null = null;
let wasmInitInput: Parameters<typeof initWasm>[0] | undefined;

/**
 * Sets the WASM location used by initIDKit().
 *
 * The ESM/CJS package path intentionally leaves this unset so wasm-bindgen can
 * resolve the .wasm file relative to its module URL. The script-tag build sets
 * it from document.currentScript because classic scripts do not have
 * import.meta.url.
 */
export function setWasmInput(
  input: Parameters<typeof initWasm>[0] | undefined,
): void {
  wasmInitInput = input;
}

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
      await initWasm(wasmInitInput);
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
  IntegrityBundle,
  IntegritySignatureFormat,
  // Session proof response types
  IDKitResultSession,
  ResponseItemSession,
  Status,
  IDKitErrorCode,
  // Shared types
  CredentialType,
  ConstraintNode,
  CredentialRequestType,
  DocumentType,
  IdentityAttribute,
  // Preset types
  Preset,
  OrbLegacyPreset,
  SecureDocumentLegacyPreset,
  DocumentLegacyPreset,
  DeviceLegacyPreset,
  SelfieCheckLegacyPreset,
  ProofOfHumanPreset,
  PassportPreset,
  IdentityCheckPreset,
  MncPreset,
  // Native transport types
  NativePayloadResult,
} from "../../wasm/idkit_wasm.js";
