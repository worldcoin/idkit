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
  IDKitErrorCode,
  // Shared types
  CredentialType,
  ConstraintNode,
  CredentialRequestType,
} from "../lib/wasm";

/**
 * IDKit error codes enum — runtime values for matching against errors.
 * Values mirror Rust's AppError enum (snake_case via serde rename_all).
 * Includes client-side codes (timeout, cancelled) not from World App.
 */
export enum IDKitErrorCodes {
  // World App errors (from Rust AppError)
  UserRejected = "user_rejected",
  VerificationRejected = "verification_rejected",
  CredentialUnavailable = "credential_unavailable",
  MalformedRequest = "malformed_request",
  InvalidNetwork = "invalid_network",
  InclusionProofPending = "inclusion_proof_pending",
  InclusionProofFailed = "inclusion_proof_failed",
  UnexpectedResponse = "unexpected_response",
  ConnectionFailed = "connection_failed",
  MaxVerificationsReached = "max_verifications_reached",
  FailedByHostApp = "failed_by_host_app",
  GenericError = "generic_error",
  // Client-side errors
  Timeout = "timeout",
  Cancelled = "cancelled",
}
