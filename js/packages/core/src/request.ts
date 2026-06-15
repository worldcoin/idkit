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
import type { NativePayloadResult } from "./lib/wasm";
import { WasmModule, initIDKit } from "./lib/wasm";
import {
  isInWorldApp,
  getWorldAppVerifyVersion,
  createNativeRequest,
  type BuilderConfig,
} from "./transports/native";
import {
  attachDebugReportToError,
  cloneDebugReport,
  createIDKitDebugReport,
  requestModeFromConfig,
  updateDebugReport,
  type IDKitDebugReport,
  type IDKitDebugRequestMode,
  type IDKitDebugTransportKind,
} from "./lib/debug";

/** Options for pollUntilCompletion() */
export interface WaitOptions {
  /** Milliseconds between polls (default: 1000) */
  pollInterval?: number;
  /** Total timeout in milliseconds (default: 900000 = 15 minutes) */
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

const SESSION_ID_PATTERN = /^session_[0-9a-fA-F]{128}$/;

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
  /** Debug report for this request when debug mode is enabled. May include sensitive data. */
  getDebugReport(): IDKitDebugReport | undefined;
}

/**
 * Shared poll loop. Used by both URL-mode and invite-code-mode request impls;
 * the loop body is identical between the two paths because the bridge
 * `Status` shape is mode-agnostic.
 */
