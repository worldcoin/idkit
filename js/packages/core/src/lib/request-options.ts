/** Network options for request creation and a single bridge poll. */
export interface RequestOptions {
  /** Total time for this operation, including its response body (default: 30000 ms). */
  timeout?: number;
  /** Cancels the operation and its underlying fetch. */
  signal?: AbortSignal;
}

export function checkRequestOptions(options?: RequestOptions): void {
  if (options?.signal?.aborted) throw new Error("cancelled");
  const timeout = options?.timeout ?? 30_000;
  if (!Number.isFinite(timeout) || timeout < 0)
    throw new RangeError("timeout must be a finite, non-negative number");
  if (timeout === 0) throw new Error("timeout");
}

/** Bound fetch AND body reads, even when a custom adapter ignores cancellation. */
export async function withRequestTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options?: RequestOptions,
): Promise<T> {
  checkRequestOptions(options);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    const stopped = new Promise<never>((_, reject) => {
      const stop = (reason: string) => {
        reject(new Error(reason));
        controller.abort();
      };
      timer = setTimeout(() => stop("timeout"), options?.timeout ?? 30_000);
      onAbort = () => stop("cancelled");
      options?.signal?.addEventListener("abort", onAbort, { once: true });
    });
    // Start synchronously so caller-owned configuration is snapshotted before await.
    return await Promise.race([stopped, operation(controller.signal)]);
  } finally {
    clearTimeout(timer);
    if (onAbort) options?.signal?.removeEventListener("abort", onAbort);
  }
}
