/**
 * Native transport for World App
 *
 * When running inside World App, verification requests are sent via
 * WebView postMessage instead of the WASM bridge (QR + polling).
 *
 * Security notes:
 * - Origin validation is not applicable here. In the World App WebView, messages
 *   are exchanged between the mini-app and the host app via the native bridge
 *   (webkit.messageHandlers / Android.postMessage). The host app is the only
 *   entity that can inject messages, and it is trusted.
 * - Request correlation (matching responses to specific requests) is not currently
 *   supported by the World App native protocol. The native bridge processes one
 *   verify command at a time. If this changes, add request_id to the outgoing
 *   payload and match in the response handler.
 */

import type { IDKitRequest, IDKitCompletionResult, WaitOptions, Status } from "../request";
import type { IDKitResult } from "../types/result";
import type { RpContext } from "../types/config";
import type { Preset } from "../lib/wasm";
import type { ConstraintNode, CredentialRequestType } from "../types/result";
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
  rp_context?: RpContext;
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

/**
 * Create an IDKitRequest that communicates via World App postMessage.
 *
 * All config types (request, session, proveSession) use the same native
 * "verify" command — the World App does not distinguish between them at
 * the postMessage level. Session semantics are handled server-side.
 */
export function createNativeRequest(
  builderConfig: BuilderConfig,
  credentialConfig: { preset?: Preset; constraints?: ConstraintNode },
): IDKitRequest {
  return new NativeIDKitRequest(builderConfig, credentialConfig);
}

class NativeIDKitRequest implements IDKitRequest {
  readonly connectorURI: string = ""; // No QR needed in World App
  readonly requestId: string;
  private resultPromise: Promise<IDKitResult>;
  private resolved = false;
  private resolvedResult: IDKitResult | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  constructor(
    config: BuilderConfig,
    credentialConfig: { preset?: Preset; constraints?: ConstraintNode },
  ) {
    this.requestId =
      crypto.randomUUID?.() ?? `native-${Date.now()}-${++_requestCounter}`;

    const verificationLevel = extractVerificationLevel(credentialConfig);
    const signal = extractSignal(credentialConfig);

    this.resultPromise = new Promise<IDKitResult>((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        const data = event.data;
        if (
          data?.type === "miniapp-verify-action" ||
          data?.command === "miniapp-verify-action"
        ) {
          this.cleanup();
          const payload = data.payload ?? data;
          if (payload.status === "error") {
            reject(
              new NativeVerifyError(
                payload.error_code ?? IDKitErrorCodes.GenericError,
              ),
            );
          } else {
            this.resolved = true;
            const result = nativeResultToIDKitResult(payload, config);
            this.resolvedResult = result;
            resolve(result);
          }
        }
      };
      this.messageHandler = handler;
      window.addEventListener("message", handler);

      // Send verify command via WebView bridge
      const sendPayload = {
        command: "verify",
        version: 1,
        payload: {
          action: config.action ?? "",
          signal: signal,
          verification_level: verificationLevel,
          timestamp: new Date().toISOString(),
        },
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
    this.resultPromise.catch(() => {}).finally(() => this.cleanup());
  }

  private cleanup(): void {
    if (this.messageHandler) {
      window.removeEventListener("message", this.messageHandler);
      this.messageHandler = null;
    }
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

    try {
      const result = await Promise.race([
        this.resultPromise,
        new Promise<never>((_, reject) => {
          if (options?.signal) {
            options.signal.addEventListener("abort", () =>
              reject(new NativeVerifyError(IDKitErrorCodes.Cancelled)),
            );
          }
          setTimeout(
            () => reject(new NativeVerifyError(IDKitErrorCodes.Timeout)),
            timeout,
          );
        }),
      ]);
      return { success: true, result };
    } catch (error) {
      if (error instanceof NativeVerifyError) {
        return { success: false, error: error.code };
      }
      return { success: false, error: IDKitErrorCodes.GenericError };
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
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function extractVerificationLevel(
  config: { preset?: Preset; constraints?: ConstraintNode },
): string | string[] {
  if (config.preset) {
    switch ((config.preset as any).type) {
      case "OrbLegacy":
        return "orb";
      case "SecureDocumentLegacy":
        return "secure_document";
      case "DocumentLegacy":
        return "document";
    }
  }
  if (config.constraints) {
    return extractTypesFromConstraints(config.constraints);
  }
  return "orb";
}

function extractSignal(
  config: { preset?: Preset; constraints?: ConstraintNode },
): string | undefined {
  if (config.preset && "signal" in config.preset) {
    return (config.preset as any).signal;
  }
  if (config.constraints) {
    return extractSignalFromConstraints(config.constraints);
  }
  return undefined;
}

function extractTypesFromConstraints(
  node: ConstraintNode,
): string | string[] {
  if ("type" in node) return (node as CredentialRequestType).type;
  if ("any" in node) {
    return (node as { any: ConstraintNode[] }).any.flatMap((n) => {
      const t = extractTypesFromConstraints(n);
      return Array.isArray(t) ? t : [t];
    });
  }
  if ("all" in node) {
    return (node as { all: ConstraintNode[] }).all.flatMap((n) => {
      const t = extractTypesFromConstraints(n);
      return Array.isArray(t) ? t : [t];
    });
  }
  return "orb";
}

function extractSignalFromConstraints(
  node: ConstraintNode,
): string | undefined {
  if ("type" in node && "signal" in node) {
    return (node as CredentialRequestType).signal;
  }
  if ("any" in node) {
    for (const child of (node as { any: ConstraintNode[] }).any) {
      const signal = extractSignalFromConstraints(child);
      if (signal) return signal;
    }
  }
  if ("all" in node) {
    for (const child of (node as { all: ConstraintNode[] }).all) {
      const signal = extractSignalFromConstraints(child);
      if (signal) return signal;
    }
  }
  return undefined;
}

function nativeResultToIDKitResult(
  payload: any,
  config: BuilderConfig,
): IDKitResult {
  // Multi-verification response (multiple verifications array)
  if ("verifications" in payload) {
    return {
      protocol_version: "4.0",
      nonce: "",
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

  // Single verification response (v3 format from World App)
  return {
    protocol_version: "3.0",
    nonce: "",
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
