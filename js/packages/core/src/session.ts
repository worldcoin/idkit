/**
 * IDKit Session
 * Pure functional API for World ID verification - no dependencies
 */

import type { IDKitConfig, RpContext } from "./types/config";
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

/** Session configuration - same as IDKitConfig */
export type SessionOptions = IDKitConfig;

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

/**
 * Creates a new World ID verification session
 *
 * This is a pure function with no global state. Each call creates an independent session.
 *
 * @param config - Session configuration (requires rp_context)
 * @returns A new Session instance
 *
 * @example
 * ```typescript
 * import { createSession, initIDKit } from '@worldcoin/idkit-core'
 *
 * // Initialize WASM (only needed once)
 * await initIDKit()
 *
 * // Create a verification session
 * const session = await createSession({
 *   app_id: 'app_staging_xxxxx',
 *   action: 'my-action',
 *   requests: [
 *     { credential_type: 'orb', signal: 'user-id-123' },
 *   ],
 *   // In production, rp_context should come from your backend
 *   rp_context: {
 *     rp_id: 'rp_123456789abcdef0',
 *     nonce: 'unique-nonce',
 *     created_at: Math.floor(Date.now() / 1000),
 *     expires_at: Math.floor(Date.now() / 1000) + 3600,
 *     signature: 'ecdsa-signature-from-backend',
 *   },
 * })
 *
 * // Display QR code
 * console.log('Scan this:', session.connectorURI)
 *
 * // Wait for proof
 * const proof = await session.pollForUpdates()
 * console.log('Success:', proof)
 * ```
 */
// TODO: Let's explore a builder pattern to improve DevEx
export async function createSession(config: SessionOptions): Promise<Session> {
  // Ensure WASM is initialized
  await initIDKit();

  // Validate rp_context
  if (!config.rp_context) {
    throw new Error("rp_context is required");
  }

  // Validate requests
  if (!config.requests || config.requests.length === 0) {
    throw new Error("At least one request is required");
  }

  // Bridge URL validation is now handled in Rust core

  // Map requests to WASM format
  const reqs = config.requests.map((req) => ({
    credential_type: req.credential_type,
    signal: typeof req.signal === "string" ? req.signal : undefined,
  }));

  // Create WASM RpContext
  const rpContext = new WasmModule.RpContextWasm(
    config.rp_context.rp_id,
    config.rp_context.nonce,
    BigInt(config.rp_context.created_at),
    BigInt(config.rp_context.expires_at),
    config.rp_context.signature,
  );

  // Create WASM session with the new API
  const wasmSession = (await WasmModule.Session.create(
    config.app_id,
    config.action,
    reqs,
    rpContext,
    config.constraints ?? undefined,
    config.action_description ?? null,
    config.bridge_url ?? null,
  )) as unknown as WasmModule.Session;

  return new SessionImpl(wasmSession);
}
