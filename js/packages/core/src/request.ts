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
import { IDKitErrorCodes } from "./types/result";
import { WasmModule, initIDKit } from "./lib/wasm";
import {
  isInWorldApp,
  createNativeRequest,
  type BuilderConfig,
} from "./transports/native";

/** Options for pollUntilCompletion() */
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
  error?: IDKitErrorCodes;
}

/** Result from pollUntilCompletion() — discriminated union, never throws */
export type IDKitCompletionResult =
  | { success: true; result: IDKitResult }
  | { success: false; error: IDKitErrorCodes };

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
  pollUntilCompletion(options?: WaitOptions): Promise<IDKitCompletionResult>;
}

/**
 * Internal request implementation (bridge/WASM path)
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

  async pollUntilCompletion(
    options?: WaitOptions,
  ): Promise<IDKitCompletionResult> {
    const pollInterval = options?.pollInterval ?? 1000;
    const timeout = options?.timeout ?? 300000; // 5 minutes default
    const startTime = Date.now();

    while (true) {
      if (options?.signal?.aborted) {
        return { success: false, error: IDKitErrorCodes.Cancelled };
      }

      if (Date.now() - startTime > timeout) {
        return { success: false, error: IDKitErrorCodes.Timeout };
      }

      const status = await this.pollOnce();

      if (status.type === "confirmed" && status.result) {
        return { success: true, result: status.result };
      }

      if (status.type === "failed") {
        return {
          success: false,
          error:
            (status.error as IDKitErrorCodes) ?? IDKitErrorCodes.GenericError,
        };
      }

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
 * @param options - Optional signal, genesis_issued_at_min, and expires_at_min
 * @returns A CredentialRequest object
 *
 * @example
 * ```typescript
 * const orb = CredentialRequest('orb', { signal: 'user-123' })
 * const face = CredentialRequest('face')
 * // Require credential to be valid for at least one year
 * const withExpiry = CredentialRequest('orb', { expires_at_min: Date.now() / 1000 + 60 * 60 * 60 * 24 * 365 })
 * ```
 */
