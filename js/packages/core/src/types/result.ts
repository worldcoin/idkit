/**
 * Result types - re-exported from WASM bindings
 *
 * Source of truth: rust/core/src/wasm_bindings.rs (typescript_custom_section)
 */

// Re-export types from WASM
export type {
  // Action-based response types
  ResponseItem,
  ResponseItemV4,
  ResponseItemV3,
  IDKitResult,
  // Session-based response types
  SessionResponseItem,
  IDKitSessionResult,
  // Status (includes both action and session confirmed)
  Status,
  // Shared types
  CredentialType,
  ConstraintNode,
  CredentialRequestType,
} from "../lib/wasm";
