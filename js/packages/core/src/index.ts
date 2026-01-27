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
  type Status,
  type WaitOptions,
  type RpContext,
  type Preset,
  type OrbLegacyPreset,
} from "./request";

// Types
export type {
  IDKitRequestConfig,
  ConstraintNode,
  CredentialRequestType,
  AbiEncodedValue,
  CredentialType,
} from "./types/config";
export type { ISuccessResult, IErrorState } from "./types/result";
export {
  AppErrorCodes,
  VerificationState,
  ResponseStatus,
} from "./types/bridge";

// Utilities
export { isReactNative, isWeb, isNode } from "./lib/platform";

// RP Signature (server-side only)
export { computeRpSignature } from "./lib/rp-signature";
export type { RpSignature } from "./lib/rp-signature";
