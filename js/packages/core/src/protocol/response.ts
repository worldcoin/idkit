import { normalizeUtf16 } from "../lib/encoding";
import {
  assertJsonIntegerFields,
  assertUniqueJsonFields,
} from "../lib/bridge-json";
import type {
  IDKitResult,
  IntegrityBundle,
  ProofResponseToIDKitResultOptions,
} from "../types/protocol";
import { fieldElement, sessionId, unsignedInteger } from "./validation";

export const APP_ERROR_CODES = [
  "user_rejected",
  "verification_rejected",
  "credential_unavailable",
  "feature_unavailable",
  "world_id_4_not_available",
  "world_id_3_not_available",
  "malformed_request",
  "invalid_network",
  "inclusion_proof_pending",
  "inclusion_proof_failed",
  "unexpected_response",
  "connection_failed",
  "max_verifications_reached",
  "failed_by_host_app",
  "user_presence_failed",
  "invalid_rp_signature",
  "nullifier_replayed",
  "duplicate_nonce",
  "unknown_rp",
  "inactive_rp",
  "timestamp_too_old",
  "timestamp_too_far_in_future",
  "invalid_timestamp",
  "rp_signature_expired",
  "identity_attributes_not_matched",
  "generic_error",
] as const;
const APP_ERRORS = new Set<string>(APP_ERROR_CODES);

export function appErrorCode(value: string, protocol = true): string {
  if (value === "identity_attribute_mismatch")
    return "identity_attributes_not_matched";
  if (protocol && value === "nullifier_replay") return "nullifier_replayed";
  return APP_ERRORS.has(value) ? value : "generic_error";
}

/** JSON.parse accepts isolated surrogate escapes that serde_json rejects. */
export function validateWireStrings(value: unknown): void {
  const pending: unknown[] = [value];
  while (pending.length) {
    const current = pending.pop();
    if (typeof current === "string") {
      if (normalizeUtf16(current) !== current) unexpected();
    } else if (Array.isArray(current)) {
      for (const child of current) pending.push(child);
    } else if (current != null && typeof current === "object") {
      for (const [key, child] of Object.entries(current)) {
        if (normalizeUtf16(key) !== key) unexpected();
        pending.push(child);
      }
    }
  }
}

function unexpected(): never {
  throw new Error("unexpected_response");
}
function object(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value))
    return unexpected();
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== "string") return unexpected();
  return normalizeUtf16(value);
}
function optionalString(value: unknown): string | undefined {
  return value == null ? undefined : string(value);
}
function optionalBool(value: unknown): boolean | undefined {
  if (value == null) return undefined;
  if (typeof value !== "boolean") return unexpected();
  return value;
}
function userPresence(value: unknown): boolean {
  if (value === undefined) return false;
  if (typeof value !== "boolean") return unexpected();
  return value;
}
function integer(value: unknown): number {
  try {
    return unsignedInteger(value, "response value");
  } catch {
    return unexpected();
  }
}
function field(value: unknown): string {
  try {
    return fieldElement(value, "field element");
  } catch {
    return unexpected();
  }
}
function optionalSession(value: unknown): string | undefined {
  if (value == null) return undefined;
  try {
    return sessionId(value);
  } catch {
    return unexpected();
  }
}

interface ProtocolItem {
  identifier: string;
  issuer_schema_id: number;
  proof: string[];
  nullifier?: string;
  session_nullifier?: string[];
  expires_at_min: number;
  claims?: string[];
}
interface ProtocolResponse {
  id: string;
  version: 1;
  session_id?: string;
  error?: string;
  responses: ProtocolItem[];
}

