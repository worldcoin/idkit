/**
 * IDKit Session
 * Pure functional API for World ID verification - no dependencies
 */

import type {
  VerifyConfig,
  ConstraintNode,
  CredentialType,
  CredentialRequestType,
  RpContext,
} from "./types/config";
import type { ISuccessResult } from "./types/result";
import { AppErrorCodes } from "./types/bridge";
import { WasmModule, initIDKit } from "./lib/wasm";

/** Options for pollForUpdates() */
export interface WaitOptions {
  /** Milliseconds between polls (default: 1000) */
  pollInterval?: number;
  /** Total timeout in milliseconds (default: 300000 = 5 minutes) */
  timeout?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/** Status returned from pollOnce() */
export interface Status {
  type:
    | "waiting_for_connection"
    | "awaiting_confirmation"
    | "confirmed"
    | "failed";
  proof?: ISuccessResult;
  error?: AppErrorCodes;
}

// Re-export RpContext for convenience
export type { RpContext };

/**
 * A World ID verification session
 *
 * Provides a clean, promise-based API for World ID verification flows.
 * Each session represents a single verification attempt.
 */
export interface Session {
  /** QR code URL for World App - display this as a QR code for users to scan */
  readonly connectorURI: string;
  /** Unique request ID for this verification */
  readonly requestId: string;
  /** Poll once for current status (for manual polling) */
  pollOnce(): Promise<Status>;
  /** Poll continuously until completion or timeout */
  pollForUpdates(options?: WaitOptions): Promise<ISuccessResult>;
}

/**
 * Internal session implementation
 */
class SessionImpl implements Session {
  private wasmSession: WasmModule.Session;
  private _connectorURI: string;
  private _requestId: string;

  constructor(wasmSession: WasmModule.Session) {
    this.wasmSession = wasmSession;
    this._connectorURI = wasmSession.connectUrl();
    this._requestId = wasmSession.requestId();
  }

  get connectorURI(): string {
    return this._connectorURI;
  }

  get requestId(): string {
    return this._requestId;
  }

  async pollOnce(): Promise<Status> {
    return (await this.wasmSession.pollForStatus()) as Status;
  }

