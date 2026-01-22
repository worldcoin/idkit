/**
 * Platform detection utilities
 *
 * These functions help detect the runtime environment (React Native, Web, Node.js)
 * to enable platform-specific behavior or warnings.
 */

/**
 * Checks if the code is running in React Native environment
 * @returns true if running in React Native, false otherwise
 */
export const isReactNative = (): boolean => {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.product === "string" &&
    navigator.product === "ReactNative"
  );
};

/**
 * Checks if the code is running in a web browser environment
 * @returns true if running in a browser, false otherwise
 */
export const isWeb = (): boolean => {
  return (
    typeof window !== "undefined" && typeof window.document !== "undefined"
  );
};

/**
 * Checks if the code is running in Node.js environment
 * @returns true if running in Node.js, false otherwise
 */
export const isNode = (): boolean => {
  return (
    typeof process !== "undefined" &&
    typeof process.versions !== "undefined" &&
    typeof process.versions.node !== "undefined"
  );
};

/**
 * Checks if the code is running in a server-side environment
 * Supports Node.js, Deno, Bun, and Cloudflare Workers
 * @returns true if running in a server environment, false otherwise
 */
export const isServerEnvironment = (): boolean => {
  // Node.js
  if (typeof process !== "undefined" && process.versions?.node) {
    return true;
  }
  // Deno
  if (typeof (globalThis as any).Deno !== "undefined") {
    return true;
  }
  // Bun
  if (typeof (globalThis as any).Deno !== "undefined") {
    return true;
  }

  return false;
};
