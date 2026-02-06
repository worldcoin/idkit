/**
 * @worldcoin/idkit-core
 * Core bridge logic for IDKit powered by Rust/WASM
 * Pure TypeScript - no dependencies
 */

// Main API (IDKit namespace)
export {
  // IDKit namespace (main entry point)
  IDKit,
  // Constraint helpers (also available on IDKit namespace)
  CredentialRequest,
  any,
  all,
  // Preset helpers
  orbLegacy,
  secureDocumentLegacy,
  documentLegacy,
  // Types
  type IDKitRequest,
  type WaitOptions,
  type RpContext,
  type Preset,
  type OrbLegacyPreset,
  type SecureDocumentLegacyPreset,
  type DocumentLegacyPreset,
} from "./request";

// Config types
export type {
  IDKitRequestConfig,
  IDKitSessionConfig,
  AbiEncodedValue,
} from "./types/config";

// Result types (re-exported from WASM - source of truth in rust/core/src/wasm_bindings.rs)
export type {
  // Uniqueness proof response types
  IDKitResult,
  ResponseItemV4,
  ResponseItemV3,
  // Session proof response types
  ResponseItemSession,
  IDKitResultSession,
  // Status (includes both action and session confirmed)
  Status,
  // Shared types
  CredentialType,
  ConstraintNode,
  CredentialRequestType,
} from "./types/result";

// Bridge error codes
export {
  AppErrorCodes,
  VerificationState,
  ResponseStatus,
} from "./types/bridge";

// Utilities
export { isReactNative, isWeb, isNode } from "./lib/platform";

// RP Request Signing (server-side only)
export { signRequest } from "./lib/rp-signature";
export type { RpSignature } from "./lib/rp-signature";

// Hashing utilities
export { hashSignal } from "./lib/hashing";
