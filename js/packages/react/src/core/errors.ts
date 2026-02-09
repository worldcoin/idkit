export class IDKitFlowError extends Error {
  code?: string;

  constructor(message: string, options?: { code?: string; cause?: unknown }) {
    super(message);
    this.name = "IDKitFlowError";
    this.code = options?.code;
    if (options?.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string") {
    return new Error(error);
  }

  return new Error("Unknown IDKit error");
}
