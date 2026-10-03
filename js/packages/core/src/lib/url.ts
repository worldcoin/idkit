import {
  parseURL,
  serializeHost,
  serializePath,
  serializeURL,
} from "whatwg-url/lib/url-state-machine.js";
import { normalizeUtf16 } from "./encoding";

/**
 * Use the pinned WHATWG parser directly, including IDNA, on every host. The
 * build replaces only its UTF-8 adapter with url-encoding.ts. This avoids
 * incomplete React Native URL globals without installing global polyfills.
 */
export function parseUrl(value: string): {
  protocol: string;
  hostname: string;
  hostKind: "domain" | "ipv4" | "ipv6" | "none";
  port: string;
  pathname: string;
  href: string;
  hasQuery: boolean;
  hasFragment: boolean;
} {
  const parsed = parseURL(normalizeUtf16(value));
  if (parsed == null) throw new TypeError("Invalid URL");
  return {
    protocol: `${parsed.scheme}:`,
    hostname: parsed.host == null ? "" : serializeHost(parsed.host),
    hostKind:
      parsed.host == null
        ? "none"
        : typeof parsed.host === "number"
          ? "ipv4"
          : Array.isArray(parsed.host)
            ? "ipv6"
            : "domain",
    port: parsed.port == null ? "" : String(parsed.port),
    pathname: serializePath(parsed),
    href: serializeURL(parsed),
    hasQuery: parsed.query !== null,
    hasFragment: parsed.fragment !== null,
  };
}

export function resolveBridgeEndpoint(bridge: string, path: string): string {
  const baseURL = parseURL(normalizeUtf16(bridge));
  if (baseURL == null) throw new TypeError("Invalid bridge URL");
  const parsed = parseURL(normalizeUtf16(path), { baseURL });
  if (parsed == null) throw new TypeError("Invalid bridge path");
  return serializeURL(parsed);
}
