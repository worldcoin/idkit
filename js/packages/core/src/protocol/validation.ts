import type { BuilderConfig } from "../types/protocol";
import { parseUrl } from "../lib/url";

/** BN254 scalar / BabyJubJub base field, as used by world-id-primitives. */
export const FIELD_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export function invalidConfiguration(message: string): never {
  throw new Error(`Invalid configuration: ${message}`);
}

export function unsignedInteger(
  value: unknown,
  name: string,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > max
  ) {
    return invalidConfiguration(`${name} must be an unsigned integer`);
  }
  return value;
}

export function fieldElement(value: unknown, name: string): string {
  // Rust trim_start_matches deliberately accepts more than one lowercase 0x prefix.
  const hex = typeof value === "string" ? value.replace(/^(?:0x)+/, "") : "";
  if (!/^[\da-fA-F]{64}$/.test(hex) || BigInt(`0x${hex}`) >= FIELD_MODULUS) {
    return invalidConfiguration(`Invalid ${name} format`);
  }
  return `0x${hex.toLowerCase()}`;
}

export function sessionId(value: unknown): `session_${string}` {
  if (typeof value !== "string" || !/^session_[\da-fA-F]{128}$/.test(value)) {
    return invalidConfiguration("Invalid session_id format");
  }
  const hex = value.slice(8);
  fieldElement(hex.slice(0, 64), "session_id");
  fieldElement(hex.slice(64), "session_id");
  if (hex.slice(64, 66) !== "01")
    return invalidConfiguration("Invalid session_id format");
  return `session_${hex.toLowerCase()}`;
}

export function normalizeSignature(value: unknown): string {
  const hex = typeof value === "string" ? value.replace(/^0x/, "") : "";
  if (!/^[\da-fA-F]{130}$/.test(hex))
    return invalidConfiguration("Invalid signature");
  const v = parseInt(hex.slice(-2), 16);
  if (v !== 0 && v !== 1 && v !== 27 && v !== 28 && v < 35) {
    return invalidConfiguration("Invalid signature");
  }
  const parity = v <= 1 ? v : (v - 27) % 2;
  return `0x${hex.slice(0, 128).toLowerCase()}${(27 + parity).toString(16)}`;
}

export function normalizeRpId(value: unknown): string {
  const hex =
    typeof value === "string" && value.startsWith("rp_") ? value.slice(3) : "";
  if (!/^\+?[\da-fA-F]+$/.test(hex))
    return invalidConfiguration("Invalid RP ID: must start with 'rp_'");
  const number = BigInt(`0x${hex.replace(/^\+/, "")}`);
  if (number > 0xffffffffffffffffn)
    return invalidConfiguration("Invalid RP ID: must start with 'rp_'");
  return `rp_${number.toString(16).padStart(16, "0")}`;
}

export function validateBridgeUrl(value: string, appId: string): void {
  let url: ReturnType<typeof parseUrl>;
  try {
    url = parseUrl(value);
  } catch {
    return invalidConfiguration("Failed to parse Bridge URL");
  }
  const host = url.hostname.toLowerCase();
  const octets = url.hostKind === "ipv4" ? host.split(".").map(Number) : [];
  const devHost =
    (url.hostKind === "domain" &&
      (host === "localhost" || host.endsWith(".local"))) ||
    (url.hostKind === "ipv6" && host === "[::1]") ||
    octets[0] === 127 ||
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
  if (appId.startsWith("app_staging_") && devHost) return;
  const errors: string[] = [];
  if (url.protocol !== "https:") errors.push("Bridge URL must use HTTPS.");
  if (url.port !== "")
    errors.push("Bridge URL must use the default port (443).");
  if (url.pathname !== "" && url.pathname !== "/")
    errors.push("Bridge URL must not have a path.");
  if (url.hasQuery) errors.push("Bridge URL must not have query parameters.");
  if (url.hasFragment) errors.push("Bridge URL must not have a fragment.");
  if (errors.length) invalidConfiguration(errors.join(" "));
}

export function validateConfig(
  config: BuilderConfig,
  now = Math.floor(Date.now() / 1000),
): void {
  const rp = config.rp_context;
  if (!rp) return invalidConfiguration("rp_context is required");
  normalizeRpId(rp.rp_id);
  for (const [name, value] of Object.entries({
    nonce: rp.nonce,
    signature: rp.signature,
    package_name: config.package_name,
    package_version: config.package_version,
  })) {
    if (typeof value !== "string")
      invalidConfiguration(`${name} must be a string`);
  }
  if (!["request", "createSession", "proveSession"].includes(config.type))
    invalidConfiguration("Invalid request kind");
  if (config.type === "request" && typeof config.action !== "string")
    invalidConfiguration("action must be a string");
  for (const [name, value] of Object.entries({
    action_description: config.action_description,
    bridge_url: config.bridge_url,
    return_to: config.return_to,
    override_connect_base_url: config.override_connect_base_url,
    environment: config.environment,
  })) {
    if (value != null && typeof value !== "string")
      invalidConfiguration(`${name} must be a string`);
  }
  for (const [name, value] of Object.entries({
    allow_legacy_proofs: config.allow_legacy_proofs,
    require_user_presence: config.require_user_presence,
  })) {
    if (value !== undefined && typeof value !== "boolean")
      invalidConfiguration(`${name} must be a boolean`);
  }
  unsignedInteger(rp.created_at, "created_at");
  unsignedInteger(rp.expires_at, "expires_at");
  if (rp.created_at > now + 60)
    invalidConfiguration("created_at cannot be in the future");
  if (rp.created_at >= rp.expires_at)
    invalidConfiguration("expires_at must be greater than created_at");
  if (typeof config.app_id !== "string" || !config.app_id.startsWith("app_")) {
    invalidConfiguration("app_id must start with 'app_'");
  }
  if (config.bridge_url != null)
    validateBridgeUrl(config.bridge_url, config.app_id);
}

export function timestamp(seconds: number): string {
  const date = new Date(seconds * 1000);
  if (!Number.isFinite(date.valueOf()) || date.getUTCFullYear() > 9999) {
    return invalidConfiguration("Invalid timestamp");
  }
  return date.toISOString().replace(/\.000Z$/, "Z");
}