function parseProof(value: unknown): string[] {
  // The protocol carries five compressed big-endian U256 words, without a 0x prefix.
  const encoded = string(value);
  if (!/^[\da-fA-F]{320}$/.test(encoded)) return unexpected();
  return Array.from({ length: 5 }, (_, i) =>
    BigInt(`0x${encoded.slice(i * 64, (i + 1) * 64)}`).toString(10),
  );
}
function parseNullifier(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string" || !/^nil_[\da-f]{64}$/.test(value))
    return unexpected();
  return field(value.slice(4));
}
function parseSessionNullifier(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string" || !/^snil_[\da-fA-F]{128}$/.test(value))
    return unexpected();
  const hex = value.slice(5);
  if (hex.slice(64, 66) !== "02") return unexpected();
  return [field(hex.slice(0, 64)), field(hex.slice(64))];
}
function parseProtocolItem(
  value: unknown,
  checkDuplicates: boolean,
): ProtocolItem {
  const item = object(value);
  assertJsonIntegerFields(item, ["issuer_schema_id", "expires_at_min"]);
  if (checkDuplicates)
    assertUniqueJsonFields(item, [
      "identifier",
      "issuer_schema_id",
      "proof",
      "nullifier",
      "session_nullifier",
      "expires_at_min",
      "claims",
    ]);
  let claims: string[] | undefined;
  if (item.claims != null) {
    if (!Array.isArray(item.claims)) return unexpected();
    claims = item.claims.map(field);
  }
  return {
    identifier: string(item.identifier),
    issuer_schema_id: integer(item.issuer_schema_id),
    proof: parseProof(item.proof),
    nullifier: parseNullifier(item.nullifier),
    session_nullifier: parseSessionNullifier(item.session_nullifier),
    expires_at_min: integer(item.expires_at_min),
    claims,
  };
}
function parseProtocolResponse(
  value: unknown,
  checkDuplicates = true,
): ProtocolResponse {
  const response = object(value);
  assertJsonIntegerFields(response, ["version"]);
  if (checkDuplicates)
    assertUniqueJsonFields(response, [
      "id",
      "version",
      "session_id",
      "error",
      "responses",
    ]);
  if (response.version !== 1 || !Array.isArray(response.responses))
    return unexpected();
  return {
    id: string(response.id),
    version: 1,
    session_id: optionalSession(response.session_id),
    error: optionalString(response.error),
    responses: response.responses.map((item) =>
      parseProtocolItem(item, checkDuplicates),
    ),
  };
}

function signalHash(
  hashes: Record<string, string> | undefined,
  identifier: string,
): string | undefined {
  return hashes != null &&
    Object.prototype.hasOwnProperty.call(hashes, identifier)
    ? hashes[identifier]
    : undefined;
}

function responseOptions(
  options: ProofResponseToIDKitResultOptions,
): ProofResponseToIDKitResultOptions {
  const normalized = {
    nonce: string(options.nonce),
    action: optionalString(options.action),
    action_description: optionalString(options.action_description),
    environment: options.environment ?? "production",
    signal_hashes: Object.fromEntries(
      Object.entries(object(options.signal_hashes ?? {})).map(
        ([key, value]) => [normalizeUtf16(key), string(value)],
      ),
    ),
    identity_attested: optionalBool(options.identity_attested),
    user_presence_completed: optionalBool(options.user_presence_completed),
  };
  if (!["production", "staging", "sandbox"].includes(normalized.environment))
    return unexpected();
  for (const hash of Object.values(object(normalized.signal_hashes)))
    string(hash);
  return normalized;
}

