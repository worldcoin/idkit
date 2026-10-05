/**
 * IDKit Request
 * Pure functional API for World ID verification - no dependencies
 */

import packageJson from "../package.json";
import type {
  IDKitRequestConfig,
  IDKitSessionConfig,
  RpContext,
} from "./types/config";
import type {
  IDKitResult,
  IDKitDebugReport,
  ConstraintNode,
  CredentialType,
  CredentialRequestType,
} from "./types/result";
import { IDKitErrorCodes } from "./types/result";
import type { NativePayloadResult } from "./types/protocol";
import { compileRequest } from "./protocol";
import {
  checkRequestOptions,
  type RequestOptions,
} from "./lib/request-options";
export type { RequestOptions } from "./lib/request-options";
import {
  createBridgeRequest,
  isRetryableBridgeError,
  type BridgeRequest,
} from "./transports/bridge";
import { randomRequestId } from "./lib/runtime";
import { type DebugReportWithoutVersion, buildDebugReport } from "./lib/debug";
import {
  isInWorldApp,
  getWorldAppVerifyVersion,
  createNativeRequest,
  type BuilderConfig,
} from "./transports/native";

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
type RustBridgeDebugReport = DebugReportWithoutVersion;

export type IDKitNamespaceOptions = {
  package_name: string;
  package_version: string;
};

const CORE_NAMESPACE_OPTIONS: IDKitNamespaceOptions = {
  package_name: "idkit_js_core",
  package_version: packageJson.version,
};

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
  pollOnce(options?: RequestOptions): Promise<Status>;
  /** Poll continuously until completion or timeout */
  pollUntilCompletion(options?: WaitOptions): Promise<IDKitCompletionResult>;
  /** Debug report for the latest request state. Always available, independent of debug mode. */
  getDebugReport(): IDKitDebugReport;
}

