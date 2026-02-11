import {
  IDKitErrorCodes,
  IDKit,
  type IDKitRequest,
  type IDKitResult,
  type IDKitResultSession,
} from "@worldcoin/idkit-core";
import type {
  IDKitRequestFlowConfig,
  IDKitSessionFlowConfig,
  IDKitFlowStatus,
} from "../types";
import { IDKitFlowError } from "./errors";

type RunOptions = {
  signal?: AbortSignal;
  onStatusChange?: (status: IDKitFlowStatus) => void;
  onConnectorURI?: (connectorURI: string) => void;
};

function assertSessionId(sessionId: string | undefined): string | undefined {
  if (sessionId === undefined) {
    return undefined;
  }

  if (sessionId.trim().length === 0) {
    throw new IDKitFlowError("existing_session_id cannot be an empty string");
  }

  return sessionId;
}

function ensureNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new IDKitFlowError("Verification was cancelled");
  }
}

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", abortHandler);
      resolve();
    }, ms);

    const abortHandler = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", abortHandler);
      reject(new IDKitFlowError("Verification was cancelled"));
    };

    signal.addEventListener("abort", abortHandler, { once: true });
  });
}

function isSessionResult(result: IDKitResult): result is IDKitResultSession {
  return (
    typeof result === "object" &&
    result !== null &&
    "session_id" in result &&
    typeof result.session_id === "string"
  );
}

async function pollRequest(
  request: IDKitRequest,
  options: {
    signal?: AbortSignal;
    onStatusChange?: (status: IDKitFlowStatus) => void;
    pollInterval?: number;
    timeout?: number;
  },
): Promise<IDKitResult> {
  const pollInterval = options.pollInterval ?? 1000;
  const timeout = options.timeout ?? 300000;
  const startedAt = Date.now();

  while (true) {
    ensureNotAborted(options.signal);

    if (Date.now() - startedAt > timeout) {
      throw new IDKitFlowError(`Timeout waiting for proof after ${timeout}ms`);
    }

    const status = await request.pollOnce();
    options.onStatusChange?.(status.type);

    if (status.type === "confirmed") {
      if (!status.result) {
        throw new IDKitFlowError(
          "Verification completed without a result payload",
        );
      }

      return status.result;
    }

    if (status.type === "failed") {
      const code = status.error ?? IDKitErrorCodes.GenericError;
      throw new IDKitFlowError(`Verification failed: ${code}`, { code });
    }

    await delay(pollInterval, options.signal);
  }
}

export async function runRequestFlow(
  config: IDKitRequestFlowConfig,
  options: RunOptions = {},
): Promise<IDKitResult> {
  ensureNotAborted(options.signal);
  options.onStatusChange?.("preparing");

  await IDKit.init();

  const builder = IDKit.request({
    app_id: config.app_id,
    action: config.action,
    rp_context: config.rp_context,
    action_description: config.action_description,
    bridge_url: config.bridge_url,
    allow_legacy_proofs: config.allow_legacy_proofs,
    override_connect_base_url: config.override_connect_base_url,
    environment: config.environment,
  });

  // TODO: reintroduce strategy abstraction when core JS re-enables
  // IDKitBuilder.constraints() and React supports constraints again.
  const request = await builder.preset(config.preset);
  options.onConnectorURI?.(request.connectorURI);

  return pollRequest(request, {
    signal: options.signal,
    onStatusChange: options.onStatusChange,
    pollInterval: config.pollInterval,
    timeout: config.timeout,
  });
}

export async function runSessionFlow(
  config: IDKitSessionFlowConfig,
  options: RunOptions = {},
): Promise<IDKitResultSession> {
  ensureNotAborted(options.signal);
  options.onStatusChange?.("preparing");

  await IDKit.init();

  const existingSessionId = assertSessionId(config.existing_session_id);

  const builder = existingSessionId
    ? IDKit.proveSession(existingSessionId, {
        app_id: config.app_id,
        rp_context: config.rp_context,
        action_description: config.action_description,
        bridge_url: config.bridge_url,
        override_connect_base_url: config.override_connect_base_url,
        environment: config.environment,
      })
    : IDKit.createSession({
        app_id: config.app_id,
        rp_context: config.rp_context,
        action_description: config.action_description,
        bridge_url: config.bridge_url,
        override_connect_base_url: config.override_connect_base_url,
        environment: config.environment,
      });

  // TODO: reintroduce strategy abstraction when core JS re-enables
  // IDKitBuilder.constraints() and React supports constraints again.
  const request = await builder.preset(config.preset);
  options.onConnectorURI?.(request.connectorURI);

  const result = await pollRequest(request, {
    signal: options.signal,
    onStatusChange: options.onStatusChange,
    pollInterval: config.pollInterval,
    timeout: config.timeout,
  });

  if (!isSessionResult(result)) {
    throw new IDKitFlowError(
      "Expected a session result but received a uniqueness result",
    );
  }

  return result;
}
