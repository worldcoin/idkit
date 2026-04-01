/**
 * Type definitions for IDKit React Native.
 *
 * Types are defined locally to avoid any runtime dependency on @worldcoin/idkit-core,
 * which bundles WASM and Node.js modules that Metro cannot resolve.
 *
 * These types match @worldcoin/idkit-core exactly.
 * Source of truth: js/packages/core/src/types/ and wasm/idkit_wasm.d.ts
 */

// ── Config types (match core/src/types/config.ts) ───────────────────────────

export type RpContext = {
  rp_id: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  signature: string;
};

export type IDKitRequestConfig = {
  app_id: `app_${string}`;
  action: string;
  rp_context: RpContext;
  action_description?: string;
  bridge_url?: string;
  return_to?: string;
  allow_legacy_proofs: boolean;
  override_connect_base_url?: string;
  environment?: "production" | "staging";
};

export type IDKitSessionConfig = {
  app_id: `app_${string}`;
  rp_context: RpContext;
  action_description?: string;
  bridge_url?: string;
  return_to?: string;
  override_connect_base_url?: string;
  environment?: "production" | "staging";
};

// ── Result types (match wasm/idkit_wasm.d.ts) ───────────────────────────────

export interface ResponseItemV4 {
  identifier: string;
  signal_hash?: string;
  proof: string[];
  nullifier: string;
  issuer_schema_id: number;
  expires_at_min: number;
}

export interface ResponseItemV3 {
  identifier: string;
  signal_hash?: string;
  proof: string;
  merkle_root: string;
  nullifier: string;
}

export interface ResponseItemSession {
  identifier: string;
  signal_hash?: string;
  proof: string[];
  session_nullifier: string[];
  issuer_schema_id: number;
  expires_at_min: number;
}

export interface IDKitResultV3 {
  protocol_version: "3.0";
  nonce: string;
  action?: string;
  action_description?: string;
  responses: ResponseItemV3[];
  environment: string;
}

export interface IDKitResultV4 {
  protocol_version: "4.0";
  nonce: string;
  action: string;
  action_description?: string;
  responses: ResponseItemV4[];
  environment: string;
}

export interface IDKitResultSession {
  protocol_version: "4.0";
  nonce: string;
  action_description?: string;
  session_id: `session_${string}`;
  responses: ResponseItemSession[];
  environment: string;
}

export type IDKitResult = IDKitResultV3 | IDKitResultV4 | IDKitResultSession;

// ── Error codes (match core/src/types/result.ts) ────────────────────────────

export enum IDKitErrorCodes {
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
  Timeout = "timeout",
  Cancelled = "cancelled",
}

export type IDKitErrorCode = `${IDKitErrorCodes}`;

// ── Status ──────────────────────────────────────────────────────────────────

export type Status =
  | { type: "waiting_for_connection" }
  | { type: "awaiting_confirmation" }
  | { type: "confirmed"; result: IDKitResult }
  | { type: "failed"; error: IDKitErrorCodes };

export type IDKitCompletionResult =
  | { success: true; result: IDKitResult }
  | { success: false; error: IDKitErrorCodes };

// ── Polling options ─────────────────────────────────────────────────────────

export interface WaitOptions {
  pollInterval?: number;
  timeout?: number;
  signal?: AbortSignal;
}

// ── Request interface ───────────────────────────────────────────────────────

export interface IDKitRequest {
  readonly connectorURI: string;
  readonly requestId: string;
  pollOnce(): Promise<Status>;
  pollUntilCompletion(options?: WaitOptions): Promise<IDKitCompletionResult>;
}

// ── Presets (match wasm/idkit_wasm.d.ts) ────────────────────────────────────

export interface OrbLegacyPreset {
  type: "OrbLegacy";
  signal?: string;
}

export interface SecureDocumentLegacyPreset {
  type: "SecureDocumentLegacy";
  signal?: string;
}

export interface DocumentLegacyPreset {
  type: "DocumentLegacy";
  signal?: string;
}

export interface SelfieCheckLegacyPreset {
  type: "SelfieCheckLegacy";
  signal?: string;
}

export interface DeviceLegacyPreset {
  type: "DeviceLegacy";
  signal?: string;
}

export type Preset =
  | OrbLegacyPreset
  | SecureDocumentLegacyPreset
  | DocumentLegacyPreset
  | SelfieCheckLegacyPreset
  | DeviceLegacyPreset;

// ── Verification level (legacy, matches Rust VerificationLevel) ─────────────

export type VerificationLevel =
  | "orb"
  | "device"
  | "document"
  | "secure_document"
  | "face";
