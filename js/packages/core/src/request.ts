/**
 * IDKit Request
 * Pure functional API for World ID verification - no dependencies
 */

import type { IDKitRequestConfig, RpContext } from "./types/config";
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
// IDKitRequestBuilder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builder for creating IDKit requests
 */
class IDKitRequestBuilder {
  private config: IDKitRequestConfig;

  constructor(config: IDKitRequestConfig) {
    this.config = config;
  }

  /**
   * Creates an IDKit request with the given constraints
   *
   * @param constraints - Constraint tree (CredentialRequest or any/all combinators)
   * @returns A new IDKitRequest instance
   *
   * @example
   * ```typescript
   * const request = await IDKit.request({ app_id, action, rp_context })
   *   .constraints(any(CredentialRequest('orb'), CredentialRequest('face')))
   * ```
   */
  async constraints(constraints: ConstraintNode): Promise<IDKitRequest> {
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

    // Create WASM IDKitRequestBuilder and call constraints
    const wasmBuilder = WasmModule.request(
      this.config.app_id,
      String(this.config.action),
      rpContext,
      this.config.action_description ?? null,
      this.config.bridge_url ?? null,
    );

    const wasmRequest = (await wasmBuilder.constraints(
      constraints,
    )) as unknown as WasmModule.IDKitRequest;

    return new IDKitRequestImpl(wasmRequest);
  }

  /**
   * Creates an IDKit request from a preset
   *
   * Presets provide a simplified way to create requests with predefined
   * credential configurations. The preset is converted to both World ID 4.0
   * constraints and World ID 3.0 legacy fields for backward compatibility.
   *
   * @param preset - A preset object from orbLegacy()
   * @returns A new IDKitRequest instance
   *
   * @example
   * ```typescript
   * const request = await IDKit.request({ app_id, action, rp_context })
   *   .preset(orbLegacy({ signal: 'user-123' }))
   * ```
   */
  async preset(preset: Preset): Promise<IDKitRequest> {
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

    // Create WASM IDKitRequestBuilder and call preset
    const wasmBuilder = WasmModule.request(
      this.config.app_id,
      String(this.config.action),
      rpContext,
      this.config.action_description ?? null,
      this.config.bridge_url ?? null,
    );

    const wasmRequest = (await wasmBuilder.preset(
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
 * @param config - Request configuration
 * @returns An IDKitRequestBuilder instance
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
 * const request = await IDKit.request({
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
 * console.log('Scan this:', request.connectorURI)
 *
 * // Wait for proof
 * const proof = await request.pollForUpdates()
 * console.log('Success:', proof)
 * ```
 */
function createRequest(config: IDKitRequestConfig): IDKitRequestBuilder {
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

  return new IDKitRequestBuilder(config);
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
  /** Create a CredentialRequest for a credential type */
  CredentialRequest,
  /** Create an OR constraint - at least one child must be satisfied */
  any,
  /** Create an AND constraint - all children must be satisfied */
  all,
  /** Create an OrbLegacy preset for World ID 3.0 legacy support */
  orbLegacy,
};
