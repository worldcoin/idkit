/**
 * IDKit Request
 * Pure functional API for World ID verification - no dependencies
 */

import type {
  IDKitRequestConfig,
  IDKitSessionConfig,
  RpContext,
} from "./types/config";
import type {
  IDKitResult,
  ConstraintNode,
  CredentialType,
  CredentialRequestType,
} from "./types/result";
import { AppErrorCodes } from "./types/bridge";
import { WasmModule, initIDKit, initIDKitServer } from "./lib/wasm";

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
  result?: IDKitResult;
  error?: AppErrorCodes;
}

// Re-export RpContext for convenience
export type { RpContext };

/**
 * A World ID verification request
 *
 * Provides a clean, promise-based API for World ID verification flows.
 * Each request represents a single verification attempt.
 */
export interface IDKitRequest {
  /** QR code URL for World App - display this as a QR code for users to scan */
  readonly connectorURI: string;
  /** Unique request ID for this verification */
  readonly requestId: string;
  /** Poll once for current status (for manual polling) */
  pollOnce(): Promise<Status>;
  /** Poll continuously until completion or timeout */
  pollForUpdates(options?: WaitOptions): Promise<IDKitResult>;
}

/**
 * Internal request implementation
 */
class IDKitRequestImpl implements IDKitRequest {
  private wasmRequest: WasmModule.IDKitRequest;
  private _connectorURI: string;
  private _requestId: string;

  constructor(wasmRequest: WasmModule.IDKitRequest) {
    this.wasmRequest = wasmRequest;
    this._connectorURI = wasmRequest.connectUrl();
    this._requestId = wasmRequest.requestId();
  }

  get connectorURI(): string {
    return this._connectorURI;
  }

  get requestId(): string {
    return this._requestId;
  }

  async pollOnce(): Promise<Status> {
    return (await this.wasmRequest.pollForStatus()) as Status;
  }

