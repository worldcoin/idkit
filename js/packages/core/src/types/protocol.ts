/** Public protocol DTOs. Checked against the native Rust conformance manifest and fixtures. */

export type CredentialType = "proof_of_human" | "selfie" | "passport" | "mnc";

export interface CredentialRequestType {
  type: CredentialType;
  /** Signal can be a string or raw bytes (Uint8Array) */
  signal?: string | Uint8Array;
  genesis_issued_at_min?: number;
  expires_at_min?: number;
}

export type ConstraintNode =
  | CredentialRequestType
  | { any: ConstraintNode[] }
  | { all: ConstraintNode[] }
  | { enumerate: ConstraintNode[] };

/** Device signature format used by the integrity bundle */
export type IntegritySignatureFormat = "apple_app_attest" | "android_keystore";

/** World App integrity bundle for proving request-time app integrity */
export interface IntegrityBundle {
  /** Version of the integrity bundle */
  version: number;
  /** Signature format used by the device */
  signature_format: IntegritySignatureFormat;
  /** Unix timestamp of this request, in seconds */
  timestamp: number;
  /** Hex-encoded device signature */
  signature: string;
  /** Attestation Gateway JWT proving integrity of the public key used to verify the signature */
  jwt: string;
}

/** Non-Self Check response item for World ID v4 uniqueness proofs */
export interface ResponseItemV4 {
  /** Credential identifier (e.g., "proof_of_human", "passport", "mnc") */
  identifier: string;
  /** Signal hash (optional, included if signal was provided in request) */
  signal_hash?: string;
  /** Encoded World ID proof: first 4 elements are compressed Groth16 proof, 5th is Merkle root (decimal strings). Compatible with WorldIDVerifier.sol */
  proof: string[];
  /** RP-scoped nullifier (decimal) */
  nullifier: string;
  /** Credential issuer schema ID (1=proof_of_human, 9303=passport, 9310=mnc) */
  issuer_schema_id: number;
  /** Minimum expiration timestamp (unix seconds) */
  expires_at_min: number;
}

/** Self Check response item for World ID v4 uniqueness proofs */
export interface SelfieCheckResponseItemV4 {
  /** Credential identifier */
  identifier: "selfie";
  /** Signal hash (optional, included if signal was provided in request) */
  signal_hash?: string;
  /** Encoded World ID proof: first 4 elements are compressed Groth16 proof, 5th is Merkle root (decimal strings). Compatible with WorldIDVerifier.sol */
  proof: string[];
  /** RP-scoped nullifier (decimal) */
  nullifier: string;
  /** Self Check issuer schema ID */
  issuer_schema_id: 11;
  /** Minimum expiration timestamp (unix seconds) */
  expires_at_min: number;
  /** Self Check 4.0 z-score, encoded by the issuer as an integer. */
  sybil_score: number;
}

/** V3 response item for World ID v3 (legacy format) */
export interface ResponseItemV3 {
  /** Credential identifier (e.g., "proof_of_human", "selfie") */
  identifier: string;
  /** Signal hash (optional, included if signal was provided in request) */
  signal_hash?: string;
  /** ABI-encoded proof (hex) */
  proof: string;
  /** Merkle root (hex) */
  merkle_root: string;
  /** Nullifier (hex) */
  nullifier: string;
}

/** Non-Self Check session response item for World ID v4 session proofs */
export interface ResponseItemSession {
  /** Credential identifier (e.g., "proof_of_human", "passport", "mnc") */
  identifier: string;
  /** Signal hash (optional, included if signal was provided in request) */
  signal_hash?: string;
  /** Encoded World ID proof: first 4 elements are compressed Groth16 proof, 5th is Merkle root (decimal strings). Compatible with WorldIDVerifier.sol */
  proof: string[];
  /** Session nullifier: 1st element is the session nullifier, 2nd is the generated action (decimal strings) */
  session_nullifier: string[];
  /** Credential issuer schema ID (1=proof_of_human, 9303=passport, 9310=mnc) */
  issuer_schema_id: number;
  /** Minimum expiration timestamp (unix seconds) */
  expires_at_min: number;
}

/** Self Check session response item for World ID v4 session proofs */
export interface SelfieCheckResponseItemSession {
  /** Credential identifier */
  identifier: "selfie";
  /** Signal hash (optional, included if signal was provided in request) */
  signal_hash?: string;
  /** Encoded World ID proof: first 4 elements are compressed Groth16 proof, 5th is Merkle root (decimal strings). Compatible with WorldIDVerifier.sol */
  proof: string[];
  /** Session nullifier: 1st element is the session nullifier, 2nd is the generated action (decimal strings) */
  session_nullifier: string[];
  /** Self Check issuer schema ID */
  issuer_schema_id: 11;
  /** Minimum expiration timestamp (unix seconds) */
  expires_at_min: number;
  /** Self Check 4.0 z-score, encoded by the issuer as an integer. */
  sybil_score: number;
}

