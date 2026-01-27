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

// Backend verification
//TODO: Add back verifyCloudProof, when we implement rust binding for it.
// export { verifyCloudProof, type IVerifyResponse } from "./lib/backend";

// Utilities
export { isReactNative, isWeb, isNode } from "./lib/platform";

// WASM exports
export { initIDKit, isInitialized, WasmModule } from "./lib/wasm";
export type { RpSignature } from "../wasm/idkit_wasm";

// RP Signature (server-side only)
export { computeRpSignature } from "./lib/rp-signature";