// Bound a pending fetch/body read and forward cancellation to the transport.
async function beforeDeadline<T>(
  operation: (options: RequestOptions) => Promise<T>,
  deadline: number,
  signal?: AbortSignal,
): Promise<T | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() =>
        signal?.aborted || Date.now() >= deadline
          ? null
          : operation({
              signal: controller.signal,
              timeout: Math.max(0, deadline - Date.now()),
            }),
      ),
      new Promise<null>((resolve) => {
        if (Number.isFinite(deadline))
          timer = setTimeout(
            () => {
              resolve(null);
              controller.abort();
            },
            Math.max(0, deadline - Date.now()),
          );
        if (signal) {
          onAbort = () => {
            resolve(null);
            controller.abort();
          };
          signal.addEventListener("abort", onAbort, { once: true });
          if (signal.aborted) onAbort();
        }
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Shared poll loop. Used by both URL-mode and invite-code-mode request impls;
 * the loop body is identical between the two paths because the bridge
 * `Status` shape is mode-agnostic.
 */
async function pollUntilCompletionLoop(
  pollOnce: (options: RequestOptions) => Promise<Status>,
  options?: WaitOptions,
): Promise<IDKitCompletionResult> {
  const pollInterval = options?.pollInterval ?? 1000;
  const timeout = options?.timeout ?? 900_000; // 15 minutes default
  const deadline = Date.now() + timeout;

  while (true) {
    if (options?.signal?.aborted) {
      return { success: false, error: IDKitErrorCodes.Cancelled };
    }

    if (Date.now() >= deadline) {
      return { success: false, error: IDKitErrorCodes.Timeout };
    }

    let status: Status | null;
    try {
      status = await beforeDeadline(pollOnce, deadline, options?.signal);
    } catch (error) {
      if (options?.signal?.aborted)
        return { success: false, error: IDKitErrorCodes.Cancelled };
      if (Date.now() >= deadline)
        return { success: false, error: IDKitErrorCodes.Timeout };
      if (!isRetryableBridgeError(error)) {
        const code = error instanceof Error ? error.message : error;
        return {
          success: false,
          error: Object.values(IDKitErrorCodes).includes(
            code as IDKitErrorCodes,
          )
            ? (code as IDKitErrorCodes)
            : IDKitErrorCodes.GenericError,
        };
      }
      status = null;
    }
    if (options?.signal?.aborted)
      return { success: false, error: IDKitErrorCodes.Cancelled };
    if (Date.now() >= deadline)
      return { success: false, error: IDKitErrorCodes.Timeout };

    if (status?.type === "confirmed" && status.result) {
      return { success: true, result: status.result };
    }

    if (status?.type === "failed") {
      return {
        success: false,
        error:
          (status.error as IDKitErrorCodes) ?? IDKitErrorCodes.GenericError,
      };
    }

    let intervalTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await beforeDeadline(
        () =>
          new Promise<void>((resolve) => {
            intervalTimer = setTimeout(resolve, pollInterval);
          }),
        deadline,
        options?.signal,
      );
    } finally {
      clearTimeout(intervalTimer);
    }
  }
}

type BridgeDebugReportSource = {
  getDebugReport(): RustBridgeDebugReport;
};

function getBridgeDebugReport(bridgeRequest: unknown): IDKitDebugReport {
  return buildDebugReport(
    (bridgeRequest as BridgeDebugReportSource).getDebugReport(),
  );
}

/**
 * Internal request implementation (bridge path)
 */
class IDKitRequestImpl implements IDKitRequest {
  private bridgeRequest: BridgeRequest;
  private _connectorURI: string;
  private _requestId: string;

  constructor(bridgeRequest: BridgeRequest) {
    this.bridgeRequest = bridgeRequest;
    this._connectorURI = bridgeRequest.connectUrl();
    this._requestId = bridgeRequest.requestId();
  }

  get connectorURI(): string {
    return this._connectorURI;
  }

  get requestId(): string {
    return this._requestId;
  }

  async pollOnce(options?: RequestOptions): Promise<Status> {
    return (await this.bridgeRequest.pollForStatus(options)) as Status;
  }

  pollUntilCompletion(options?: WaitOptions): Promise<IDKitCompletionResult> {
    return pollUntilCompletionLoop(
      (pollOptions) => this.pollOnce(pollOptions),
      options,
    );
  }

  getDebugReport(): IDKitDebugReport {
    return getBridgeDebugReport(this.bridgeRequest);
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
  pollOnce(options?: RequestOptions): Promise<Status>;
  /** Poll continuously until completion or timeout */
  pollUntilCompletion(options?: WaitOptions): Promise<IDKitCompletionResult>;
  /** Debug report for the latest request state. Always available, independent of debug mode. */
  getDebugReport(): IDKitDebugReport;
}

/**
 * Internal invite-code request implementation (bridge only — code mode
 * has no in-app native postMessage path by design; the user is on a different
 * device than World App).
 */
class IDKitInviteCodeRequestImpl implements IDKitInviteCodeRequest {
  private bridgeRequest: BridgeRequest;
  private _connectorURI: string;
  private _expiresAt: number;
  private _requestId: string;

  constructor(bridgeRequest: BridgeRequest) {
    this.bridgeRequest = bridgeRequest;
    this._connectorURI = bridgeRequest.connectUrl();
    this._expiresAt = bridgeRequest.expiresAt();
    this._requestId = bridgeRequest.requestId();
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

  async pollOnce(options?: RequestOptions): Promise<Status> {
    return (await this.bridgeRequest.pollForStatus(options)) as Status;
  }

  pollUntilCompletion(options?: WaitOptions): Promise<IDKitCompletionResult> {
    return pollUntilCompletionLoop(
      (pollOptions) => this.pollOnce(pollOptions),
      options,
    );
  }

  getDebugReport(): IDKitDebugReport {
    return getBridgeDebugReport(this.bridgeRequest);
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
// Preset helpers - re-export types from the portable protocol, provide JS convenience functions
// ─────────────────────────────────────────────────────────────────────────────

// Preset declarations are checked against the native Rust contract manifest.
export type {
  Preset,
  IdentityAttribute,
  DocumentType,
  OrbLegacyPreset,
  SecureDocumentLegacyPreset,
  DocumentLegacyPreset,
  SelfieCheckLegacyPreset,
  SelfieCheckPreset,
  DeviceLegacyPreset,
  ProofOfHumanPreset,
  PassportPreset,
  IdentityCheckPreset,
  MncPreset,
} from "./types/protocol";

// Import protocol preset type for function return types
import type {
  Preset,
  IdentityAttribute,
  OrbLegacyPreset,
  SecureDocumentLegacyPreset,
  DocumentLegacyPreset,
  SelfieCheckLegacyPreset,
  SelfieCheckPreset,
  DeviceLegacyPreset,
  ProofOfHumanPreset,
  PassportPreset,
  IdentityCheckPreset,
  MncPreset,
} from "./types/protocol";

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
 * Creates a `SelfieCheck` preset.
 *
 * The preset requests the Selfie Check credential and always disables fallback to legacy proofs.
 *
 * @param opts - Optional configuration with signal
 * @returns A SelfieCheck preset
 *
 * @example
 * ```typescript
 * const request = await IDKit.request({ app_id, action, rp_context, allow_legacy_proofs: false })
 *   .preset(selfieCheck({ signal: 'user-123' }))
 * ```
 */
export function selfieCheck(opts: { signal?: string } = {}): SelfieCheckPreset {
  return { type: "SelfieCheck", signal: opts.signal };
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
// Protocol compilation (used for both native and bridge paths)
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// IDKitBuilder (transport-aware: native postMessage vs HTTP bridge)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builder for IDKit requests
 *
 * Stores configuration and defers transport selection to `.preset()` / `.constraints()`.
 * In World App: uses native postMessage transport (no HTTP bridge needed).
 * On web: uses HTTP bridge transport (QR code + polling).
 */
class IDKitBuilder {
  private config: BuilderConfig;

  constructor(config: BuilderConfig) {
    this.config = {
      ...config,
      rp_context: config.rp_context && { ...config.rp_context },
    };
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
  async constraints(
    constraints: ConstraintNode,
    options?: RequestOptions,
  ): Promise<IDKitRequest> {
    checkRequestOptions(options);
    if (isInWorldApp()) {
      const verifyVersion = getWorldAppVerifyVersion();

      if (verifyVersion < 2) {
        // Constraints require v2 — they can't be represented as v1 payloads.
        throw new Error(
          "verify v2 is not supported by this World App version. " +
            "Use a legacy preset (e.g. orbLegacy()) or update the World App.",
        );
      }

      const compiled: NativePayloadResult = compileRequest(
        this.config,
        { constraints },
        { nativeVersion: 2, requestId: randomRequestId() },
      );
      return createNativeRequest(
        compiled.payload,
        this.config,
        compiled.signal_hashes ?? {},
        compiled.legacy_signal_hash,
        2,
      );
    }

    // Bridge path
    const request = await createBridgeRequest(
      this.config,
      { constraints },
      false,
      options,
    );
    return new IDKitRequestImpl(request);
  }

  /**
   * Creates an IDKit request from a preset (works for all request types)
   *
   * Presets provide a simplified way to create requests with predefined
   * credential configurations.
   *
   * @param preset - A preset object from orbLegacy(), secureDocumentLegacy(), documentLegacy(), selfieCheckLegacy(), selfieCheck(), deviceLegacy(), proofOfHuman(), or passport()
   * @returns A new IDKitRequest instance
   *
   * @example
   * ```typescript
   * const request = await IDKit.request({ app_id, action, rp_context, allow_legacy_proofs: true })
   *   .preset(orbLegacy({ signal: 'user-123' }));
   * ```
   */
  async preset(
    preset: Preset,
    options?: RequestOptions,
  ): Promise<IDKitRequest> {
    checkRequestOptions(options);
    if (
      this.config.type === "createSession" ||
      this.config.type === "proveSession"
    ) {
      throw new Error(
        "Presets are not supported for session flows. Use .constraints() instead.",
      );
    }

    if (isInWorldApp()) {
      const verifyVersion = getWorldAppVerifyVersion();

      if (verifyVersion === 2) {
        const compiled: NativePayloadResult = compileRequest(
          this.config,
          { preset },
          { nativeVersion: 2, requestId: randomRequestId() },
        );
        return createNativeRequest(
          compiled.payload,
          this.config,
          compiled.signal_hashes ?? {},
          compiled.legacy_signal_hash,
          2,
        );
      }

      // v1 — presets always have valid legacy fields, so this should succeed
      try {
        const compiled: NativePayloadResult = compileRequest(
          this.config,
          { preset },
          { nativeVersion: 1, requestId: randomRequestId() },
        );
        return createNativeRequest(
          compiled.payload,
          this.config,
          compiled.signal_hashes ?? {},
          compiled.legacy_signal_hash,
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

    // Bridge path
    const request = await createBridgeRequest(
      this.config,
      { preset },
      false,
      options,
    );
    return new IDKitRequestImpl(request);
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
    this.config = {
      ...config,
      rp_context: config.rp_context && { ...config.rp_context },
    };
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
    options?: RequestOptions,
  ): Promise<IDKitInviteCodeRequest> {
    const request = await createBridgeRequest(
      this.config,
      { constraints },
      true,
      options,
    );
    return new IDKitInviteCodeRequestImpl(request);
  }

  /**
   * Creates an invite-code mode IDKit request from a preset.
   *
   * @param preset - A preset object from orbLegacy(), secureDocumentLegacy(), documentLegacy(), selfieCheckLegacy(), selfieCheck(), deviceLegacy(), proofOfHuman(), or passport()
   * @returns A new IDKitInviteCodeRequest instance
   */
  async preset(
    preset: Preset,
    options?: RequestOptions,
  ): Promise<IDKitInviteCodeRequest> {
    if (
      this.config.type === "createSession" ||
      this.config.type === "proveSession"
    ) {
      throw new Error(
        "Presets are not supported for session flows. Use .constraints() instead.",
      );
    }

    const request = await createBridgeRequest(
      this.config,
      { preset },
      true,
      options,
    );
    return new IDKitInviteCodeRequestImpl(request);
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
function createRequestForNamespace(
  config: IDKitRequestConfig,
  options: IDKitNamespaceOptions,
): IDKitBuilder {
  // Validate required fields
  if (!config.app_id) {
    throw new Error("app_id is required");
  }
  if (config.action === undefined || config.action === null) {
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
    package_name: options.package_name,
    package_version: options.package_version,
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

export function createRequest(config: IDKitRequestConfig): IDKitBuilder {
  return createRequestForNamespace(config, CORE_NAMESPACE_OPTIONS);
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
function createRequestWithInviteCodeForNamespace(
  config: IDKitRequestConfig,
  options: IDKitNamespaceOptions,
): IDKitInviteCodeBuilder {
  // Validate required fields — mirror createRequest exactly so integrators
  // don't get different validation between the two paths.
  if (!config.app_id) {
    throw new Error("app_id is required");
  }
  if (config.action === undefined || config.action === null) {
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
    package_name: options.package_name,
    package_version: options.package_version,
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

function createRequestWithInviteCode(
  config: IDKitRequestConfig,
): IDKitInviteCodeBuilder {
  return createRequestWithInviteCodeForNamespace(
    config,
    CORE_NAMESPACE_OPTIONS,
  );
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
function createSessionForNamespace(
  config: IDKitSessionConfig,
  options: IDKitNamespaceOptions,
): IDKitBuilder {
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
    package_name: options.package_name,
    package_version: options.package_version,
    rp_context: config.rp_context,
    action_description: config.action_description,
    bridge_url: config.bridge_url,
    return_to: config.return_to,
    require_user_presence: config.require_user_presence ?? false,
    override_connect_base_url: config.override_connect_base_url,
    environment: config.environment,
  });
}

export function createSession(config: IDKitSessionConfig): IDKitBuilder {
  return createSessionForNamespace(config, CORE_NAMESPACE_OPTIONS);
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
function proveSessionForNamespace(
  sessionId: `session_${string}`,
  config: IDKitSessionConfig,
  options: IDKitNamespaceOptions,
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
    package_name: options.package_name,
    package_version: options.package_version,
    rp_context: config.rp_context,
    action_description: config.action_description,
    bridge_url: config.bridge_url,
    return_to: config.return_to,
    require_user_presence: config.require_user_presence ?? false,
    override_connect_base_url: config.override_connect_base_url,
    environment: config.environment,
  });
}

export function proveSession(
  sessionId: `session_${string}`,
  config: IDKitSessionConfig,
): IDKitBuilder {
  return proveSessionForNamespace(sessionId, config, CORE_NAMESPACE_OPTIONS);
}

export type IDKitNamespace = {
  request: typeof createRequest;
  requestWithInviteCode: typeof createRequestWithInviteCode;
  createSession: typeof createSession;
  proveSession: typeof proveSession;
  CredentialRequest: typeof CredentialRequest;
  any: typeof any;
  all: typeof all;
  enumerate: typeof enumerate;
  orbLegacy: typeof orbLegacy;
  secureDocumentLegacy: typeof secureDocumentLegacy;
  documentLegacy: typeof documentLegacy;
  deviceLegacy: typeof deviceLegacy;
  selfieCheckLegacy: typeof selfieCheckLegacy;
  selfieCheck: typeof selfieCheck;
  proofOfHuman: typeof proofOfHuman;
  passport: typeof passport;
  mnc: typeof mnc;
  identityCheck: typeof identityCheck;
};

export function createIDKitNamespace(
  options: IDKitNamespaceOptions,
): IDKitNamespace {
  return {
    request: (config) => createRequestForNamespace(config, options),
    requestWithInviteCode: (config) =>
      createRequestWithInviteCodeForNamespace(config, options),
    createSession: (config) => createSessionForNamespace(config, options),
    proveSession: (sessionId, config) =>
      proveSessionForNamespace(sessionId, config, options),
    CredentialRequest,
    any,
    all,
    enumerate,
    orbLegacy,
    secureDocumentLegacy,
    documentLegacy,
    deviceLegacy,
    selfieCheckLegacy,
    selfieCheck,
    proofOfHuman,
    passport,
    mnc,
    identityCheck,
  };
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
export const IDKit: IDKitNamespace = createIDKitNamespace(
  CORE_NAMESPACE_OPTIONS,
);
