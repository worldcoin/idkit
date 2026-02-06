/**
 * Configuration types for IDKit
 *
 * Note: CredentialType, CredentialRequestType, and ConstraintNode are now
 * re-exported from WASM (source of truth: rust/core/src/wasm_bindings.rs)
 */

declare const brand: unique symbol;
type Brand<T, TBrand extends string> = T & { [brand]: TBrand };

export type AbiEncodedValue = Brand<
  { types: string[]; values: unknown[] },
  "AbiEncodedValue"
>;

/**
 * Relying Party context for IDKit requests
 *
 * Contains RP-specific data needed to construct a ProofRequest.
 * This should be generated and signed by your backend.
 */
export type RpContext = {
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
};

/**
 * Configuration for IDKit.request()
 */
export type IDKitRequestConfig = {
  /** Unique identifier for the app verifying the action. This should be the app ID obtained from the Developer Portal. */
  app_id: `app_${string}`;
  /** Identifier for the action the user is performing. Should be left blank for [Sign in with Worldcoin](https://docs.world.org/id/sign-in). */
  action: AbiEncodedValue | string;
  /** RP context for protocol-level proof requests (required) */
  rp_context: RpContext;
  /** The description of the specific action (shown to users in World App). Only recommended for actions created on-the-fly. */
  action_description?: string;
  /** URL to a third-party bridge to use when connecting to the World App. Optional. */
  bridge_url?: string;

  /**
   * Whether to accept legacy (v3) World ID proofs as fallback.
   *
   * - `true`: Accept both v3 and v4 proofs. Use during migration.
   *   You must track both v3 and v4 nullifiers to prevent double-claims.
   * - `false`: Only accept v4 proofs. Use after migration cutoff or for new apps.
   */
  allow_legacy_proofs: boolean;

  /** Optional override for the connect base URL (e.g., for staging environments) */
  override_connect_base_url?: string;

  /** Optional environment override. Defaults to "production". */
  environment?: "production" | "staging";
};

/**
 * Configuration for IDKit.createSession() and IDKit.proveSession()
 *
 * Session requests don't have an action field - they're used for session-based
 * authentication where the user proves they're the same person across visits.
 *
 * Sessions are always World ID v4 - there is no legacy (v3) session support.
 */
export type IDKitSessionConfig = {
  /** Unique identifier for the app verifying the session. This should be the app ID obtained from the Developer Portal. */
  app_id: `app_${string}`;
  /** RP context for protocol-level proof requests (required) */
  rp_context: RpContext;
  /** The description of the action (shown to users in World App). Optional. */
  action_description?: string;
  /** URL to a third-party bridge to use when connecting to the World App. Optional. */
  bridge_url?: string;
  /** Optional override for the connect base URL (e.g., for staging environments) */
  override_connect_base_url?: string;

  /** Optional environment override. Defaults to "production". */
  environment?: "production" | "staging";
};