/** V3 result (legacy format - no session support) */
export interface IDKitResultV3 {
  /** Protocol version 3.0 */
  protocol_version: "3.0";
  /** Nonce used in the request */
  nonce: string;
  /** Action identifier (only for uniqueness proofs) */
  action?: string;
  /** Action description (only if provided in input) */
  action_description?: string;
  /** Array of V3 credential responses */
  responses: ResponseItemV3[];
  /** Whether World App completed the requested user-presence check. Only present when requested. */
  user_presence_completed?: boolean;
  /** The environment used for this request ("production", "staging", or "sandbox") */
  environment: string;
  /** Optional World App integrity bundle for this proof request */
  integrity_bundle?: IntegrityBundle;
}

/** V4 result for uniqueness proofs */
export interface IDKitResultV4 {
  /** Protocol version 4.0 */
  protocol_version: "4.0";
  /** Nonce used in the request */
  nonce: string;
  /** Action identifier (required for uniqueness proofs) */
  action: string;
  /** Action description (only if provided in input) */
  action_description?: string;
  /** Array of V4 credential responses */
  responses: Array<ResponseItemV4 | SelfieCheckResponseItemV4>;
  /** Whether World App completed the requested user-presence check. Only present when requested. */
  user_presence_completed?: boolean;
  /** The environment used for this request ("production", "staging", or "sandbox") */
  environment: string;
  /** Whether identity attributes were attested. Only present on IdentityCheck responses. */
  identity_attested?: boolean;
  /** Optional World App integrity bundle for this proof request */
  integrity_bundle?: IntegrityBundle;
}

/** V4 result for session proofs */
export interface IDKitResultSession {
  /** Protocol version 4.0 */
  protocol_version: "4.0";
  /** Nonce used in the request */
  nonce: string;
  /** Action description (only if provided in input) */
  action_description?: string;
  /** Opaque session identifier returned by the World App in `session_<hex>` format */
  session_id: `session_${string}`;
  /** Array of session credential responses */
  responses: Array<ResponseItemSession | SelfieCheckResponseItemSession>;
  /** Whether World App completed the requested user-presence check. Only present when requested. */
  user_presence_completed?: boolean;
  /** The environment used for this request ("production", "staging", or "sandbox") */
  environment: string;
  /** Optional World App integrity bundle for this proof request */
  integrity_bundle?: IntegrityBundle;
}

/**
 * The unified result structure for all proof types.
 * Check `session_id` to determine if this is a session proof:
 * - session_id !== undefined → session proof
 * - session_id === undefined → uniqueness proof
 */
export type IDKitResult = IDKitResultV3 | IDKitResultV4 | IDKitResultSession;

/** Options used to convert a protocol ProofResponse into IDKitResult */
export interface ProofResponseToIDKitResultOptions {
  nonce: string;
  action?: string;
  action_description?: string;
  environment?: "production" | "staging" | "sandbox";
  signal_hashes?: Record<string, string>;
  identity_attested?: boolean;
  user_presence_completed?: boolean;
}

/** Configuration for session requests (no action field, v4 only) */
export interface IDKitSessionConfig {
  /** Application ID from the Developer Portal */
  app_id: `app_${string}`;
  /** RP context for protocol-level proof requests */
  rp_context: RpContext;
  /** Optional action description shown to users */
  action_description?: string;
  /** Optional bridge URL (defaults to production) */
  bridge_url?: string;
  /** Optional deep-link callback URL appended as `return_to` on the connector URL */
  return_to?: string;
  /** Require World App to perform a user-presence check before verification. Defaults to false. */
  require_user_presence?: boolean;
}

/** RpContext for proof requests */
export interface RpContext {
  /** The registered RP ID (e.g., "rp_123456789abcdef0") */
  rp_id: string;
  /** Unique nonce for this proof request */
  nonce: string;
  /** Unix timestamp (seconds since epoch) when created */
  created_at: number;
  /** Unix timestamp (seconds since epoch) when expires */
  expires_at: number;
  /** The RP's ECDSA signature of the nonce and created_at timestamp */
  signature: string;
}

