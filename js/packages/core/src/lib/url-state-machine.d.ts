/** Narrow declarations for the pinned whatwg-url parser used by the SDK. */
declare module "whatwg-url/lib/url-state-machine.js" {
  export interface URLRecord {
    scheme: string;
    username: string;
    password: string;
    host: string | number | number[] | null;
    port: number | null;
    path: string[] | string;
    query: string | null;
    fragment: string | null;
  }
  export function parseURL(
    input: string,
    options?: { baseURL?: URLRecord },
  ): URLRecord | null;
  export function serializeURL(url: URLRecord): string;
  export function serializeHost(host: Exclude<URLRecord["host"], null>): string;
  export function serializePath(url: URLRecord): string;
}
