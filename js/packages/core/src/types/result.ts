/**
 * Result types - re-exported from WASM bindings
 *
 * Source of truth: rust/core/src/wasm_bindings.rs (typescript_custom_section)
 */

// Re-export types from WASM
export type {
  ResponseItem,
  ResponseItemV4,
  ResponseItemV3,
  IDKitResult,
  Status,
  CredentialType,
  ConstraintNode,
  CredentialRequestType,
} from "../lib/wasm";
