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
  // Types
  type IDKitRequest,
  type WaitOptions,
  type RpContext,
  type Preset,
  type OrbLegacyPreset,
} from "./request";

// Config types
export type { IDKitRequestConfig, AbiEncodedValue } from "./types/config";

// Result types (re-exported from WASM - source of truth in rust/core/src/wasm_bindings.rs)
export type {
  IDKitResult,
  ResponseItem,
  ResponseItemV4,
  ResponseItemV3,
  Status,
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
export { hashSignal } from "../wasm/idkit_wasm.js";

// RP Request Signing (server-side only)
export { signRequest } from "./lib/rp-signature";
export type { RpSignature } from "./lib/rp-signature";