async function pollUntilCompletionLoop(
  pollOnce: () => Promise<Status>,
  options?: WaitOptions,
): Promise<IDKitCompletionResult> {
  const pollInterval = options?.pollInterval ?? 1000;
  const timeout = options?.timeout ?? 900_000; // 15 minutes default
  const startTime = Date.now();

  while (true) {
    if (options?.signal?.aborted) {
      return { success: false, error: IDKitErrorCodes.Cancelled };
    }

    if (Date.now() - startTime > timeout) {
      return { success: false, error: IDKitErrorCodes.Timeout };
    }

    const status = await pollOnce();

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

function getWasmDebugPayload(wasmRequest: unknown): unknown {
  const candidate = wasmRequest as { debugPayload?: () => unknown };
  if (typeof candidate.debugPayload !== "function") {
    return undefined;
  }

  try {
    return candidate.debugPayload();
  } catch {
    return undefined;
  }
}

function getErrorDebugPayload(error: unknown): unknown {
  if (
    (typeof error !== "object" && typeof error !== "function") ||
    error === null
  ) {
    return undefined;
  }

  return (error as { debugPayload?: unknown }).debugPayload;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function updateDebugReportFromStatus(
  report: IDKitDebugReport | undefined,
  status: Status,
): void {
  if (status.type === "confirmed") {
    updateDebugReport(report, {
      status: "success",
      responseReceivedAt: new Date().toISOString(),
    });
    return;
  }

  if (status.type === "failed") {
    updateDebugReport(report, {
      status: "error",
      responseReceivedAt: new Date().toISOString(),
      errorCode: status.error,
    });
    return;
  }

  updateDebugReport(report, {
    status: status.type,
  });
}

function attachBridgeCreationDebugReport(
  error: unknown,
  config: BuilderConfig,
  mode: IDKitDebugRequestMode,
  transportKind: IDKitDebugTransportKind,
): never {
  const report = createIDKitDebugReport({
    mode,
    transportKind,
    config,
    payload: getErrorDebugPayload(error),
  });
  updateDebugReport(report, {
    status: "error",
    errorMessage: getErrorMessage(error),
  });
  throw attachDebugReportToError(error, report);
}

/**
 * Internal request implementation (bridge/WASM path)
 */
class IDKitRequestImpl implements IDKitRequest {
  private wasmRequest: WasmModule.IDKitRequest;
  private _connectorURI: string;
  private _requestId: string;
  private debugReport?: IDKitDebugReport;

  constructor(
    wasmRequest: WasmModule.IDKitRequest,
    config: BuilderConfig,
    mode: IDKitDebugRequestMode,
    transportKind: IDKitDebugTransportKind,
  ) {
    this.wasmRequest = wasmRequest;
    this._connectorURI = wasmRequest.connectUrl();
    this._requestId = wasmRequest.requestId();
    this.debugReport = createIDKitDebugReport({
      mode,
      transportKind,
      config,
      payload: getWasmDebugPayload(wasmRequest),
      requestId: this._requestId,
      connectorURI: this._connectorURI,
    });
    updateDebugReport(this.debugReport, {
      status: "sent",
      sentToTransportAt: new Date().toISOString(),
    });
  }

  get connectorURI(): string {
    return this._connectorURI;
  }

  get requestId(): string {
    return this._requestId;
  }

  async pollOnce(): Promise<Status> {
    try {
      const status = (await this.wasmRequest.pollForStatus()) as Status;
      updateDebugReportFromStatus(this.debugReport, status);
      return status;
    } catch (error) {
      updateDebugReport(this.debugReport, {
        status: "error",
        errorMessage: getErrorMessage(error),
      });
      throw attachDebugReportToError(error, this.debugReport);
    }
  }

  pollUntilCompletion(options?: WaitOptions): Promise<IDKitCompletionResult> {
    return pollUntilCompletionLoop(() => this.pollOnce(), options);
  }

  getDebugReport(): IDKitDebugReport | undefined {
    return cloneDebugReport(this.debugReport);
  }
}

/**
 * An invite-code mode World ID verification request (WDP-73).
 *
 * Sibling shape to {@link IDKitRequest}, but discovery happens through a
 * URL pointing at the `world.org/verify` landing page (which displays the
 * code for the user to type into World App). The polling lifecycle is
 * byte-identical to URL mode — same `Status`, same `IDKitCompletionResult` —
 * so adopters write the same poll loop.
 */
export interface IDKitInviteCodeRequest {
  /** URL to display to the user. Same shape as URL/QR mode's `connectorURI` with `&c=<code>&a=<app_id>` appended. */
  readonly connectorURI: string;
  /** Unix-seconds expiry of the unredeemed code. After this point bridge will reject the redeem. */
  readonly expiresAt: number;
  /** Unique request ID for this verification */
  readonly requestId: string;
  /** Poll once for current status (for manual polling) */
  pollOnce(): Promise<Status>;
  /** Poll continuously until completion or timeout */
  pollUntilCompletion(options?: WaitOptions): Promise<IDKitCompletionResult>;
  /** Debug report for this request when debug mode is enabled. May include sensitive data. */
  getDebugReport(): IDKitDebugReport | undefined;
}

/**
 * Internal invite-code request implementation (bridge/WASM only — code mode
 * has no in-app native postMessage path by design; the user is on a different
 * device than World App).
 */
class IDKitInviteCodeRequestImpl implements IDKitInviteCodeRequest {
  private wasmRequest: WasmModule.IDKitInviteCodeRequest;
  private _connectorURI: string;
  private _expiresAt: number;
  private _requestId: string;
  private debugReport?: IDKitDebugReport;

  constructor(
    wasmRequest: WasmModule.IDKitInviteCodeRequest,
    config: BuilderConfig,
  ) {
    this.wasmRequest = wasmRequest;
    this._connectorURI = wasmRequest.connectUrl();
    this._expiresAt = wasmRequest.expiresAt();
    this._requestId = wasmRequest.requestId();
    this.debugReport = createIDKitDebugReport({
      mode: "invite_code_request",
      transportKind: "invite_code_bridge",
      config,
      payload: getWasmDebugPayload(wasmRequest),
      requestId: this._requestId,
      connectorURI: this._connectorURI,
    });
    updateDebugReport(this.debugReport, {
      status: "sent",
      sentToTransportAt: new Date().toISOString(),
    });
  }

  get connectorURI(): string {
    return this._connectorURI;
  }

  get expiresAt(): number {
    return this._expiresAt;
  }

  get requestId(): string {
    return this._requestId;
  }

  async pollOnce(): Promise<Status> {
    try {
      const status = (await this.wasmRequest.pollForStatus()) as Status;
      updateDebugReportFromStatus(this.debugReport, status);
      return status;
    } catch (error) {
      updateDebugReport(this.debugReport, {
        status: "error",
        errorMessage: getErrorMessage(error),
      });
      throw attachDebugReportToError(error, this.debugReport);
    }
  }

  pollUntilCompletion(options?: WaitOptions): Promise<IDKitCompletionResult> {
    return pollUntilCompletionLoop(() => this.pollOnce(), options);
  }

  getDebugReport(): IDKitDebugReport | undefined {
    return cloneDebugReport(this.debugReport);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CredentialRequest and Constraint helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a CredentialRequest for a credential type
 *
 * @param credential_type - The type of credential to request (e.g., 'proof_of_human', 'selfie')
 * @param options - Optional signal, genesis_issued_at_min, and expires_at_min
 * @returns A CredentialRequest object
 *
 * @example
 * ```typescript
 * const orb = CredentialRequest('proof_of_human', { signal: 'user-123' })
 * const selfie = CredentialRequest('selfie')
 * // Require credential to be valid for at least one year
 * const withExpiry = CredentialRequest('proof_of_human', { expires_at_min: Date.now() / 1000 + 60 * 60 * 60 * 24 * 365 })
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
 * const constraint = any(CredentialRequest('proof_of_human'), CredentialRequest('selfie'))
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
 * const constraint = all(CredentialRequest('proof_of_human'), any(CredentialRequest('passport'), CredentialRequest('mnc')))
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
 *   CredentialRequest('passport'),
 *   CredentialRequest('mnc'),
 * )
 * ```
 */
export function enumerate(...nodes: ConstraintNode[]): {
  enumerate: ConstraintNode[];
} {
  return { enumerate: nodes };
}

// ─────────────────────────────────────────────────────────────────────────────
// Preset helpers - re-export types from WASM, provide JS convenience functions
// ─────────────────────────────────────────────────────────────────────────────

// Re-export preset types from WASM (source of truth in rust/core/src/wasm_bindings.rs)
export type {
  Preset,
  IdentityAttribute,
  DocumentType,
  OrbLegacyPreset,
  SecureDocumentLegacyPreset,
  DocumentLegacyPreset,
  SelfieCheckLegacyPreset,
  DeviceLegacyPreset,
  ProofOfHumanPreset,
  PassportPreset,
  IdentityCheckPreset,
  MncPreset,
} from "./lib/wasm";

// Import WASM preset type for function return types
import type {
  Preset,
  IdentityAttribute,
  OrbLegacyPreset,
  SecureDocumentLegacyPreset,
  DocumentLegacyPreset,
  SelfieCheckLegacyPreset,
  DeviceLegacyPreset,
  ProofOfHumanPreset,
  PassportPreset,
  IdentityCheckPreset,
  MncPreset,
} from "./lib/wasm";

/**
 * Creates an OrbLegacy preset for World ID 3.0 legacy support
 *
 * This preset only returns World ID 3.0 proofs. Use it for compatibility with older IDKit versions.
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
 * This preset only returns World ID 3.0 proofs. Use it for compatibility with older IDKit versions.
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
 * This preset only returns World ID 3.0 proofs. Use it for compatibility with older IDKit versions.
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

/**
 * Creates a DeviceLegacy preset for World ID 3.0 legacy support
 *
 * This preset only returns World ID 3.0 proofs. Use it for compatibility with older IDKit versions.
 *
 * @param opts - Optional configuration with signal
 * @returns A DeviceLegacy preset
 *
 * @example
 * ```typescript
 * const request = await IDKit.request({ app_id, action, rp_context, allow_legacy_proofs: true })
 *   .preset(deviceLegacy({ signal: 'user-123' }))
 * ```
 */
export function deviceLegacy(
  opts: { signal?: string } = {},
): DeviceLegacyPreset {
  return { type: "DeviceLegacy", signal: opts.signal };
}

/**
 * Creates a SelfieCheckLegacy preset for face verification
 *
 * Preview: Selfie Check is currently in preview.
 * Contact us if you need it enabled.
 *
 * This preset only returns World ID 3.0 proofs. Use it for compatibility with older IDKit versions.
 *
 * @param opts - Optional configuration with signal
 * @returns A SelfieCheckLegacy preset
 *
 * @example
 * ```typescript
 * const request = await IDKit.request({ app_id, action, rp_context, allow_legacy_proofs: true })
 *   .preset(selfieCheckLegacy({ signal: 'user-123' }))
 * ```
 */
export function selfieCheckLegacy(
  opts: { signal?: string } = {},
): SelfieCheckLegacyPreset {
  return { type: "SelfieCheckLegacy", signal: opts.signal };
}

/**
 * Creates a ProofOfHuman preset for World ID 4.0 with legacy Orb fallback
 *
 * @param opts - Optional configuration with signal
 * @returns A ProofOfHuman preset
 *
 * @example
 * ```typescript
 * const request = await IDKit.request({ app_id, action, rp_context, allow_legacy_proofs: true })
 *   .preset(proofOfHuman({ signal: 'user-123' }))
 * ```
 */
export function proofOfHuman(
  opts: { signal?: string } = {},
): ProofOfHumanPreset {
  return { type: "ProofOfHuman", signal: opts.signal };
}

/**
 * Creates a Passport preset for World ID 4.0 with legacy document fallback
 *
 * @param opts - Optional configuration with signal
 * @returns A Passport preset
 *
 * @example
 * ```typescript
 * const request = await IDKit.request({ app_id, action, rp_context, allow_legacy_proofs: false })
 *   .preset(passport({ signal: 'user-123' }))
 * ```
 */
export function passport(opts: { signal?: string } = {}): PassportPreset {
  return { type: "Passport", signal: opts.signal };
}

/**
 * Creates an Mnc preset for World ID 4.0 with legacy document fallback
 *
 * @param opts - Optional configuration with signal
 * @returns An Mnc preset
 *
 * @example
 * ```typescript
 * const request = await IDKit.request({ app_id, action, rp_context, allow_legacy_proofs: false })
 *   .preset(mnc({ signal: 'user-123' }))
 * ```
 */
export function mnc(opts: { signal?: string } = {}): MncPreset {
  return { type: "Mnc", signal: opts.signal };
}

/**
 * Creates an IdentityCheck preset for document-based identity attestation.
 *
 * This preset requires World ID 4.0-compatible clients.
 *
 * @param params - Identity attribute filters and proof-of-humanity requirement
 * @returns An IdentityCheck preset
 */
export function identityCheck(params: {
  attributes: IdentityAttribute[];
  legacy_signal?: string;
}): IdentityCheckPreset {
  return {
    type: "IdentityCheck",
    attributes: params.attributes,
    ...(params.legacy_signal !== undefined && {
      legacy_signal: params.legacy_signal,
    }),
  };
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
      config.require_user_presence ?? false,
      config.override_connect_base_url ?? null,
      config.return_to ?? null,
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
      config.require_user_presence ?? false,
      config.override_connect_base_url ?? null,
      config.return_to ?? null,
      config.environment ?? null,
    );
  }

  // type === "session"
  return WasmModule.createSession(
    config.app_id,
    rpContext,
    config.action_description ?? null,
    config.bridge_url ?? null,
    config.require_user_presence ?? false,
    config.override_connect_base_url ?? null,
    config.return_to ?? null,
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
   *   .constraints(any(CredentialRequest('proof_of_human'), CredentialRequest('selfie')));
   * ```
   */
  async constraints(constraints: ConstraintNode): Promise<IDKitRequest> {
    await initIDKit();

    if (isInWorldApp()) {
      const verifyVersion = getWorldAppVerifyVersion();

      if (verifyVersion < 2) {
        // Constraints require v2 — they can't be represented as v1 payloads.
        throw new Error(
          "verify v2 is not supported by this World App version. " +
            "Use a legacy preset (e.g. orbLegacy()) or update the World App.",
        );
      }

      const wasmBuilder = createWasmBuilderFromConfig(this.config);
      const wasmResult: NativePayloadResult =
        wasmBuilder.nativePayload(constraints);
      return createNativeRequest(
        wasmResult.payload,
        this.config,
        wasmResult.signal_hashes ?? {},
        wasmResult.legacy_signal_hash,
        2,
      );
    }

    // Bridge path — WASM
    const wasmBuilder = createWasmBuilderFromConfig(this.config);
    try {
      const wasmRequest = (await wasmBuilder.constraints(
        constraints,
      )) as unknown as WasmModule.IDKitRequest;
      return new IDKitRequestImpl(
        wasmRequest,
        this.config,
        requestModeFromConfig(this.config),
        "bridge",
      );
    } catch (error) {
      attachBridgeCreationDebugReport(
        error,
        this.config,
        requestModeFromConfig(this.config),
        "bridge",
      );
    }
  }

  /**
   * Creates an IDKit request from a preset (works for all request types)
   *
   * Presets provide a simplified way to create requests with predefined
   * credential configurations.
   *
   * @param preset - A preset object from orbLegacy(), secureDocumentLegacy(), documentLegacy(), selfieCheckLegacy(), deviceLegacy(), proofOfHuman(), or passport()
   * @returns A new IDKitRequest instance
   *
   * @example
   * ```typescript
   * const request = await IDKit.request({ app_id, action, rp_context, allow_legacy_proofs: true })
   *   .preset(orbLegacy({ signal: 'user-123' }));
   * ```
   */
  async preset(preset: Preset): Promise<IDKitRequest> {
    if (
      this.config.type === "createSession" ||
      this.config.type === "proveSession"
    ) {
      throw new Error(
        "Presets are not supported for session flows. Use .constraints() instead.",
      );
    }

    await initIDKit();

    if (isInWorldApp()) {
      const verifyVersion = getWorldAppVerifyVersion();

      if (verifyVersion === 2) {
        const wasmBuilder = createWasmBuilderFromConfig(this.config);
        const wasmResult: NativePayloadResult =
          wasmBuilder.nativePayloadFromPreset(preset);
        return createNativeRequest(
          wasmResult.payload,
          this.config,
          wasmResult.signal_hashes ?? {},
          wasmResult.legacy_signal_hash,
          2,
        );
      }

      // v1 — presets always have valid legacy fields, so this should succeed
      try {
        const wasmBuilder = createWasmBuilderFromConfig(this.config);
        const wasmResult: NativePayloadResult =
          wasmBuilder.nativePayloadV1FromPreset(preset);
        return createNativeRequest(
          wasmResult.payload,
          this.config,
          wasmResult.signal_hashes ?? {},
          wasmResult.legacy_signal_hash,
          1,
        );
      } catch (err) {
        // Only wrap v1-incompatibility errors (from Deprecated verification level).
        // Let other errors (bad rp_context, invalid preset, etc.) propagate as-is.
        if (
          err instanceof Error &&
          String(err.message).includes("v1 payload")
        ) {
          throw new Error(
            "verify v2 is not supported by this World App version. " +
              "Use a legacy preset (e.g. orbLegacy()) or update the World App.",
          );
        }
        throw err;
      }
    }

    // Bridge path — WASM
    const wasmBuilder = createWasmBuilderFromConfig(this.config);
    try {
      const wasmRequest = (await wasmBuilder.preset(
        preset,
      )) as unknown as WasmModule.IDKitRequest;
      return new IDKitRequestImpl(
        wasmRequest,
        this.config,
        requestModeFromConfig(this.config),
        "bridge",
      );
    } catch (error) {
      attachBridgeCreationDebugReport(
        error,
        this.config,
        requestModeFromConfig(this.config),
        "bridge",
      );
    }
  }
}

/**
 * Builder for invite-code mode requests (WDP-73).
 *
 * Code mode is bridge-only by definition: the user is on a different device
 * than World App (e.g. desktop browser ↔ phone), so there's no in-app native
 * postMessage path to branch on. This builder skips the `isInWorldApp()`
 * check that {@link IDKitBuilder} performs.
 */
class IDKitInviteCodeBuilder {
  private config: BuilderConfig;

  constructor(config: BuilderConfig) {
    this.config = config;
  }

  /**
   * Creates an invite-code mode IDKit request with the given constraints.
   *
   * @param constraints - Constraint tree (CredentialRequest or any/all/enumerate combinators)
   * @returns A new IDKitInviteCodeRequest instance
   *
   * @example
   * ```typescript
   * const request = await IDKit.requestWithInviteCode({ app_id, action, rp_context, allow_legacy_proofs: false })
   *   .constraints(any(CredentialRequest('proof_of_human'), CredentialRequest('selfie')));
   * displayLink(request.connectorURI);
   * ```
   */
  async constraints(
    constraints: ConstraintNode,
  ): Promise<IDKitInviteCodeRequest> {
    await initIDKit();

    const wasmBuilder = createWasmBuilderFromConfig(this.config);
    try {
      const wasmRequest = (await wasmBuilder.constraintsWithInviteCode(
        constraints,
      )) as unknown as WasmModule.IDKitInviteCodeRequest;
      return new IDKitInviteCodeRequestImpl(wasmRequest, this.config);
    } catch (error) {
      attachBridgeCreationDebugReport(
        error,
        this.config,
        "invite_code_request",
        "invite_code_bridge",
      );
    }
  }

  /**
   * Creates an invite-code mode IDKit request from a preset.
   *
   * @param preset - A preset object from orbLegacy(), secureDocumentLegacy(), documentLegacy(), selfieCheckLegacy(), deviceLegacy(), proofOfHuman(), or passport()
   * @returns A new IDKitInviteCodeRequest instance
   */
  async preset(preset: Preset): Promise<IDKitInviteCodeRequest> {
    if (
      this.config.type === "createSession" ||
      this.config.type === "proveSession"
    ) {
      throw new Error(
        "Presets are not supported for session flows. Use .constraints() instead.",
      );
    }

    await initIDKit();

    const wasmBuilder = createWasmBuilderFromConfig(this.config);
    try {
      const wasmRequest = (await wasmBuilder.presetWithInviteCode(
        preset,
      )) as unknown as WasmModule.IDKitInviteCodeRequest;
      return new IDKitInviteCodeRequestImpl(wasmRequest, this.config);
    } catch (error) {
      attachBridgeCreationDebugReport(
        error,
        this.config,
        "invite_code_request",
        "invite_code_bridge",
      );
    }
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
 * }).constraints(enumerate(CredentialRequest('proof_of_human'), CredentialRequest('selfie')));
 *
 * // In World App: connectorURI is empty, result comes via postMessage
 * // On web: connectorURI is the QR URL to display
 * console.log(request.connectorURI);
 *
 * // Wait for result — same interface in both environments
 * const proof = await request.pollUntilCompletion();
 * ```
 */
export function createRequest(config: IDKitRequestConfig): IDKitBuilder {
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
    return_to: config.return_to,
    allow_legacy_proofs: config.allow_legacy_proofs,
    require_user_presence: config.require_user_presence ?? false,
    override_connect_base_url: config.override_connect_base_url,
    environment: config.environment,
  });
}

/**
 * Creates an invite-code mode IDKit request builder (WDP-73).
 *
 * Sibling entry point to {@link createRequest}. Validates the same required
 * fields, returns a {@link IDKitInviteCodeBuilder} whose `.constraints()` /
 * `.preset()` methods produce {@link IDKitInviteCodeRequest} handles.
 *
 * @example
 * ```typescript
 * const request = await IDKit.requestWithInviteCode({
 *   app_id: 'app_staging_xxxxx',
 *   action: 'my-action',
 *   rp_context: { ... },
 *   allow_legacy_proofs: false,
 * }).constraints(any(CredentialRequest('proof_of_human'), CredentialRequest('selfie')));
 *
 * displayLink(request.connectorURI);          // user opens this URL on their phone
 * const proof = await request.pollUntilCompletion();
 * ```
 */
function createRequestWithInviteCode(
  config: IDKitRequestConfig,
): IDKitInviteCodeBuilder {
  // Validate required fields — mirror createRequest exactly so integrators
  // don't get different validation between the two paths.
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

  return new IDKitInviteCodeBuilder({
    type: "request",
    app_id: config.app_id,
    action: String(config.action),
    rp_context: config.rp_context,
    action_description: config.action_description,
    bridge_url: config.bridge_url,
    return_to: config.return_to,
    allow_legacy_proofs: config.allow_legacy_proofs,
    require_user_presence: config.require_user_presence ?? false,
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
 * }).constraints(any(CredentialRequest('proof_of_human'), CredentialRequest('selfie')));
 *
 * // Display QR, wait for proof
 * const result = await request.pollUntilCompletion();
 * // result.session_id -> save this for future sessions
 * // result.responses[0].session_nullifier -> for session tracking
 * ```
 */
export function createSession(config: IDKitSessionConfig): IDKitBuilder {
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
    type: "createSession",
    app_id: config.app_id,
    rp_context: config.rp_context,
    action_description: config.action_description,
    bridge_url: config.bridge_url,
    return_to: config.return_to,
    require_user_presence: config.require_user_presence ?? false,
    override_connect_base_url: config.override_connect_base_url,
    environment: config.environment,
  });
}

/**
 * Creates a builder for proving an existing session (no action, has session_id)
 *
 * Use this when a returning user needs to prove they own an existing session.
 * The `sessionId` should be the opaque `session_<hex>` value previously returned
 * from `createSession()`.
 *
 * @param sessionId - The protocol session ID from a previous session creation
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
 * }).constraints(any(CredentialRequest('proof_of_human'), CredentialRequest('selfie')));
 *
 * const result = await request.pollUntilCompletion();
 * // result.session_id -> same session
 * // result.responses[0].session_nullifier -> should match for same user
 * ```
 */
export function proveSession(
  sessionId: `session_${string}`,
  config: IDKitSessionConfig,
): IDKitBuilder {
  // Validate required fields
  if (!sessionId) {
    throw new Error("session_id is required");
  }
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error(
      "session_id must be in the format session_<128 hex characters>",
    );
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
    return_to: config.return_to,
    require_user_presence: config.require_user_presence ?? false,
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
  /** Create a new invite-code mode verification request (WDP-73) */
  requestWithInviteCode: createRequestWithInviteCode,
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
  /** Create a DeviceLegacy preset for World ID 3.0 legacy support */
  deviceLegacy,
  /** Create a SelfieCheckLegacy preset for face verification */
  selfieCheckLegacy,
  /** Create a ProofOfHuman preset for World ID 4.0 with legacy Orb fallback */
  proofOfHuman,
  /** Create a Passport preset for World ID 4.0 with legacy document fallback */
  passport,
  /** Create an Mnc preset for World ID 4.0 with legacy document fallback */
  mnc,
  /** Create an IdentityCheck preset for World ID 4.0 identity attestation */
  identityCheck,
};
