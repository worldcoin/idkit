/**
 * @worldcoin/idkit-core
 * Core bridge logic for IDKit powered by Rust/WASM
 * Pure TypeScript - no dependencies
 */

// Main API (IDKit namespace)
export {
  // IDKit namespace (main entry point)
  IDKit,
  // TODO: Re-enable when World ID 4.0 is live
  // CredentialRequest,
  // any,
  // all,
  // enumerate,
  // Preset helpers
  orbLegacy,
  secureDocumentLegacy,
  documentLegacy,
  deviceLegacy,
  selfieCheckLegacy,
  // Types
  type IDKitRequest,
  type IDKitCompletionResult,
  type WaitOptions,
  type RpContext,
  type Preset,
  type OrbLegacyPreset,
  type SecureDocumentLegacyPreset,
  type DocumentLegacyPreset,
  type DeviceLegacyPreset,
  type SelfieCheckLegacyPreset,
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

// Error codes
export { IDKitErrorCodes } from "./types/result";
export type { IDKitErrorCode } from "./types/result";

// Utilities
export { isReactNative, isWeb, isNode } from "./lib/platform";
export { isInWorldApp } from "./transports/native";

// RP Request Signing (server-side only)
export { signRequest } from "./signing";
export type { RpSignature } from "./signing";

// Hashing utilities
export { hashSignal } from "./lib/hashing";
