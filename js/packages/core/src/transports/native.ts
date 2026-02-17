/**
 * Native transport for World App
 *
 * When running inside World App, verification requests are sent via
 * WebView postMessage instead of the WASM bridge (QR + polling).
 *
 * The payload is built by the WASM module (same as the bridge path) to ensure
 * a single source of truth. This module wraps it in a postMessage envelope
 * and handles World App responses.
 *
 * Security notes:
 * - Origin validation is not applicable here. In the World App WebView, messages
 *   are exchanged between the mini-app and the host app via the native bridge
 *   (webkit.messageHandlers / Android.postMessage). The host app is the only
 *   entity that can inject messages, and it is trusted.
 */

import type {
  IDKitRequest,
  IDKitCompletionResult,
  WaitOptions,
  Status,
} from "../request";
import type { IDKitResult } from "../types/result";
import { IDKitErrorCodes } from "../types/result";

// ─────────────────────────────────────────────────────────────────────────────
// Environment detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if running inside World App
 */
export function isInWorldApp(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).WorldApp);
}

// ─────────────────────────────────────────────────────────────────────────────
// Builder config types (shared with request.ts)
// ─────────────────────────────────────────────────────────────────────────────

export interface BuilderConfig {
  type: "request" | "session" | "proveSession";
  app_id: string;
  action?: string;
  session_id?: string;
  rp_context?: import("../types/config").RpContext;
  action_description?: string;
  bridge_url?: string;
  allow_legacy_proofs?: boolean;
  override_connect_base_url?: string;
  environment?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Native IDKit request
// ─────────────────────────────────────────────────────────────────────────────

let _requestCounter = 0;
let _activeNativeRequest: NativeIDKitRequest | null = null;

/**
 * Create an IDKitRequest that communicates via World App postMessage.
 *
 * Only one native request should be in flight at a time.
 *
 * If another request is created while one is still pending, we reuse the
 * active request instead of cancelling it. This avoids a race where the first
 * request removes its listener and resolves as `cancelled` even though World
 * App later posts a successful response.
 *
 * @param wasmPayload - Pre-built payload from the WASM module (same format as bridge)
 * @param config - Builder config (used for response normalization)
 */
export function createNativeRequest(
  wasmPayload: unknown,
  config: BuilderConfig,
): IDKitRequest {
  if (_activeNativeRequest?.isPending()) {
    console.warn(
      "IDKit native request already in flight. Reusing active request.",
    );
    return _activeNativeRequest;
  }
  const request = new NativeIDKitRequest(wasmPayload, config);
  _activeNativeRequest = request;
  return request;
}

class NativeIDKitRequest implements IDKitRequest {
  readonly connectorURI: string = ""; // No QR needed in World App
  readonly requestId: string;
  private resultPromise: Promise<IDKitResult>;
  private resolved = false;
  private cancelled = false;
  private settled = false;
  private resolvedResult: IDKitResult | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private rejectFn: ((reason: Error) => void) | null = null;

  constructor(wasmPayload: unknown, config: BuilderConfig) {
    this.requestId =
      crypto.randomUUID?.() ?? `native-${Date.now()}-${++_requestCounter}`;

    this.resultPromise = new Promise<IDKitResult>((resolve, reject) => {
      this.rejectFn = reject;

      const handler = (event: MessageEvent) => {
        if (this.cancelled) return;
        const data = event.data;
        if (
          data?.type === "miniapp-verify-action" ||
          data?.command === "miniapp-verify-action"
        ) {
          this.cleanup();
          const responsePayload = data.payload ?? data;
          if (responsePayload.status === "error") {
            reject(
              new NativeVerifyError(
                responsePayload.error_code ?? IDKitErrorCodes.GenericError,
              ),
            );
          } else {
            this.resolved = true;
            const result = nativeResultToIDKitResult(responsePayload, config);
            this.resolvedResult = result;
            resolve(result);
          }
        }
      };
      this.messageHandler = handler;
      window.addEventListener("message", handler);

      // Wrap the WASM-built payload in the postMessage envelope
      const sendPayload = {
        command: "verify",
        version: 2,
        payload: wasmPayload,
      };

      const w = window as any;
      if (w.webkit?.messageHandlers?.minikit) {
        w.webkit.messageHandlers.minikit.postMessage(sendPayload);
      } else if (w.Android) {
        w.Android.postMessage(JSON.stringify(sendPayload));
      } else {
        this.cleanup();
        reject(new Error("No WebView bridge available"));
      }
    });

    // Ensure listener is always cleaned up when the promise settles
    this.resultPromise
      .catch(() => {})
      .finally(() => {
        this.settled = true;
        this.cleanup();
        if (_activeNativeRequest === this) {
          _activeNativeRequest = null;
        }
      });
  }

