/**
 * Core types for IDKit
 */

/**
 * Credential types supported by World ID
 */
export enum Credential {
  Orb = 'orb',
  Face = 'face',
  SecureDocument = 'secure_document',
  Document = 'document',
  Device = 'device',
}

/**
 * Legacy verification levels (for backward compatibility)
 */
export enum VerificationLevel {
  Orb = 'orb',
  Face = 'face',
  Device = 'device',
  Document = 'document',
  SecureDocument = 'secure_document',
}

/**
 * Constraint node for declarative credential requirements
 */
export type ConstraintNode =
  | Credential
  | { any: ConstraintNode[] }
  | { all: ConstraintNode[] };

/**
 * Request configuration for a specific credential
 */
export interface Request {
  /** Type of credential to request */
  type: Credential;
  /** Signal to include in the proof */
  signal: string;
  /** Whether to require face authentication (only for orb/face credentials) */
  face_auth?: boolean;
}

/**
 * Session configuration
 */
export interface SessionConfig {
  /** Application ID (app_xxx or staging:app_xxx) */
  app_id: string;
  /** Action identifier */
  action: string;
  /** Array of credential requests */
  requests: Request[];
  /** Optional constraint logic (defaults to requiring all requests) */
  constraints?: ConstraintNode;
  /** Optional bridge URL (defaults to https://bridge.worldcoin.org) */
  bridge_url?: string;
}

/**
 * Proof returned from World ID
 */
export interface Proof {
  /** The zero-knowledge proof */
  proof: string;
  /** Merkle root */
  merkle_root: string;
  /** Nullifier hash (prevents double-signaling) */
  nullifier_hash: string;
  /** Credential type used for this proof */
  verification_level: Credential;
}

/**
 * Session status
 */
export enum SessionStatus {
  WaitingForConnection = 'waiting_for_connection',
  AwaitingConfirmation = 'awaiting_confirmation',
  Confirmed = 'confirmed',
  Failed = 'failed',
}

/**
 * Status response from polling
 */
export type StatusResponse =
  | { status: SessionStatus.WaitingForConnection }
  | { status: SessionStatus.AwaitingConfirmation }
  | { status: SessionStatus.Confirmed; proof: Proof }
  | { status: SessionStatus.Failed; error: string };

/**
 * Error from World App
 */
export enum AppError {
  UserRejected = 'user_rejected',
  CredentialUnavailable = 'credential_unavailable',
  MalformedRequest = 'malformed_request',
  InvalidNetwork = 'invalid_network',
  InclusionProofPending = 'inclusion_proof_pending',
  InclusionProofFailed = 'inclusion_proof_failed',
  UnexpectedResponse = 'unexpected_response',
  ConnectionFailed = 'connection_failed',
  GenericError = 'generic_error',
}

/**
 * IDKit error
 */
export class IDKitError extends Error {
  constructor(message: string, public code?: AppError) {
    super(message);
    this.name = 'IDKitError';
  }
}
