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
import type {
  IDKitResultV3,
  IDKitResultV4,
  IDKitResultSession,
} from "../lib/wasm";

const MINIAPP_VERIFY_ACTION = "miniapp-verify-action";

type MiniKitBridge = {
  subscribe?: (event: string, handler: (payload: any) => void) => void;
  unsubscribe?: (event: string) => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Environment detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if running inside World App
 */
export function isInWorldApp(): boolean {
  return typeof window !== "undefined" && Boolean((window as any).WorldApp);
}

/**
 * Detects the highest verify command version supported by the host World App.
 *
 * Reads `window.WorldApp.supported_commands` and looks for the "verify" entry.
 * Returns `2` when the host explicitly lists version 2; defaults to `1`
 * otherwise (safest for older Android builds that reject unknown versions).
 */
export function getWorldAppVerifyVersion(): 1 | 2 {
  const cmds = (window as any).WorldApp?.supported_commands;
  if (!Array.isArray(cmds)) return 1;
  const verify = cmds.find((c: any) => c.name === "verify");
  return verify?.supported_versions?.includes(2) ? 2 : 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Builder config types (shared with request.ts)
// ─────────────────────────────────────────────────────────────────────────────

export interface BuilderConfig {
  type: "request" | "createSession" | "proveSession";
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
 * @param signalHashes - Pre-computed signal hashes keyed by identifier (credential type)
 * @param version - Verify command version to send in the postMessage envelope (1 or 2, default 2)
 */
export function createNativeRequest(
  wasmPayload: unknown,
  config: BuilderConfig,
  signalHashes: Record<string, string> = {},
  legacySignalHash: string,
  version: 1 | 2 = 2,
): IDKitRequest {
  if (_activeNativeRequest?.isPending()) {
    console.warn(
      "IDKit native request already in flight. Reusing active request.",
    );
    return _activeNativeRequest;
  }
  const request = new NativeIDKitRequest(
    wasmPayload,
    config,
    signalHashes,
    legacySignalHash,
    version,
  );
  _activeNativeRequest = request;
  return request;
}

class NativeIDKitRequest implements IDKitRequest {
  readonly connectorURI: string = ""; // No QR needed in World App
  readonly requestId: string;
  private resultPromise: Promise<IDKitCompletionResult>;
  // Non-null once the request is done (success, error, cancel, or timeout).
  private completionResult: IDKitCompletionResult | null = null;
  private resolveFn: ((result: IDKitCompletionResult) => void) | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private miniKitHandler: ((payload: any) => void) | null = null;

  constructor(
    wasmPayload: unknown,
    config: BuilderConfig,
    signalHashes: Record<string, string> = {},
    legacySignalHash: string,
    version: 1 | 2 = 2,
  ) {
    this.requestId =
      crypto.randomUUID?.() ?? `native-${Date.now()}-${++_requestCounter}`;

    // Never rejects — all outcomes (success, error, cancel, timeout) resolve.
    this.resultPromise = new Promise<IDKitCompletionResult>((resolve) => {
      this.resolveFn = resolve;

      const handleIncomingPayload = (responsePayload: any) => {
        if (this.completionResult) return;

        if (responsePayload?.status === "error") {
          this.complete({
            success: false,
            error: responsePayload.error_code ?? IDKitErrorCodes.GenericError,
          });
          return;
        }

        this.complete({
          success: true,
          result: nativeResultToIDKitResult(
            responsePayload,
            config,
            signalHashes,
            legacySignalHash,
          ),
        });
      };

      const handler = (event: MessageEvent) => {
        const data = event.data;
        if (
          data?.type === MINIAPP_VERIFY_ACTION ||
          data?.command === MINIAPP_VERIFY_ACTION
        ) {
          handleIncomingPayload(data.payload ?? data);
        }
      };
      this.messageHandler = handler;
      window.addEventListener("message", handler);

      // Some World App environments route responses via MiniKit.trigger(...)
      // instead of window.postMessage. Subscribe as a compatibility channel.
      try {
        const miniKit = (window as any).MiniKit as MiniKitBridge | undefined;
        if (typeof miniKit?.subscribe === "function") {
          const miniKitHandler = (payload: any) => {
            handleIncomingPayload(payload?.payload ?? payload);
          };
          this.miniKitHandler = miniKitHandler;
          miniKit.subscribe(MINIAPP_VERIFY_ACTION, miniKitHandler);
        }
      } catch {
        // Ignore MiniKit subscription failures and rely on postMessage path.
      }

      // Wrap the WASM-built payload in the postMessage envelope
      const sendPayload = {
        command: "verify",
        version,
        payload: wasmPayload,
      };

      try {
        const w = window as any;
        if (w.webkit?.messageHandlers?.minikit) {
          w.webkit.messageHandlers.minikit.postMessage(sendPayload);
        } else if (w.Android) {
          w.Android.postMessage(JSON.stringify(sendPayload));
        } else {
          this.complete({
            success: false,
            error: IDKitErrorCodes.GenericError,
          });
        }
      } catch {
        this.complete({
          success: false,
          error: IDKitErrorCodes.GenericError,
        });
      }
    });
  }

  // Single entry point for finishing the request. Idempotent — first caller wins.
  private complete(result: IDKitCompletionResult): void {
    if (this.completionResult) return;
    this.completionResult = result;
    this.cleanup();
    this.resolveFn?.(result);
    if (_activeNativeRequest === this) {
      _activeNativeRequest = null;
    }
  }

  cancel(): void {
    this.complete({ success: false, error: IDKitErrorCodes.Cancelled });
  }

  private cleanup(): void {
    if (this.messageHandler) {
      window.removeEventListener("message", this.messageHandler);
      this.messageHandler = null;
    }

    if (this.miniKitHandler) {
      try {
        const miniKit = (window as any).MiniKit as MiniKitBridge | undefined;
        miniKit?.unsubscribe?.(MINIAPP_VERIFY_ACTION);
      } catch {
        // no-op
      }
      this.miniKitHandler = null;
    }
  }

  isPending(): boolean {
    return this.completionResult === null;
  }

  async pollOnce(): Promise<Status> {
    if (!this.completionResult) {
      return { type: "awaiting_confirmation" };
    }
    if (this.completionResult.success) {
      return { type: "confirmed", result: this.completionResult.result };
    }
    return { type: "failed", error: this.completionResult.error };
  }

  async pollUntilCompletion(
    options?: WaitOptions,
  ): Promise<IDKitCompletionResult> {
    const timeout = options?.timeout ?? 300000;

    const timeoutId = setTimeout(() => {
      this.complete({ success: false, error: IDKitErrorCodes.Timeout });
    }, timeout);

    const abortHandler = options?.signal
      ? () => {
          this.complete({ success: false, error: IDKitErrorCodes.Cancelled });
        }
      : null;

    if (abortHandler) {
      if (options!.signal!.aborted) {
        abortHandler();
      } else {
        options!.signal!.addEventListener("abort", abortHandler, {
          once: true,
        });
      }
    }

    try {
      return await this.resultPromise;
    } catch (error) {
      // the resultPromise should never reject, but just in case, catch unexpected rejections and convert to a failure result.
      console.error("Unexpected rejection in native resultPromise", error);
      this.complete({ success: false, error: IDKitErrorCodes.GenericError });
      return this.completionResult!;
    } finally {
      clearTimeout(timeoutId);
      if (options?.signal && abortHandler) {
        options.signal.removeEventListener("abort", abortHandler);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Incoming response mapping
// ─────────────────────────────────────────────────────────────────────────────

function nativeResultToIDKitResult(
  payload: unknown,
  config: BuilderConfig,
  signalHashes: Record<string, string>,
  legacySignalHash: string,
): IDKitResult {
  const p = payload as Record<string, any>;
  const rpNonce = config.rp_context?.nonce ?? "";

  // V4 response — World App returns `responses` array directly.
  // signal_hash is NOT on the raw V4 response; it's injected from the
  // pre-computed signal_hashes map (same pattern as the bridge path).
  if ("responses" in p && Array.isArray(p.responses)) {
    const items = p.responses as Record<string, any>[];

    // Session proof (has session_id, no action)
    if (p.session_id) {
      return {
        protocol_version: "4.0" as const,
        nonce: p.nonce ?? rpNonce,
        action_description: p.action_description,
        session_id: p.session_id,
        responses: items.map((item) => ({
          identifier: item.identifier,
          signal_hash: signalHashes[item.identifier],
          proof: item.proof,
          session_nullifier: item.session_nullifier,
          issuer_schema_id: item.issuer_schema_id,
          expires_at_min: item.expires_at_min,
        })),
        environment: config.environment ?? "production",
      } satisfies IDKitResultSession;
    }

    // Uniqueness proof (has action, no session_id)
    return {
      protocol_version: "4.0" as const,
      nonce: p.nonce ?? rpNonce,
      action: p.action ?? config.action ?? "",
      action_description: p.action_description,
      responses: items.map((item) => ({
        identifier: item.identifier,
        signal_hash: signalHashes[item.identifier],
        proof: item.proof,
        nullifier: item.nullifier,
        issuer_schema_id: item.issuer_schema_id,
        expires_at_min: item.expires_at_min,
      })),
      environment: config.environment ?? "production",
    } satisfies IDKitResultV4;
  }

  // Legacy multi-verification response (MiniKit v3 format).
  // Each verification is a V3 proof (string proof, merkle_root, nullifier_hash).
  // Older World App versions may include signal_hash on the item; fall back
  // to the pre-computed map when absent.
  if ("verifications" in p && Array.isArray(p.verifications)) {
    const verifications = p.verifications as Record<string, any>[];

    return {
      protocol_version: "3.0" as const,
      nonce: rpNonce,
      action: config.action ?? "",
      responses: verifications.map((v) => ({
        identifier: v.verification_level,
        signal_hash:
          v.signal_hash ??
          signalHashes[v.verification_level] ??
          legacySignalHash,
        proof: v.proof,
        merkle_root: v.merkle_root,
        nullifier: v.nullifier_hash,
      })),
      environment: config.environment ?? "production",
    } satisfies IDKitResultV3;
  }

  // Legacy single verification response (v3 format from World App).
  return {
    protocol_version: "3.0" as const,
    nonce: rpNonce,
    action: config.action ?? "",
    responses: [
      {
        identifier: p.verification_level,
        signal_hash:
          p.signal_hash ??
          signalHashes[p.verification_level] ??
          legacySignalHash,
        proof: p.proof,
        merkle_root: p.merkle_root,
        nullifier: p.nullifier_hash,
      },
    ],
    environment: config.environment ?? "production",
  } satisfies IDKitResultV3;
}
