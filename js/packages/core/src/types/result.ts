/**
 * Result types - re-exported from WASM bindings
 *
 * Source of truth: rust/core/src/wasm_bindings.rs (typescript_custom_section)
 */

// Re-export types from WASM
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
} from "../lib/wasm";