export function CredentialRequest(
  credential_type: CredentialType,
  options?: {
    signal?: string;
    genesis_issued_at_min?: number;
    expires_at_min?: number;
  },
): CredentialRequestType {
  return {
    type: credential_type,
    signal: options?.signal,
    genesis_issued_at_min: options?.genesis_issued_at_min,
    expires_at_min: options?.expires_at_min,
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

/**
 * Creates an enumerate constraint - all satisfiable children should be selected
 *
 * `enumerate` is satisfied when at least one child is satisfied.
 *
 * @param nodes - Constraint nodes (CredentialRequests or nested constraints)
 * @returns An "enumerate" constraint node
 *
 * @example
 * ```typescript
 * const constraint = enumerate(
 *   CredentialRequest('secure_document'),
 *   CredentialRequest('document'),
 * )
 * ```
 */
export function enumerate(
  ...nodes: ConstraintNode[]
): { enumerate: ConstraintNode[] } {
  return { enumerate: nodes };
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
 * const request = await IDKit.request({ app_id, action, rp_context, allow_legacy_proofs: true })
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
 * const request = await IDKit.request({ app_id, action, rp_context, allow_legacy_proofs: true })
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
 * const request = await IDKit.request({ app_id, action, rp_context, allow_legacy_proofs: true })
 *   .preset(documentLegacy({ signal: 'user-123' }))
 * ```
 */
export function documentLegacy(
  opts: { signal?: string } = {},
): DocumentLegacyPreset {
  return { type: "DocumentLegacy", signal: opts.signal };
}

// ─────────────────────────────────────────────────────────────────────────────
// WASM builder factory (used for both native and bridge paths)
// ─────────────────────────────────────────────────────────────────────────────

function createWasmBuilderFromConfig(
  config: BuilderConfig,
): WasmModule.IDKitBuilder {
  if (!config.rp_context) {
    throw new Error("rp_context is required for WASM bridge transport");
  }

  const rpContext = new WasmModule.RpContextWasm(
    config.rp_context.rp_id,
    config.rp_context.nonce,
    BigInt(config.rp_context.created_at),
    BigInt(config.rp_context.expires_at),
    config.rp_context.signature,
  );

  if (config.type === "request") {
    return WasmModule.request(
      config.app_id,
      String(config.action ?? ""),
      rpContext,
      config.action_description ?? null,
      config.bridge_url ?? null,
      config.allow_legacy_proofs ?? false,
      config.override_connect_base_url ?? null,
      config.environment ?? null,
    );
  }

  if (config.type === "proveSession") {
    return WasmModule.proveSession(
      config.session_id!,
      config.app_id,
      rpContext,
      config.action_description ?? null,
      config.bridge_url ?? null,
      config.override_connect_base_url ?? null,
      config.environment ?? null,
    );
  }

  // type === "session"
  return WasmModule.createSession(
    config.app_id,
    rpContext,
    config.action_description ?? null,
    config.bridge_url ?? null,
    config.override_connect_base_url ?? null,
    config.environment ?? null,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IDKitBuilder (transport-aware: native postMessage vs WASM bridge)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builder for IDKit requests
 *
 * Stores configuration and defers transport selection to `.preset()` / `.constraints()`.
 * In World App: uses native postMessage transport (no WASM needed).
 * On web: uses WASM bridge transport (QR code + polling).
 */
class IDKitBuilder {
  private config: BuilderConfig;

  constructor(config: BuilderConfig) {
    this.config = config;
  }

  /**
   * Creates an IDKit request with the given constraints
   *
   * @param constraints - Constraint tree (CredentialRequest or any/all/enumerate combinators)
   * @returns A new IDKitRequest instance
   *
   * @example
   * ```typescript
   * const request = await IDKit.request({ app_id, action, rp_context, allow_legacy_proofs: false })
   *   .constraints(any(CredentialRequest('orb'), CredentialRequest('face')));
   * ```
   */
  async constraints(constraints: ConstraintNode): Promise<IDKitRequest> {
    await initIDKit();
    const wasmBuilder = createWasmBuilderFromConfig(this.config);

    if (isInWorldApp()) {
      const payload = wasmBuilder.nativePayload(constraints);
      return createNativeRequest(payload, this.config);
    }

    // Bridge path — WASM
    const wasmRequest = (await wasmBuilder.constraints(
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
   * @param preset - A preset object from orbLegacy(), secureDocumentLegacy(), or documentLegacy()
   * @returns A new IDKitRequest instance
   *
   * @example
   * ```typescript
   * const request = await IDKit.request({ app_id, action, rp_context, allow_legacy_proofs: true })
   *   .preset(orbLegacy({ signal: 'user-123' }));
   * ```
   */
  async preset(preset: Preset): Promise<IDKitRequest> {
    await initIDKit();
    const wasmBuilder = createWasmBuilderFromConfig(this.config);

    if (isInWorldApp()) {
      const payload = wasmBuilder.nativePayloadFromPreset(preset);
      return createNativeRequest(payload, this.config);
    }

    // Bridge path — WASM
    const wasmRequest = (await wasmBuilder.preset(
      preset,
    )) as unknown as WasmModule.IDKitRequest;
    return new IDKitRequestImpl(wasmRequest);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry points
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an IDKit verification request builder
 *
 * This is the main entry point for creating World ID verification requests.
 * Use the builder pattern with `.preset()` or `.constraints()` to specify
 * which credentials to accept.
 *
 * @param config - Request configuration
 * @returns IDKitBuilder - A builder instance
 *
 * @example
 * ```typescript
 * import { IDKit, CredentialRequest, any, enumerate, orbLegacy } from '@worldcoin/idkit-core'
 *
 * // With preset (legacy support)
 * const request = await IDKit.request({
 *   app_id: 'app_staging_xxxxx',
 *   action: 'my-action',
 *   rp_context: { ... },
 *   allow_legacy_proofs: true,
 * }).preset(orbLegacy({ signal: 'user-123' }));
 *
 * // With constraints (v4 only)
 * const request = await IDKit.request({
 *   app_id: 'app_staging_xxxxx',
 *   action: 'my-action',
 *   rp_context: { ... },
 *   allow_legacy_proofs: false,
 * }).constraints(enumerate(CredentialRequest('orb'), CredentialRequest('face')));
 *
 * // In World App: connectorURI is empty, result comes via postMessage
 * // On web: connectorURI is the QR URL to display
 * console.log(request.connectorURI);
 *
 * // Wait for result — same interface in both environments
 * const proof = await request.pollUntilCompletion();
 * ```
 */
function createRequest(config: IDKitRequestConfig): IDKitBuilder {
  // Validate required fields
  if (!config.app_id) {
    throw new Error("app_id is required");
  }
  if (!config.action) {
    throw new Error("action is required");
  }
  if (!config.rp_context) {
    throw new Error(
      "rp_context is required. Generate it on your backend using signRequest().",
    );
  }
  if (typeof config.allow_legacy_proofs !== "boolean") {
    throw new Error(
      "allow_legacy_proofs is required. Set to true to accept v3 proofs during migration, " +
        "or false to only accept v4 proofs.",
    );
  }

  return new IDKitBuilder({
    type: "request",
    app_id: config.app_id,
    action: String(config.action),
    rp_context: config.rp_context,
    action_description: config.action_description,
    bridge_url: config.bridge_url,
    allow_legacy_proofs: config.allow_legacy_proofs,
    override_connect_base_url: config.override_connect_base_url,
    environment: config.environment,
  });
}

/**
 * Creates a new session builder (no action, no existing session_id)
 *
 * Use this when creating a new session for a user who doesn't have one yet.
 * The response will include a `session_id` that should be saved for future
 * session proofs with `proveSession()`.
 *
 * @param config - Session configuration (no action field)
 * @returns IDKitBuilder - A builder instance
 *
 * @example
 * ```typescript
 * import { IDKit, CredentialRequest, any } from '@worldcoin/idkit-core'
 *
 * // Create a new session (user doesn't have session_id yet)
 * const request = await IDKit.createSession({
 *   app_id: 'app_staging_xxxxx',
 *   rp_context: { ... },
 * }).constraints(any(CredentialRequest('orb'), CredentialRequest('face')));
 *
 * // Display QR, wait for proof
 * const result = await request.pollUntilCompletion();
 * // result.session_id -> save this for future sessions
 * // result.responses[0].session_nullifier -> for session tracking
 * ```
 */
function createSession(config: IDKitSessionConfig): IDKitBuilder {
  // Validate required fields
  if (!config.app_id) {
    throw new Error("app_id is required");
  }
  if (!config.rp_context) {
    throw new Error(
      "rp_context is required. Generate it on your backend using signRequest().",
    );
  }

  return new IDKitBuilder({
    type: "session",
    app_id: config.app_id,
    rp_context: config.rp_context,
    action_description: config.action_description,
    bridge_url: config.bridge_url,
    override_connect_base_url: config.override_connect_base_url,
    environment: config.environment,
  });
}

/**
 * Creates a builder for proving an existing session (no action, has session_id)
 *
 * Use this when a returning user needs to prove they own an existing session.
 * The `sessionId` should be a value previously returned from `createSession()`.
 *
 * @param sessionId - The session ID from a previous session creation
 * @param config - Session configuration (no action field)
 * @returns IDKitBuilder - A builder instance
 *
 * @example
 * ```typescript
 * import { IDKit, CredentialRequest, any } from '@worldcoin/idkit-core'
 *
 * // Prove an existing session (user returns)
 * const request = await IDKit.proveSession(savedSessionId, {
 *   app_id: 'app_staging_xxxxx',
 *   rp_context: { ... },
 * }).constraints(any(CredentialRequest('orb'), CredentialRequest('face')));
 *
 * const result = await request.pollUntilCompletion();
 * // result.session_id -> same session
 * // result.responses[0].session_nullifier -> should match for same user
 * ```
 */
function proveSession(
  sessionId: string,
  config: IDKitSessionConfig,
): IDKitBuilder {
  // Validate required fields
  if (!sessionId) {
    throw new Error("session_id is required");
  }
  if (!config.app_id) {
    throw new Error("app_id is required");
  }
  if (!config.rp_context) {
    throw new Error(
      "rp_context is required. Generate it on your backend using signRequest().",
    );
  }

  return new IDKitBuilder({
    type: "proveSession",
    session_id: sessionId,
    app_id: config.app_id,
    rp_context: config.rp_context,
    action_description: config.action_description,
    bridge_url: config.bridge_url,
    override_connect_base_url: config.override_connect_base_url,
    environment: config.environment,
  });
}

/**
 * IDKit namespace providing the main API entry points
 *
 * @example
 * ```typescript
 * import { IDKit, CredentialRequest, any, enumerate, orbLegacy } from '@worldcoin/idkit-core'
 *
 * // Create a verification request
 * const request = await IDKit.request({
 *   app_id: 'app_staging_xxxxx',
 *   action: 'my-action',
 *   rp_context: { ... },
 *   allow_legacy_proofs: true,
 * }).preset(orbLegacy({ signal: 'user-123' }))
 *
 * // In World App: result comes via postMessage (no QR needed)
 * // On web: display QR code and wait for proof
 * console.log(request.connectorURI)
 * const proof = await request.pollUntilCompletion()
 * ```
 */
export const IDKit = {
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
  /** Create an enumerate constraint - all satisfiable children should be selected */
  enumerate,
  /** Create an OrbLegacy preset for World ID 3.0 legacy support */
  orbLegacy,
  /** Create a SecureDocumentLegacy preset for World ID 3.0 legacy support */
  secureDocumentLegacy,
  /** Create a DocumentLegacy preset for World ID 3.0 legacy support */
  documentLegacy,
};