  async pollForUpdates(options?: WaitOptions): Promise<IDKitResult> {
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

      if (status.type === "confirmed" && status.result) {
        return status.result;
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
// Preset helpers - re-export types from WASM, provide JS convenience functions
// ─────────────────────────────────────────────────────────────────────────────

// Re-export preset types from WASM (source of truth in rust/core/src/wasm_bindings.rs)
export type {
  Preset,
  OrbLegacyPreset,
  SecureDocumentLegacyPreset,
  DocumentLegacyPreset,
} from "./lib/wasm";

// Import WASM preset type for function return types
import type {
  Preset,
  OrbLegacyPreset,
  SecureDocumentLegacyPreset,
  DocumentLegacyPreset,
} from "./lib/wasm";

/**
 * Creates an OrbLegacy preset for World ID 3.0 legacy support
 *
 * This preset creates an IDKit request compatible with both World ID 4.0 and 3.0 protocols.
 * Use this when you need backward compatibility with older World App versions.
 *
 * @param opts - Optional configuration with signal
 * @returns An OrbLegacy preset
 *
 * @example
 * ```typescript
 * const request = await IDKit.request({ app_id, action, rp_context })
 *   .preset(orbLegacy({ signal: 'user-123' }))
 * ```
 */
export function orbLegacy(opts: { signal?: string } = {}): OrbLegacyPreset {
  return { type: "OrbLegacy", signal: opts.signal };
}

/**
 * Creates a SecureDocumentLegacy preset for World ID 3.0 legacy support
 *
 * This preset creates an IDKit request compatible with both World ID 4.0 and 3.0 protocols.
 * Use this when you need backward compatibility with older World App versions.
 *
 * @param opts - Optional configuration with signal
 * @returns A SecureDocumentLegacy preset
 *
 * @example
 * ```typescript
 * const request = await IDKit.request({ app_id, action, rp_context })
 *   .preset(secureDocumentLegacy({ signal: 'user-123' }))
 * ```
 */
export function secureDocumentLegacy(
  opts: { signal?: string } = {},
): SecureDocumentLegacyPreset {
  return { type: "SecureDocumentLegacy", signal: opts.signal };
}

/**
 * Creates a DocumentLegacy preset for World ID 3.0 legacy support
 *
 * This preset creates an IDKit request compatible with both World ID 4.0 and 3.0 protocols.
 * Use this when you need backward compatibility with older World App versions.
 *
 * @param opts - Optional configuration with signal
 * @returns A DocumentLegacy preset
 *
 * @example
 * ```typescript
 * const request = await IDKit.request({ app_id, action, rp_context })
 *   .preset(documentLegacy({ signal: 'user-123' }))
 * ```
 */
export function documentLegacy(
  opts: { signal?: string } = {},
): DocumentLegacyPreset {
  return { type: "DocumentLegacy", signal: opts.signal };
}

// ─────────────────────────────────────────────────────────────────────────────
// IDKitBuilder (Merged builder for all request types)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Merged builder for IDKit requests
 */
class IDKitBuilder {
  private wasmBuilder: WasmModule.IDKitBuilder;

  private constructor(wasmBuilder: WasmModule.IDKitBuilder) {
    this.wasmBuilder = wasmBuilder;
  }

  /** Create builder for request (internal) */
  static async forRequest(config: IDKitRequestConfig): Promise<IDKitBuilder> {
    await initIDKit();
    const rpContext = new WasmModule.RpContextWasm(
      config.rp_context.rp_id,
      config.rp_context.nonce,
      BigInt(config.rp_context.created_at),
      BigInt(config.rp_context.expires_at),
      config.rp_context.signature,
    );
    const wasmBuilder = WasmModule.request(
      config.app_id,
      String(config.action),
      rpContext,
      config.action_description ?? null,
      config.bridge_url ?? null,
      config.allow_legacy_proofs,
    );
    return new IDKitBuilder(wasmBuilder);
  }

  /** Create builder for new session (internal) */
  static async forCreateSession(
    config: IDKitSessionConfig,
  ): Promise<IDKitBuilder> {
    await initIDKit();
    const rpContext = new WasmModule.RpContextWasm(
      config.rp_context.rp_id,
      config.rp_context.nonce,
      BigInt(config.rp_context.created_at),
      BigInt(config.rp_context.expires_at),
      config.rp_context.signature,
    );
    const wasmBuilder = WasmModule.createSession(
      config.app_id,
      rpContext,
      config.action_description ?? null,
      config.bridge_url ?? null,
    );
    return new IDKitBuilder(wasmBuilder);
  }

  /** Create builder for proving session (internal) */
  static async forProveSession(
    sessionId: string,
    config: IDKitSessionConfig,
  ): Promise<IDKitBuilder> {
    await initIDKit();
    const rpContext = new WasmModule.RpContextWasm(
      config.rp_context.rp_id,
      config.rp_context.nonce,
      BigInt(config.rp_context.created_at),
      BigInt(config.rp_context.expires_at),
      config.rp_context.signature,
    );
    const wasmBuilder = WasmModule.proveSession(
      sessionId,
      config.app_id,
      rpContext,
      config.action_description ?? null,
      config.bridge_url ?? null,
    );
    return new IDKitBuilder(wasmBuilder);
  }

  /**
   * Creates an IDKit request with the given constraints
   *
   * @param constraints - Constraint tree (CredentialRequest or any/all combinators)
   * @returns A new IDKitRequest instance
   *
   * @example
   * ```typescript
   * const builder = await IDKit.request({ app_id, action, rp_context });
   * const request = await builder.constraints(any(CredentialRequest('orb'), CredentialRequest('face')));
   * ```
   */
  async constraints(constraints: ConstraintNode): Promise<IDKitRequest> {
    const wasmRequest = (await this.wasmBuilder.constraints(
      constraints,
    )) as unknown as WasmModule.IDKitRequest;
    return new IDKitRequestImpl(wasmRequest);
  }

  /**
   * Creates an IDKit request from a preset (works for all request types)
   *
   * Presets provide a simplified way to create requests with predefined
   * credential configurations.
   *
   * @param preset - A preset object from orbLegacy()
   * @returns A new IDKitRequest instance
   *
   * @example
   * ```typescript
   * const builder = await IDKit.request({ app_id, action, rp_context });
   * const request = await builder.preset(orbLegacy({ signal: 'user-123' }));
   * ```
   */
  async preset(preset: Preset): Promise<IDKitRequest> {
    const wasmRequest = (await this.wasmBuilder.preset(
      preset,
    )) as unknown as WasmModule.IDKitRequest;
    return new IDKitRequestImpl(wasmRequest);
  }
}

/**
 * Creates an IDKit request builder
 *
 * This is the main entry point for creating World ID verification requests.
 * Use the builder pattern with constraints to specify which credentials to accept.
 *
 * Note: This function is now async and returns a Promise<IDKitBuilder>.
 *
 * @param config - Request configuration
 * @returns Promise<IDKitBuilder> - A builder instance
 *
 * @example
 * ```typescript
 * import { IDKit, CredentialRequest, any } from '@worldcoin/idkit-core'
 *
 * // Initialize WASM (only needed once)
 * await IDKit.init()
 *
 * // Create request items
 * const orb = CredentialRequest('orb', { signal: 'user-123' })
 * const face = CredentialRequest('face')
 *
 * // Create a verification request with constraints
 * const builder = await IDKit.request({
 *   app_id: 'app_staging_xxxxx',
 *   action: 'my-action',
 *   rp_context: {
 *     rp_id: 'rp_123456789abcdef0',
 *     nonce: 'unique-nonce',
 *     created_at: Math.floor(Date.now() / 1000),
 *     expires_at: Math.floor(Date.now() / 1000) + 3600,
 *     signature: 'ecdsa-signature-from-backend',
 *   },
 *   allow_legacy_proofs: false,
 * });
 * const request = await builder.constraints(any(orb, face));
 *
 * // Display QR code
 * console.log('Scan this:', request.connectorURI)
 *
 * // Wait for proof
 * const proof = await request.pollForUpdates()
 * console.log('Success:', proof)
 * ```
 */
async function createRequest(
  config: IDKitRequestConfig,
): Promise<IDKitBuilder> {
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
  if (typeof config.allow_legacy_proofs !== "boolean") {
    throw new Error(
      "allow_legacy_proofs is required. Set to true to accept v3 proofs during migration, " +
        "or false to only accept v4 proofs.",
    );
  }

  return IDKitBuilder.forRequest(config);
}

/**
 * Creates a new session builder (no action, no existing session_id)
 *
 * Use this when creating a new session for a user who doesn't have one yet.
 * The response will include a `session_id` that should be saved for future
 * session proofs with `proveSession()`.
 *
 * Note: This function is now async and returns a Promise<IDKitBuilder>.
 *
 * @param config - Session configuration (no action field)
 * @returns Promise<IDKitBuilder> - A builder instance
 *
 * @example
 * ```typescript
 * import { IDKit, CredentialRequest, any } from '@worldcoin/idkit-core'
 *
 * // Create a new session (user doesn't have session_id yet)
 * const builder = await IDKit.createSession({
 *   app_id: 'app_staging_xxxxx',
 *   rp_context: { ... },
 * });
 * const request = await builder.constraints(any(CredentialRequest('orb'), CredentialRequest('face')));
 *
 * // Display QR, wait for proof
 * const result = await request.pollForUpdates();
 * // result.session_id -> save this for future sessions
 * // result.responses[0].session_nullifier -> for session tracking
 * ```
 */
async function createSession(
  config: IDKitSessionConfig,
): Promise<IDKitBuilder> {
  // Validate required fields
  if (!config.app_id) {
    throw new Error("app_id is required");
  }
  if (!config.rp_context) {
    throw new Error("rp_context is required");
  }
  // Sessions are always v4 - no legacy proof validation needed

  return IDKitBuilder.forCreateSession(config);
}

/**
 * Creates a builder for proving an existing session (no action, has session_id)
 *
 * Use this when a returning user needs to prove they own an existing session.
 * The `sessionId` should be a value previously returned from `createSession()`.
 *
 * Note: This function is now async and returns a Promise<IDKitBuilder>.
 *
 * @param sessionId - The session ID from a previous session creation
 * @param config - Session configuration (no action field)
 * @returns Promise<IDKitBuilder> - A builder instance
 *
 * @example
 * ```typescript
 * import { IDKit, CredentialRequest, any } from '@worldcoin/idkit-core'
 *
 * // Prove an existing session (user returns)
 * const builder = await IDKit.proveSession(savedSessionId, {
 *   app_id: 'app_staging_xxxxx',
 *   rp_context: { ... },
 * });
 * const request = await builder.constraints(any(CredentialRequest('orb'), CredentialRequest('face')));
 *
 * const result = await request.pollForUpdates();
 * // result.session_id -> same session
 * // result.responses[0].session_nullifier -> should match for same user
 * ```
 */
async function proveSession(
  sessionId: string,
  config: IDKitSessionConfig,
): Promise<IDKitBuilder> {
  // Validate required fields
  if (!sessionId) {
    throw new Error("session_id is required");
  }
  if (!config.app_id) {
    throw new Error("app_id is required");
  }
  if (!config.rp_context) {
    throw new Error("rp_context is required");
  }
  // Sessions are always v4 - no legacy proof validation needed

  return IDKitBuilder.forProveSession(sessionId, config);
}

/**
 * IDKit namespace providing the main API entry points
 *
 * @example
 * ```typescript
 * import { IDKit, CredentialRequest, any } from '@worldcoin/idkit-core'
 *
 * // Initialize (only needed once)
 * await IDKit.init()
 *
 * // Create a request
 * const request = await IDKit.request({
 *   app_id: 'app_staging_xxxxx',
 *   action: 'my-action',
 *   rp_context: { ... },
 * }).constraints(any(CredentialRequest('orb'), CredentialRequest('face')))
 *
 * // Display QR and wait for proof
 * console.log(request.connectorURI)
 * const proof = await request.pollForUpdates()
 * ```
 */
export const IDKit = {
  /** Initialize WASM for browser environments */
  init: initIDKit,
  /** Initialize WASM for Node.js/server environments */
  initServer: initIDKitServer,
  /** Create a new verification request */
  request: createRequest,
  /** Create a new session (no action, no existing session_id) */
  createSession,
  /** Prove an existing session (no action, has session_id) */
  proveSession,
  /** Create a CredentialRequest for a credential type */
  CredentialRequest,
  /** Create an OR constraint - at least one child must be satisfied */
  any,
  /** Create an AND constraint - all children must be satisfied */
  all,
  /** Create an OrbLegacy preset for World ID 3.0 legacy support */
  orbLegacy,
  /** Create a SecureDocumentLegacy preset for World ID 3.0 legacy support */
  secureDocumentLegacy,
  /** Create a DocumentLegacy preset for World ID 3.0 legacy support */
  documentLegacy,
};