/** Error codes from World App (mirrors Rust AppError) */
export type IDKitErrorCode =
  | "user_rejected"
  | "verification_rejected"
  | "credential_unavailable"
  | "feature_unavailable"
  | "world_id_4_not_available"
  | "world_id_3_not_available"
  | "malformed_request"
  | "invalid_network"
  | "inclusion_proof_pending"
  | "inclusion_proof_failed"
  | "unexpected_response"
  | "connection_failed"
  | "max_verifications_reached"
  | "failed_by_host_app"
  | "user_presence_failed"
  | "invalid_rp_signature"
  | "nullifier_replayed"
  | "duplicate_nonce"
  | "unknown_rp"
  | "inactive_rp"
  | "timestamp_too_old"
  | "timestamp_too_far_in_future"
  | "invalid_timestamp"
  | "rp_signature_expired"
  | "identity_attributes_not_matched"
  | "generic_error";

/** Status returned from pollForStatus() */
export type Status =
  | { type: "waiting_for_connection" }
  | { type: "awaiting_confirmation" }
  | { type: "confirmed"; result: IDKitResult }
  | { type: "failed"; error: IDKitErrorCode };

export type DocumentType = "passport" | "eid" | "mnc";

export type IdentityAttribute =
  | { type: "document_type"; value: DocumentType }
  | { type: "document_number"; value: string }
  | { type: "issuing_country"; value: string }
  | { type: "full_name"; value: string }
  | { type: "minimum_age"; value: number }
  | { type: "nationality"; value: string };

export interface OrbLegacyPreset {
  /** This preset only returns World ID 3.0 proofs. Use it for compatibility with older IDKit versions. */
  type: "OrbLegacy";
  signal?: string;
}

export interface SecureDocumentLegacyPreset {
  /** This preset only returns World ID 3.0 proofs. Use it for compatibility with older IDKit versions. */
  type: "SecureDocumentLegacy";
  signal?: string;
}

export interface DocumentLegacyPreset {
  /** This preset only returns World ID 3.0 proofs. Use it for compatibility with older IDKit versions. */
  type: "DocumentLegacy";
  signal?: string;
}

export interface SelfieCheckLegacyPreset {
  /** This preset only returns World ID 3.0 proofs. Use it for compatibility with older IDKit versions. */
  /** Preview: Selfie Check is currently in preview. Contact us if you need it enabled. */
  type: "SelfieCheckLegacy";
  signal?: string;
}

/**
 * A `SelfieCheck` preset.
 *
 * The preset requests the Selfie Check credential and always disables fallback to legacy proofs.
 */
export interface SelfieCheckPreset {
  type: "SelfieCheck";
  signal?: string;
}

export interface DeviceLegacyPreset {
  /** This preset only returns World ID 3.0 proofs. Use it for compatibility with older IDKit versions. */
  type: "DeviceLegacy";
  signal?: string;
}

export interface ProofOfHumanPreset {
  /** Requests a World ID 4.0 proof-of-human credential with legacy Orb fallback. */
  type: "ProofOfHuman";
  signal?: string;
}

export interface PassportPreset {
  /** Requests a World ID 4.0 passport credential with legacy document fallback. */
  type: "Passport";
  signal?: string;
}

export interface MncPreset {
  /** Requests a World ID 4.0 MNC credential with legacy document fallback. */
  type: "Mnc";
  signal?: string;
}

export interface IdentityCheckPreset {
  /** This preset requires World ID 4.0-compatible clients. */
  type: "IdentityCheck";
  attributes: IdentityAttribute[];
  legacy_signal?: string;
}

export type Preset =
  | OrbLegacyPreset
  | SecureDocumentLegacyPreset
  | DocumentLegacyPreset
  | SelfieCheckLegacyPreset
  | SelfieCheckPreset
  | DeviceLegacyPreset
  | ProofOfHumanPreset
  | PassportPreset
  | MncPreset
  | IdentityCheckPreset;

/** Preview: Selfie Check is currently in preview. Contact us if you need it enabled. */

/**
 * Creates a `SelfieCheck` preset.
 *
 * The preset requests the Selfie Check credential and always disables fallback to legacy proofs.
 */

/** Return type of nativePayload / nativePayloadFromPreset */
export interface NativePayloadResult {
  payload: unknown;
  signal_hashes: Record<string, string>;
  legacy_signal_hash: string;
}

/** V1 native payload sent to older World App versions (verify command v1) */
export interface NativeV1Payload {
  verification_level: string;
  action: string;
  signal: string;
  timestamp: string;
}

export interface BuilderConfig {
  type: "request" | "createSession" | "proveSession";
  app_id: string;
  package_name: string;
  package_version: string;
  action?: string;
  session_id?: `session_${string}`;
  rp_context?: import("../types/config").RpContext;
  action_description?: string;
  bridge_url?: string;
  return_to?: string;
  allow_legacy_proofs?: boolean;
  require_user_presence?: boolean;
  override_connect_base_url?: string;
  environment?: string;
}