  async pollForUpdates(options?: WaitOptions): Promise<ISuccessResult> {
    const pollInterval = options?.pollInterval ?? 1000;
    const timeout = options?.timeout ?? 300000; // 5 minutes default
    const startTime = Date.now();

    while (true) {
      // Check for cancellation
      if (options?.signal?.aborted) {
        throw new Error("Verification cancelled");
      }

      // Check timeout
      if (Date.now() - startTime > timeout) {
        throw new Error(`Timeout waiting for proof after ${timeout}ms`);
      }

      // Poll status
      const status = await this.pollOnce();

      if (status.type === "confirmed" && status.proof) {
        return status.proof;
      }

      if (status.type === "failed") {
        const errorCode = status.error ?? AppErrorCodes.GenericError;
        throw new Error(`Verification failed: ${errorCode}`);
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CredentialRequest and Constraint helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a CredentialRequest for a credential type
 *
 * @param credential_type - The type of credential to request (e.g., 'orb', 'face')
 * @param options - Optional signal and genesis_issued_at_min
 * @returns A CredentialRequest object
 *
 * @example
 * ```typescript
 * const orb = CredentialRequest('orb', { signal: 'user-123' })
 * const face = CredentialRequest('face')
 * ```
 */
export function CredentialRequest(
  credential_type: CredentialType,
  options?: { signal?: string; genesis_issued_at_min?: number },
): CredentialRequestType {
  return {
    type: credential_type,
    signal: options?.signal,
    genesis_issued_at_min: options?.genesis_issued_at_min,
  };
}

/**
 * Creates an OR constraint - at least one child must be satisfied
 *
 * @param nodes - Constraint nodes (CredentialRequests or nested constraints)
 * @returns An "any" constraint node
 *
 * @example
 * ```typescript
 * const constraint = any(CredentialRequest('orb'), CredentialRequest('face'))
 * ```
 */
export function any(...nodes: ConstraintNode[]): { any: ConstraintNode[] } {
  return { any: nodes };
}

/**
 * Creates an AND constraint - all children must be satisfied
 *
 * @param nodes - Constraint nodes (CredentialRequests or nested constraints)
 * @returns An "all" constraint node
 *
 * @example
 * ```typescript
 * const constraint = all(CredentialRequest('orb'), any(CredentialRequest('document'), CredentialRequest('secure_document')))
 * ```
 */
export function all(...nodes: ConstraintNode[]): { all: ConstraintNode[] } {
  return { all: nodes };
}

// ─────────────────────────────────────────────────────────────────────────────
// Preset helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * OrbLegacy preset configuration
 */
export interface OrbLegacyPreset {
  type: "OrbLegacy";
  data: { signal?: string };
}

/**
 * Preset types for simplified session creation
 */
export type Preset = OrbLegacyPreset;

/**
 * Creates an OrbLegacy preset for World ID 3.0 legacy support
 *
 * This preset creates a session compatible with both World ID 4.0 and 3.0 protocols.
 * Use this when you need backward compatibility with older World App versions.
 *
 * @param opts - Optional configuration with signal
 * @returns An OrbLegacy preset
 *
 * @example
 * ```typescript
 * const session = await verify({ app_id, action, rp_context })
 *   .preset(orbLegacy({ signal: 'user-123' }))
 * ```
 */
export function orbLegacy(opts: { signal?: string } = {}): OrbLegacyPreset {
  return { type: "OrbLegacy", data: { signal: opts.signal } };
}

// ─────────────────────────────────────────────────────────────────────────────
// VerifyBuilder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builder for creating verification sessions
 */
class VerifyBuilder {
  private config: VerifyConfig;

  constructor(config: VerifyConfig) {
    this.config = config;
  }

  /**
   * Creates a verification session with the given constraints
   *
   * @param constraints - Constraint tree (CredentialRequest or any/all combinators)
   * @returns A new Session instance
   *
   * @example
   * ```typescript
   * const session = await verify({ app_id, action, rp_context })
   *   .constraints(any(CredentialRequest('orb'), CredentialRequest('face')))
   * ```
   */
  async constraints(constraints: ConstraintNode): Promise<Session> {
    // Ensure WASM is initialized
    await initIDKit();

    // Create WASM RpContext
    const rpContext = new WasmModule.RpContextWasm(
      this.config.rp_context.rp_id,
      this.config.rp_context.nonce,
      BigInt(this.config.rp_context.created_at),
      BigInt(this.config.rp_context.expires_at),
      this.config.rp_context.signature,
    );

    // Create WASM VerifyBuilder and call constraints
    const wasmBuilder = WasmModule.verify(
      this.config.app_id,
      String(this.config.action),
      rpContext,
      this.config.action_description ?? null,
      this.config.bridge_url ?? null,
    );

    const wasmSession = (await wasmBuilder.constraints(
      constraints,
    )) as unknown as WasmModule.Session;

    return new SessionImpl(wasmSession);
  }

  /**
   * Creates a verification session from a preset
   *
   * Presets provide a simplified way to create sessions with predefined
   * credential configurations. The preset is converted to both World ID 4.0
   * constraints and World ID 3.0 legacy fields for backward compatibility.
   *
   * @param preset - A preset object from orbLegacy()
   * @returns A new Session instance
   *
   * @example
   * ```typescript
   * const session = await verify({ app_id, action, rp_context })
   *   .preset(orbLegacy({ signal: 'user-123' }))
   * ```
   */
  async preset(preset: Preset): Promise<Session> {
    // Ensure WASM is initialized
    await initIDKit();

    // Create WASM RpContext
    const rpContext = new WasmModule.RpContextWasm(
      this.config.rp_context.rp_id,
      this.config.rp_context.nonce,
      BigInt(this.config.rp_context.created_at),
      BigInt(this.config.rp_context.expires_at),
      this.config.rp_context.signature,
    );

    // Create WASM VerifyBuilder and call preset
    const wasmBuilder = WasmModule.verify(
      this.config.app_id,
      String(this.config.action),
      rpContext,
      this.config.action_description ?? null,
      this.config.bridge_url ?? null,
    );

    const wasmSession = (await wasmBuilder.preset(
      preset,
    )) as unknown as WasmModule.Session;

    return new SessionImpl(wasmSession);
  }
}

/**
 * Creates a verification builder
 *
 * This is the main entry point for creating World ID verification sessions.
 * Use the builder pattern with constraints to specify which credentials to accept.
 *
 * @param config - Verification configuration
 * @returns A VerifyBuilder instance
 *
 * @example
 * ```typescript
 * import { verify, CredentialRequest, any, initIDKit } from '@worldcoin/idkit-core'
 *
 * // Initialize WASM (only needed once)
 * await initIDKit()
 *
 * // Create request items
 * const orb = CredentialRequest('orb', { signal: 'user-123' })
 * const face = CredentialRequest('face')
 *
 * // Create a verification session with constraints
 * const session = await verify({
 *   app_id: 'app_staging_xxxxx',
 *   action: 'my-action',
 *   rp_context: {
 *     rp_id: 'rp_123456789abcdef0',
 *     nonce: 'unique-nonce',
 *     created_at: Math.floor(Date.now() / 1000),
 *     expires_at: Math.floor(Date.now() / 1000) + 3600,
 *     signature: 'ecdsa-signature-from-backend',
 *   },
 * }).constraints(any(orb, face))
 *
 * // Display QR code
 * console.log('Scan this:', session.connectorURI)
 *
 * // Wait for proof
 * const proof = await session.pollForUpdates()
 * console.log('Success:', proof)
 * ```
 */
export function verify(config: VerifyConfig): VerifyBuilder {
  // Validate required fields
  if (!config.app_id) {
    throw new Error("app_id is required");
  }
  if (!config.action) {
    throw new Error("action is required");
  }
  if (!config.rp_context) {
    throw new Error("rp_context is required");
  }

  return new VerifyBuilder(config);
}

