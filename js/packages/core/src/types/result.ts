import type { AppErrorCodes } from "./bridge";
import type { CredentialType } from "./config";

// ─────────────────────────────────────────────────────────────────────────────
// Legacy types (World ID 3.0 - backward compatibility)
// ─────────────────────────────────────────────────────────────────────────────

export interface ISuccessResult {
  proof: string;
  merkle_root: string;
  nullifier_hash: string;
  /** The credential type used to generate the proof */
  verification_level: CredentialType;
}

export interface IErrorState {
  code: AppErrorCodes;
  message?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified Response Types (World ID 4.0)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * V4 proof data - contains all fields for Verifier.sol on-chain verification
 */
export interface V4ProofData {
  type: "v4";
  /** Compressed Groth16 proof (hex) */
  proof: string;
  /** RP-scoped nullifier (hex) */
  nullifier: string;
  /** Authenticator merkle root (hex) */
  merkle_root: string;
  /** Unix timestamp when proof was generated - CRITICAL for Verifier.sol */
  proof_timestamp: number;
  /** Credential issuer ID (hex) - maps to credential type */
  issuer_schema_id: string;
}

/**
 * Legacy v3 proof data (backward compatibility)
 */
export interface LegacyProofData {
  type: "legacy";
  /** ABI-encoded proof (hex) */
  proof: string;
  /** Merkle root (hex) */
  merkle_root: string;
  /** Nullifier hash (hex) */
  nullifier_hash: string;
}

/**
 * Discriminated union for V4 vs Legacy proofs
 *
 * Use the type guard functions `isV4Proof()` and `isLegacyProof()` for narrowing.
 */
export type ProofData = V4ProofData | LegacyProofData;

/**
 * A single credential response item in the IDKitResponse array
 *
 * Each item represents the result of a requested credential verification.
 * It either contains proof data on success or an error message on failure.
 */
export interface IDKitResponseItem {
  /** The type of credential this response is for */
  credential_type: CredentialType;
  /** Proof data if verification succeeded */
  proof_data?: ProofData;
  /** Error message if verification failed for this credential */
  error?: string;
}

/**
 * The unified response structure containing session metadata and credential responses
 *
 * This is the top-level result returned from a verification flow. It contains
 * an optional session ID (for session proofs) and an array of credential responses.
 */
export interface IDKitResult {
  /** Session ID (response-level, for session proofs) */
  session_id?: string;
  /** Array of credential responses */
  responses: IDKitResponseItem[];
}

/**
 * Type alias for the response array
 */
export type IDKitResponse = IDKitResponseItem[];

// ─────────────────────────────────────────────────────────────────────────────
// Type Guards
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Type guard: check if proof data is V4
 *
 * @example
 * ```typescript
 * if (isV4Proof(item.proof_data)) {
 *   console.log('Proof timestamp:', item.proof_data.proof_timestamp);
 * }
 * ```
 */
export function isV4Proof(data: ProofData): data is V4ProofData {
  return data.type === "v4";
}

/**
 * Type guard: check if proof data is Legacy
 *
 * @example
 * ```typescript
 * if (isLegacyProof(item.proof_data)) {
 *   console.log('Nullifier hash:', item.proof_data.nullifier_hash);
 * }
 * ```
 */
export function isLegacyProof(data: ProofData): data is LegacyProofData {
  return data.type === "legacy";
}