function convertProtocolResponse(
  response: ProtocolResponse,
  options: ProofResponseToIDKitResultOptions,
): IDKitResult {
  if (response.error != null) throw new Error(appErrorCode(response.error));
  const context = responseOptions(options);
  const responses = response.responses.map((item) => {
    const selfie = item.issuer_schema_id === 11;
    const identifier =
      selfie && item.identifier === "face" ? "selfie" : item.identifier;
    const cachedSignalHash =
      signalHash(context.signal_hashes, identifier) ??
      signalHash(context.signal_hashes, item.identifier);
    let sybilScore: number | undefined;
    if (selfie) {
      if (!item.claims?.length) return unexpected();
      const score = BigInt(item.claims[0]!);
      // Rust's JS serializer rejects u64 values that cannot be represented exactly.
      if (score > BigInt(Number.MAX_SAFE_INTEGER)) return unexpected();
      sybilScore = Number(score);
    }
    if (item.session_nullifier == null && item.nullifier == null)
      return unexpected();
    return {
      identifier,
      ...(cachedSignalHash == null ? {} : { signal_hash: cachedSignalHash }),
      issuer_schema_id: item.issuer_schema_id,
      proof: item.proof,
      ...(item.session_nullifier == null
        ? { nullifier: item.nullifier! }
        : { session_nullifier: item.session_nullifier }),
      expires_at_min: item.expires_at_min,
      ...(sybilScore == null ? {} : { sybil_score: sybilScore }),
    };
  });
  return {
    protocol_version: "4.0",
    nonce: context.nonce,
    ...(response.session_id == null
      ? context.action == null
        ? {}
        : { action: context.action }
      : { session_id: response.session_id }),
    ...(context.action_description == null
      ? {}
      : { action_description: context.action_description }),
    responses,
    ...(context.user_presence_completed == null
      ? {}
      : { user_presence_completed: context.user_presence_completed }),
    environment: context.environment!,
    ...(response.session_id == null && context.identity_attested != null
      ? { identity_attested: context.identity_attested }
      : {}),
  } as IDKitResult;
}

/** Decode the protocol wire response using the same contract as the Rust core. */
export function proofResponseToIDKitResult(
  payload: unknown,
  options: ProofResponseToIDKitResultOptions,
): IDKitResult {
  return convertProtocolResponse(parseProtocolResponse(payload), options);
}

export interface BridgeResponseContext extends ProofResponseToIDKitResultOptions {
  legacy_signal_hash: string;
  require_user_presence?: boolean;
}
export type BridgeResponseStatus =
  | { type: "confirmed"; result: IDKitResult }
  | { type: "failed"; error: string };

interface LegacyItem {
  proof: string;
  merkle_root: string;
  nullifier_hash: string;
  verification_level: string;
}
function parseLegacyItem(value: unknown): LegacyItem {
  const item = object(value);
  assertUniqueJsonFields(item, [
    "proof",
    "merkle_root",
    "nullifier_hash",
    "verification_level",
    "credential_type",
  ]);
  const levels = ["orb", "face", "device", "document", "secure_document"];
  const verify = optionalString(item.verification_level);
  const credential = optionalString(item.credential_type);
  // Both optional enum fields deserialize, even when verification_level wins.
  if (
    (verify != null && !levels.includes(verify)) ||
    (credential != null && !levels.includes(credential))
  )
    return unexpected();
  const level = verify ?? credential;
  if (level == null) return unexpected();
  return {
    proof: string(item.proof),
    merkle_root: string(item.merkle_root),
    nullifier_hash: string(item.nullifier_hash),
    verification_level: level,
  };
}
function parseIntegrityBundle(value: unknown): IntegrityBundle | undefined {
  if (value == null) return undefined;
  const bundle = object(value);
  assertJsonIntegerFields(bundle, ["version", "timestamp"]);
  assertUniqueJsonFields(bundle, [
    "version",
    "signature_format",
    "timestamp",
    "signature",
    "jwt",
  ]);
  const version = integer(bundle.version);
  if (
    version > 255 ||
    !["apple_app_attest", "android_keystore"].includes(
      string(bundle.signature_format),
    )
  )
    return unexpected();
  return {
    version,
    signature_format:
      bundle.signature_format as IntegrityBundle["signature_format"],
    timestamp: integer(bundle.timestamp),
    signature: string(bundle.signature),
    jwt: string(bundle.jwt),
  };
}

type ParsedBridgeResponse =
  | { kind: "error"; error: string }
  | {
      kind: "protocol";
      response: ProtocolResponse;
      presence: boolean;
      identity?: boolean;
      integrity?: IntegrityBundle;
    }
  | {
      kind: "legacy";
      responses: LegacyItem[];
      multi: boolean;
      presence: boolean;
      identity?: boolean;
      integrity?: IntegrityBundle;
    };

