import { IDKitErrorCodes, type RequestOptions } from "@worldcoin/idkit-core";

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

/** Bound both request creation and polling by the same flow deadline. */
export async function beforeDeadline<T>(
  operation: (options: RequestOptions) => Promise<T>,
  deadline: number,
  signal: AbortSignal,
): Promise<T | null> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    // Do not catch operation failures: the existing hook error mapper owns them.
    // Promise.race also observes late rejections after cancellation or timeout.
    const result = await Promise.race([
      Promise.resolve().then(() =>
        signal.aborted || Date.now() >= deadline
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
        onAbort = () => {
          resolve(null);
          controller.abort();
        };
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) onAbort();
      }),
    ]);
    ensureNotAborted(signal);
    return Date.now() >= deadline ? null : result;
  } finally {
    clearTimeout(timer);
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

export async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  ensureNotAborted(signal);
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
    const messageCode =
      asKnownErrorCode(message) ?? errorCodeFromMessage(message);
    if (messageCode) {
      return messageCode;
    }
  }

  return IDKitErrorCodes.GenericError;
}