  /**
   * Cancel this request. Removes the message listener so it cannot consume
   * a response meant for a later request, and rejects the pending promise.
   */
  cancel(): void {
    if (this.resolved || this.cancelled) return;
    this.cancelled = true;
    this.cleanup();
    this.rejectFn?.(new NativeVerifyError(IDKitErrorCodes.Cancelled));
    if (_activeNativeRequest === this) {
      _activeNativeRequest = null;
    }
  }

  private cleanup(): void {
    if (this.messageHandler) {
      window.removeEventListener("message", this.messageHandler);
      this.messageHandler = null;
    }
  }

  isPending(): boolean {
    return !this.settled && !this.cancelled;
  }

  async pollOnce(): Promise<Status> {
    if (this.resolved && this.resolvedResult) {
      return { type: "confirmed", result: this.resolvedResult };
    }
    return { type: "awaiting_confirmation" };
  }

  async pollUntilCompletion(
    options?: WaitOptions,
  ): Promise<IDKitCompletionResult> {
    const timeout = options?.timeout ?? 300000;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let abortHandler: (() => void) | null = null;
    let waiterTerminationCode:
      | IDKitErrorCodes.Timeout
      | IDKitErrorCodes.Cancelled
      | null = null;

    try {
      const result = await Promise.race([
        this.resultPromise,
        new Promise<never>((_, reject) => {
          if (options?.signal) {
            abortHandler = () => {
              waiterTerminationCode = IDKitErrorCodes.Cancelled;
              reject(new NativeVerifyError(IDKitErrorCodes.Cancelled));
            };
            if (options.signal.aborted) {
              abortHandler();
              return;
            }
            options.signal.addEventListener("abort", abortHandler, {
              once: true,
            });
          }
          timeoutId = setTimeout(() => {
            waiterTerminationCode = IDKitErrorCodes.Timeout;
            reject(new NativeVerifyError(IDKitErrorCodes.Timeout));
          }, timeout);
        }),
      ]);
      return { success: true, result };
    } catch (error) {
      if (error instanceof NativeVerifyError) {
        if (waiterTerminationCode === error.code && this.isPending()) {
          // Ensure timeout/abort does not leave a stale active request.
          this.cancel();
        }
        return { success: false, error: error.code };
      }
      return { success: false, error: IDKitErrorCodes.GenericError };
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (options?.signal && abortHandler) {
        options.signal.removeEventListener("abort", abortHandler);
      }
    }
  }
}

class NativeVerifyError extends Error {
  code: IDKitErrorCodes;
  constructor(code: IDKitErrorCodes) {
    super(code);
    this.code = code;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Incoming response mapping
// ─────────────────────────────────────────────────────────────────────────────

function nativeResultToIDKitResult(
  payload: any,
  config: BuilderConfig,
): IDKitResult {
  const rpNonce = config.rp_context?.nonce ?? "";

  // v4 response — World App returns `responses` array directly
  if ("responses" in payload && Array.isArray(payload.responses)) {
    return {
      protocol_version: payload.protocol_version ?? "4.0",
      nonce: payload.nonce ?? rpNonce,
      action: payload.action ?? config.action ?? "",
      action_description: payload.action_description,
      session_id: payload.session_id,
      responses: payload.responses,
      environment: payload.environment ?? config.environment ?? "production",
    } as unknown as IDKitResult;
  }

  // Legacy multi-verification response (MiniKit v3 format)
  if ("verifications" in payload) {
    return {
      protocol_version: "4.0",
      nonce: rpNonce,
      action: config.action ?? "",
      responses: payload.verifications.map((v: any) => ({
        identifier: v.verification_level,
        proof: [v.proof],
        nullifier: v.nullifier_hash,
        merkle_root: v.merkle_root,
        issuer_schema_id: 0,
        expires_at_min: 0,
      })),
      environment: "production",
    } as unknown as IDKitResult;
  }

  // Legacy single verification response (v3 format from World App)
  return {
    protocol_version: "3.0",
    nonce: rpNonce,
    action: config.action ?? "",
    responses: [
      {
        identifier: payload.verification_level,
        proof: payload.proof,
        merkle_root: payload.merkle_root,
        nullifier: payload.nullifier_hash,
      },
    ],
    environment: "production",
  } as unknown as IDKitResult;
}