function parseBridgeResponse(payload: unknown): ParsedBridgeResponse {
  const value = object(payload);
  // Rust uses an untagged enum: attempt each complete shape in declaration order.
  if (typeof value.error_code === "string") {
    try {
      assertUniqueJsonFields(value, ["error_code"]);
      return { kind: "error", error: appErrorCode(value.error_code, false) };
    } catch {
      /* next enum variant */
    }
  }
  try {
    assertUniqueJsonFields(value, ["user_presence_completed"]);
    return {
      kind: "protocol",
      response: parseProtocolResponse(value),
      presence: userPresence(value.user_presence_completed),
    };
  } catch {
    /* next enum variant */
  }
  try {
    assertUniqueJsonFields(value, [
      "proof_response",
      "user_presence_completed",
      "identity_attested",
      "integrity_bundle",
    ]);
    return {
      kind: "protocol",
      // Rust's claims-aware wrapper first reads serde_json::Value, retaining
      // the last duplicate field throughout this nested protocol subtree.
      response: parseProtocolResponse(value.proof_response, false),
      presence: userPresence(value.user_presence_completed),
      identity: optionalBool(value.identity_attested),
      integrity: parseIntegrityBundle(value.integrity_bundle),
    };
  } catch {
    /* next enum variant */
  }
  if (Array.isArray(value.legacy_responses)) {
    try {
      assertUniqueJsonFields(value, [
        "legacy_responses",
        "user_presence_completed",
        "identity_attested",
        "integrity_bundle",
      ]);
      return {
        kind: "legacy",
        responses: value.legacy_responses.map(parseLegacyItem),
        multi: true,
        presence: userPresence(value.user_presence_completed),
        identity: optionalBool(value.identity_attested),
        integrity: parseIntegrityBundle(value.integrity_bundle),
      };
    } catch {
      /* next enum variant */
    }
  }
  assertUniqueJsonFields(value, [
    "user_presence_completed",
    "identity_attested",
    "integrity_bundle",
  ]);
  return {
    kind: "legacy",
    responses: [parseLegacyItem(value)],
    multi: false,
    presence: userPresence(value.user_presence_completed),
    identity: optionalBool(value.identity_attested),
    integrity: parseIntegrityBundle(value.integrity_bundle),
  };
}

/** Convert a decrypted bridge response. Malformed wire shapes throw; app failures return a failed status. */
export function bridgeResponseToResult(
  payload: unknown,
  context: BridgeResponseContext,
): BridgeResponseStatus {
  const parsed = parseBridgeResponse(payload);
  if (parsed.kind === "error") return { type: "failed", error: parsed.error };
  if (parsed.kind === "protocol" && parsed.response.error != null)
    return { type: "failed", error: appErrorCode(parsed.response.error) };
  if (context.require_user_presence === true && !parsed.presence)
    return { type: "failed", error: "user_presence_failed" };
  const options = {
    ...context,
    identity_attested: parsed.identity,
    user_presence_completed:
      context.require_user_presence === true ? parsed.presence : undefined,
  };
  let result: IDKitResult;
  if (parsed.kind === "protocol")
    result = convertProtocolResponse(parsed.response, options);
  else {
    const normalized = responseOptions(options);
    result = {
      protocol_version: "3.0",
      nonce: normalized.nonce,
      ...(normalized.action == null ? {} : { action: normalized.action }),
      ...(normalized.action_description == null
        ? {}
        : { action_description: normalized.action_description }),
      responses: parsed.responses.map((item) => ({
        identifier:
          item.verification_level === "face"
            ? "selfie"
            : item.verification_level,
        signal_hash:
          (parsed.multi
            ? signalHash(normalized.signal_hashes, item.verification_level)
            : undefined) ?? context.legacy_signal_hash,
        proof: item.proof,
        merkle_root: item.merkle_root,
        nullifier: item.nullifier_hash,
      })),
      ...(normalized.user_presence_completed == null
        ? {}
        : { user_presence_completed: normalized.user_presence_completed }),
      environment: normalized.environment!,
      ...(parsed.identity == null
        ? {}
        : { identity_attested: parsed.identity }),
    } as IDKitResult;
  }
  if (parsed.integrity != null) result.integrity_bundle = parsed.integrity;
  return { type: "confirmed", result };
}
