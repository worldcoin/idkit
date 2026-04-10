/**
 * @worldcoin/idkit-react-native
 *
 * Pure TypeScript React Native package for World ID verification.
 * No WASM — just standard crypto + HTTP.
 */

// Polyfill globalThis.crypto for React Native (Hermes doesn't provide it).
// Must run before any @noble/* imports access the crypto global.
import "react-native-get-random-values";

export {
  IDKitErrorCodes,
  type IDKitErrorCode,
  type IDKitResult,
  type IDKitResultV3,
  type IDKitResultV4,
  type IDKitResultSession,
  type ResponseItemV3,
  type ResponseItemV4,
  type ResponseItemSession,
  type RpContext,
  type IDKitRequestConfig,
  type Status,
  type IDKitCompletionResult,
  type WaitOptions,
  type Preset,
  type OrbLegacyPreset,
  type SecureDocumentLegacyPreset,
  type DocumentLegacyPreset,
  type SelfieCheckLegacyPreset,
  type DeviceLegacyPreset,
} from "./types";

import type {
  IDKitRequestConfig,
  Preset,
  Status,
  IDKitCompletionResult,
  WaitOptions,
  IDKitRequest,
} from "./types";
import { IDKitErrorCodes } from "./types";
import {
  createBridgeConnection,
  pollBridgeStatus,
  type BridgeConnection,
} from "./bridge";
import { hashSignal } from "./hashing";

export type { IDKitRequest } from "./types";
export { hashSignal } from "./hashing";

// ── Preset factory functions ────────────────────────────────────────────────

export function orbLegacy(opts: { signal?: string } = {}) {
  return { type: "OrbLegacy" as const, signal: opts.signal };
}

export function secureDocumentLegacy(opts: { signal?: string } = {}) {
  return { type: "SecureDocumentLegacy" as const, signal: opts.signal };
}

export function documentLegacy(opts: { signal?: string } = {}) {
  return { type: "DocumentLegacy" as const, signal: opts.signal };
}

export function selfieCheckLegacy(opts: { signal?: string } = {}) {
  return { type: "SelfieCheckLegacy" as const, signal: opts.signal };
}

export function deviceLegacy(opts: { signal?: string } = {}) {
  return { type: "DeviceLegacy" as const, signal: opts.signal };
}

// ── Request implementation ──────────────────────────────────────────────────

class IDKitRequestImpl implements IDKitRequest {
  private readonly connection: BridgeConnection;

  constructor(connection: BridgeConnection) {
    this.connection = connection;
  }

  get connectorURI(): string {
    return this.connection.connectUrl;
  }

  get requestId(): string {
    return this.connection.requestId;
  }

  async pollOnce(): Promise<Status> {
    return pollBridgeStatus(this.connection);
  }

  async pollUntilCompletion(
    options?: WaitOptions,
  ): Promise<IDKitCompletionResult> {
    const pollInterval = options?.pollInterval ?? 1000;
    const timeout = options?.timeout ?? 900_000; // 15 minutes
    const startedAt = Date.now();

    while (true) {
      if (options?.signal?.aborted) {
        return { success: false, error: IDKitErrorCodes.Cancelled };
      }

      if (Date.now() - startedAt > timeout) {
        return { success: false, error: IDKitErrorCodes.Timeout };
      }

      const status = await this.pollOnce();

      if (status.type === "confirmed") {
        return { success: true, result: status.result };
      }

      if (status.type === "failed") {
        return { success: false, error: status.error };
      }

      await new Promise<void>((resolve) => setTimeout(resolve, pollInterval));
    }
  }
}

// ── Builder ─────────────────────────────────────────────────────────────────

class IDKitBuilder {
  constructor(private readonly config: IDKitRequestConfig) {}

  async preset(preset: Preset): Promise<IDKitRequest> {
    const connection = await createBridgeConnection(this.config, preset);
    return new IDKitRequestImpl(connection);
  }
}

// ── Validation ──────────────────────────────────────────────────────────────

function validateRequestConfig(config: IDKitRequestConfig): void {
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
      "allow_legacy_proofs is required. Set to true to accept v3 proofs during migration, or false to only accept v4 proofs.",
    );
  }
}

// ── Entry point ─────────────────────────────────────────────────────────────

function createRequest(config: IDKitRequestConfig): IDKitBuilder {
  validateRequestConfig(config);
  return new IDKitBuilder(config);
}

export const IDKit = {
  request: createRequest,
  orbLegacy,
  secureDocumentLegacy,
  documentLegacy,
  selfieCheckLegacy,
  deviceLegacy,
  hashSignal,
};
