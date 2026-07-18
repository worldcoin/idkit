import { IDKitErrorCodes } from "@worldcoin/idkit-core";

const retryablePollErrors = new Set<IDKitErrorCodes>([
  IDKitErrorCodes.ConnectionFailed,
  IDKitErrorCodes.GenericError,
  IDKitErrorCodes.UnexpectedResponse,
]);
const maxVisiblePollRetries = 5;
const maxPollRetryDelay = 5_000;

type IDKitHookStatus =
  | "idle"
  | "waiting_for_connection"
  | "awaiting_confirmation"
  | "confirmed"
  | "failed";

export type HookState<TResult> = {
  isOpen: boolean;
  status: IDKitHookStatus;
  connectorURI: string | null;
  result: TResult | null;
  errorCode: IDKitErrorCodes | null;
};

export function createInitialHookState<TResult>(): HookState<TResult> {
  return {
    isOpen: false,
    status: "idle",
    connectorURI: null,
    result: null,
    errorCode: null,
  };
}

export function ensureNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw IDKitErrorCodes.Cancelled;
  }
}

export async function delay(ms: number, signal?: AbortSignal): Promise<void> {
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
      reject(IDKitErrorCodes.Cancelled);
    };

    signal.addEventListener("abort", abortHandler, { once: true });
  });
}

type PollOnceWithRetryOptions = {
  interval: number;
  signal: AbortSignal;
  startedAt: number;
  timeout: number;
};

function isPageHidden(): boolean {
  return (
    typeof document !== "undefined" && document.visibilityState === "hidden"
  );
}

/**
 * Retries transport-level polling failures without recreating the active
 * verification request. Retries are bounded while the page is visible, but a
 * backgrounded page keeps its retry budget for when the user returns from the
 * World App handoff. The flow's overall timeout remains authoritative.
 */
export async function pollOnceWithRetry<TResult>(
  pollOnce: () => Promise<TResult>,
  options: PollOnceWithRetryOptions,
): Promise<TResult> {
  let consecutiveFailures = 0;
  let visibleFailures = 0;

  while (true) {
    ensureNotAborted(options.signal);

    if (Date.now() - options.startedAt > options.timeout) {
      throw IDKitErrorCodes.Timeout;
    }

    try {
      return await pollOnce();
    } catch (error) {
      ensureNotAborted(options.signal);

      const errorCode = toErrorCode(error);
      if (!retryablePollErrors.has(errorCode)) {
        throw error;
      }

      if (!isPageHidden()) {
        if (visibleFailures >= maxVisiblePollRetries) {
          throw error;
        }
        visibleFailures += 1;
      }

      consecutiveFailures += 1;
      const elapsed = Date.now() - options.startedAt;
      const remaining = options.timeout - elapsed;
      if (remaining <= 0) {
        throw IDKitErrorCodes.Timeout;
      }

      const retryDelay = Math.min(
        options.interval * 2 ** Math.min(consecutiveFailures - 1, 3),
        maxPollRetryDelay,
        remaining,
      );
      await delay(retryDelay, options.signal);
    }
  }
}

const knownErrorCodes = new Set<string>(Object.values(IDKitErrorCodes));

function asKnownErrorCode(value: unknown): IDKitErrorCodes | null {
  if (typeof value === "string" && knownErrorCodes.has(value)) {
    return value as IDKitErrorCodes;
  }

  return null;
}

function getErrorMessage(error: unknown): string | null {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : null;
  }

  return null;
}

function errorCodeFromMessage(message: string): IDKitErrorCodes | null {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("invalid rp id") ||
    normalized.includes("valid rp id must start with") ||
    normalized.includes("expected hex string")
  ) {
    return IDKitErrorCodes.InvalidRpIdFormat;
  }

  if (normalized.includes("created_at cannot be in the future")) {
    return IDKitErrorCodes.TimestampTooFarInFuture;
  }

  if (
    normalized.includes("expires_at must be greater than created_at") ||
    normalized.includes("invalid timestamp") ||
    normalized.includes("failed to format timestamp")
  ) {
    return IDKitErrorCodes.InvalidTimestamp;
  }

  return null;
}

export function toErrorCode(error: unknown): IDKitErrorCodes {
  const directCode = asKnownErrorCode(error);
  if (directCode) {
    return directCode;
  }

  if (typeof error === "object" && error !== null && "code" in error) {
    const nestedCode = asKnownErrorCode((error as { code?: unknown }).code);
    if (nestedCode) {
      return nestedCode;
    }
  }

  const message = getErrorMessage(error);
  if (message) {
    const messageCode = errorCodeFromMessage(message);
    if (messageCode) {
      return messageCode;
    }
  }

  return IDKitErrorCodes.GenericError;
}
