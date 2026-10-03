/** Host capabilities required by the portable SDK. No host APIs run at import time. */
export interface IDKitRuntimeOptions {
  /** Must fill the entire array with cryptographically secure random bytes. */
  getRandomValues?: (bytes: Uint8Array) => Uint8Array;
  fetch?: typeof globalThis.fetch;
}

let options: IDKitRuntimeOptions = {};
let defaultRandomValues: IDKitRuntimeOptions["getRandomValues"];

/** Configure host capabilities, e.g. Expo Crypto.getRandomValues. Pass {} to reset. */
export function configureIDKitRuntime(runtime: IDKitRuntimeOptions): void {
  options = { ...runtime };
}

/** Platform entries supply a fallback without changing explicit configuration. */
export function setDefaultRandomValues(
  provider: NonNullable<IDKitRuntimeOptions["getRandomValues"]>,
): void {
  defaultRandomValues = provider;
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const provider =
    options.getRandomValues ??
    (globalThis.crypto?.getRandomValues
      ? (value: Uint8Array) => globalThis.crypto.getRandomValues(value)
      : defaultRandomValues);
  if (!provider) {
    throw new Error(
      "IDKit requires cryptographically secure randomness. Supply getRandomValues using configureIDKitRuntime().",
    );
  }
  const result = provider(bytes);
  if (!(result instanceof Uint8Array) || result.length !== length) {
    throw new Error("IDKit getRandomValues must return the filled Uint8Array.");
  }
  return result;
}

export function randomRequestId(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function fetchBridge(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const fetch = options.fetch ?? globalThis.fetch;
  if (!fetch)
    throw new Error(
      "IDKit requires fetch. Supply it using configureIDKitRuntime().",
    );
  return fetch(input, init);
}
