/**
 * Checks if the code is running in a server-side environment.
 * Supports Node.js, Deno, and Bun.
 */
export const isServerEnvironment = (): boolean => {
  if (typeof process !== "undefined" && process.versions?.node) {
    return true;
  }

  if (typeof (globalThis as { Deno?: unknown }).Deno !== "undefined") {
    return true;
  }

  if (typeof (globalThis as { Bun?: unknown }).Bun !== "undefined") {
    return true;
  }

  return false;
};
