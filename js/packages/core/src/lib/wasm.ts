/**
 * WASM initialization and management
 */

import initWasm, * as WasmModule from "../../wasm/idkit_wasm.js";

let wasmInitialized = false;
let wasmInitPromise: Promise<void> | null = null;

async function importNodeModule(specifier: string): Promise<unknown> {
  // Avoid static analysis of node-only imports in browser bundles.
  const dynamicImport = Function("moduleName", "return import(moduleName)") as (
    moduleName: string,
  ) => Promise<unknown>;

  return dynamicImport(specifier);
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
      const { readFile } = (await importNodeModule(
        "node:fs/promises",
      )) as typeof import("node:fs/promises");
      const { fileURLToPath } = (await importNodeModule(
        "node:url",
      )) as typeof import("node:url");
      const { dirname, join } = (await importNodeModule(
        "node:path",
      )) as typeof import("node:path");
      // WASM file is copied to dist/ by tsup, same directory as the bundled JS.
      // Avoid `new URL(..., import.meta.url)` because some server bundlers rewrite
      // it into runtime-invalid URLs.
      const modulePath = fileURLToPath(import.meta.url);
      const wasmPath = join(dirname(modulePath), "idkit_wasm_bg.wasm");
      const wasmBuffer = await readFile(wasmPath);
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
