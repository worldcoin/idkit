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
  IntegrityBundle,
  IntegritySignatureFormat,
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

/** Mini-app (World App native transport) diagnostics. All fields optional — they are filled in as the request progresses. */
export type MiniAppDebugInfo = {
  verify_version?: 1 | 2;
  platform?: "ios" | "android" | "none";
  send_channel?: "webkit.minikit" | "Android.postMessage" | "none";
  minikit_subscribed?: boolean;
  response_channel?: "window.message" | "minikit";
};

export type IDKitDebugReport = {
  package_version: string;
  transport: "bridge" | "mini_app";
  timestamps: { generated_at: string };
  request_id?: string;
  request_payload?: object;
  /**
   * Bridge transport: decrypted plaintext response payload (string), present
   * only once the request completes. Native transport: structured debug object.
   */
  response_payload?: object | string;
  mini_app?: MiniAppDebugInfo;
};

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
  WorldId4NotAvailable = "world_id_4_not_available",
  WorldId3NotAvailable = "world_id_3_not_available",
  MalformedRequest = "malformed_request",
  InvalidNetwork = "invalid_network",
  InclusionProofPending = "inclusion_proof_pending",
  InclusionProofFailed = "inclusion_proof_failed",
  UnexpectedResponse = "unexpected_response",
  ConnectionFailed = "connection_failed",
  MaxVerificationsReached = "max_verifications_reached",
  FailedByHostApp = "failed_by_host_app",
  UserPresenceFailed = "user_presence_failed",
  InvalidRpSignature = "invalid_rp_signature",
  NullifierReplayed = "nullifier_replayed",
  DuplicateNonce = "duplicate_nonce",
  UnknownRp = "unknown_rp",
  InactiveRp = "inactive_rp",
  TimestampTooOld = "timestamp_too_old",
  TimestampTooFarInFuture = "timestamp_too_far_in_future",
  InvalidTimestamp = "invalid_timestamp",
  RpSignatureExpired = "rp_signature_expired",
  IdentityAttributesNotMatched = "identity_attributes_not_matched",
  GenericError = "generic_error",
  // Client-side errors
  InvalidRpIdFormat = "invalid_rp_id_format",
  Timeout = "timeout",
  Cancelled = "cancelled",
}
