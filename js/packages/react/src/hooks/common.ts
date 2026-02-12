import { IDKitErrorCodes } from "@worldcoin/idkit-core";

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

const knownErrorCodes = new Set<string>(Object.values(IDKitErrorCodes));

function asKnownErrorCode(value: unknown): IDKitErrorCodes | null {
  if (typeof value === "string" && knownErrorCodes.has(value)) {
    return value as IDKitErrorCodes;
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

  return IDKitErrorCodes.GenericError;
}
