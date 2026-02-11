import {
  IDKitErrorCodes,
  IDKit,
  type IDKitRequest,
  type IDKitResult,
  type IDKitResultSession,
  type Status,
} from "@worldcoin/idkit-core";
import type {
  IDKitRequestFlowConfig,
  IDKitSessionFlowConfig,
  IDKitFlowStatus,
} from "../types";
import { IDKitFlowError } from "./errors";
import { mapCorePollStatus } from "./status";

type RunOptions = {
  signal?: AbortSignal;
  onStatusChange?: (status: IDKitFlowStatus) => void;
  onConnectorURI?: (connectorURI: string) => void;
};

type StrategyConfig = {
  preset?: IDKitRequestFlowConfig["preset"] | IDKitSessionFlowConfig["preset"];
  constraints?:
    | IDKitRequestFlowConfig["constraints"]
    | IDKitSessionFlowConfig["constraints"];
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

function assertStrategy(config: StrategyConfig): asserts config is
  | {
      preset: NonNullable<StrategyConfig["preset"]>;
      constraints?: never;
    }
  | {
      constraints: NonNullable<StrategyConfig["constraints"]>;
      preset?: never;
    } {
  if (config.preset && config.constraints) {
    throw new IDKitFlowError(
      "Provide either preset or constraints, not both",
    );
  }

  if (!config.preset && !config.constraints) {
    throw new IDKitFlowError("Either preset or constraints is required");
  }
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

async function createRequestFromStrategy(
  requestBuilder:
    | ReturnType<typeof IDKit.request>
    | ReturnType<typeof IDKit.createSession>
    | ReturnType<typeof IDKit.proveSession>,
  config: StrategyConfig,
): Promise<IDKitRequest> {
  assertStrategy(config);

  if (config.preset) {
    return requestBuilder.preset(config.preset);
  }

  // TODO: re-enable when .constraints() is added back to IDKitBuilder
  // return requestBuilder.constraints(config.constraints);
  throw new Error("constraints are not yet supported");
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

    const status = (await request.pollOnce()) as Status;
    const mappedStatus = mapCorePollStatus(status.type);
    options.onStatusChange?.(mappedStatus);

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

  const request = await createRequestFromStrategy(builder, config);
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

  const request = await createRequestFromStrategy(builder, config);
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
