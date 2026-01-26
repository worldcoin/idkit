declare const brand: unique symbol;
type Brand<T, TBrand extends string> = T & { [brand]: TBrand };

export type AbiEncodedValue = Brand<
  { types: string[]; values: unknown[] },
  "AbiEncodedValue"
>;

export type CredentialType =
  | "orb"
  | "face"
  | "secure_document"
  | "document"
  | "device";

/**
 * A single credential request
 */
export type RequestConfig = {
  /** The type of credential being requested */
  credential_type: CredentialType;
  /** Optional signal string for cryptographic binding */
  signal?: AbiEncodedValue | string;
};

/**
 * Relying Party context for protocol-level proof requests
 *
 * Required for creating a verification session. Contains RP-specific data
 * needed to construct a ProofRequest. In production, this should be generated
 * and signed by your backend.
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

export type IDKitConfig = {
  /** Unique identifier for the app verifying the action. This should be the app ID obtained from the Developer Portal. */
  app_id: `app_${string}`;
  /** Identifier for the action the user is performing. Should be left blank for [Sign in with Worldcoin](https://docs.world.org/id/sign-in). */
  // TODO: Expore how can we support AbiEncoded values for actions
  action: string;
  /** RP context for protocol-level proof requests (required) */
  rp_context: RpContext;
  /** The description of the specific action (shown to users in World App). Only recommended for actions created on-the-fly. */
  action_description?: string;
  /** URL to a third-party bridge to use when connecting to the World App. Optional. */
  bridge_url?: string;
  /** Credential requests - at least one required */
  requests: RequestConfig[];
  /** Optional constraints JSON (matches Rust Constraints any/all structure) */
  constraints?: unknown;
};
