import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { hashSignal, hashToField } from "../lib/hashing";
import { encodeUtf8, normalizeUtf16 } from "../lib/encoding";
import type {
  BuilderConfig,
  ConstraintNode,
  CredentialRequestType,
  IdentityAttribute,
  Preset,
} from "../types/protocol";
import {
  fieldElement,
  invalidConfiguration,
  normalizeRpId,
  normalizeSignature,
  sessionId,
  timestamp,
  unsignedInteger,
  validateConfig,
} from "./validation";

export type RequestSelection =
  | { preset: Preset }
  | { constraints: ConstraintNode };
export interface CompileOptions {
  nativeVersion?: 1 | 2;
  requestId?: string;
  now?: number;
}
export interface CompiledRequest {
  payload: Record<string, unknown>;
  signal_hashes: Record<string, string>;
  legacy_signal_hash: string;
}

/** Snapshot the strings that the former WASM boundary converted into owned Rust values. */
export function normalizeBuilderConfig(config: BuilderConfig): BuilderConfig {
  const normalizeStrings = <T extends object>(value: T): T =>
    Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        typeof item === "string" ? normalizeUtf16(item) : item,
      ]),
    ) as T;
  return {
    ...normalizeStrings(config),
    rp_context: config.rp_context && normalizeStrings(config.rp_context),
  };
}
type Expression =
  | { any: Array<Expression | string> }
  | { all: Array<Expression | string> }
  | { enumerate: Array<Expression | string> };
export const CREDENTIAL_SCHEMA_IDS = {
  proof_of_human: 1,
  selfie: 11,
  passport: 9303,
  mnc: 9310,
} as const;

function signalBytes(
  signal: string | Uint8Array,
  serialized: boolean,
): Uint8Array {
  if (signal instanceof Uint8Array) return signal;
  if (typeof signal !== "string") return invalidConfiguration("Invalid signal");
  if (
    signal.startsWith("0x") &&
    ((serialized && signal === "0x") ||
      /^(?:[\da-fA-F]{2})+$/.test(signal.slice(2)))
  ) {
    return hexToBytes(signal.slice(2));
  }
  return encodeUtf8(signal);
}

// ConstraintNode is an untagged Rust enum. A malformed item can still parse as
// another variant, and structure validation happens only after deserialization.
function parseConstraints(
  value: ConstraintNode,
  serialized: boolean,
): ConstraintNode {
  if (!value || typeof value !== "object")
    return invalidConfiguration("Invalid constraints");
  if (
    "type" in value &&
    Object.prototype.hasOwnProperty.call(CREDENTIAL_SCHEMA_IDS, value.type)
  ) {
    try {
      const item = value as CredentialRequestType;
      if (item.signal != null) signalBytes(item.signal, serialized);
      if (item.genesis_issued_at_min != null)
        unsignedInteger(item.genesis_issued_at_min, "genesis_issued_at_min");
      if (item.expires_at_min != null)
        unsignedInteger(item.expires_at_min, "expires_at_min");
      return {
        type: item.type,
        signal: item.signal,
        genesis_issued_at_min: item.genesis_issued_at_min,
        expires_at_min: item.expires_at_min,
      };
    } catch {
      /* Try the next untagged variant. */
    }
  }
  for (const kind of ["any", "all", "enumerate"] as const) {
    const children = (value as unknown as Record<string, unknown>)[kind];
    if (Array.isArray(children)) {
      try {
        return {
          [kind]: children.map((child) => parseConstraints(child, serialized)),
        } as ConstraintNode;
      } catch {
        /* Try the next untagged variant. */
      }
    }
  }
  return invalidConfiguration("Invalid constraints");
}

function compileConstraints(
  node: ConstraintNode,
  serialized: boolean,
  hashes: Record<string, string>,
): { items: Record<string, unknown>[]; expression?: Expression } {
  const items: Record<string, unknown>[] = [];
  function visit(value: ConstraintNode): Expression | string {
    if (!value || typeof value !== "object")
      return invalidConfiguration("Invalid constraints");
    if (
      "type" in value &&
      Object.prototype.hasOwnProperty.call(CREDENTIAL_SCHEMA_IDS, value.type)
    ) {
      const item = value as CredentialRequestType;
      const wire: Record<string, unknown> = {
        identifier: item.type,
        issuer_schema_id: CREDENTIAL_SCHEMA_IDS[item.type],
        genesis_issued_at_min:
          item.genesis_issued_at_min == null
            ? null
            : unsignedInteger(
                item.genesis_issued_at_min,
                "genesis_issued_at_min",
              ),
        expires_at_min:
          item.expires_at_min == null
            ? null
            : unsignedInteger(item.expires_at_min, "expires_at_min"),
      };
      if (item.signal != null) {
        const bytes = signalBytes(item.signal, serialized);
        wire.signal = `0x${bytesToHex(bytes)}`;
        hashes[item.type] = hashSignal(bytes);
      }
      items.push(wire);
      return item.type;
    }
    for (const kind of ["any", "all", "enumerate"] as const) {
      if (kind in value) {
        const children = (value as unknown as Record<string, unknown>)[kind];
        if (!Array.isArray(children))
          return invalidConfiguration("Invalid constraints");
        if (!children.length)
          return invalidConfiguration(
            `${kind[0]!.toUpperCase()}${kind.slice(1)} constraint must have at least one child`,
          );
        return { [kind]: children.map(visit) } as Expression;
      }
    }
    return invalidConfiguration("Invalid constraints");
  }
  const expression = visit(parseConstraints(node, serialized));
  return { items, ...(typeof expression === "string" ? {} : { expression }) };
}

function identityAttributes(values: IdentityAttribute[]): IdentityAttribute[] {
  if (!Array.isArray(values))
    return invalidConfiguration("Invalid identity attributes");
  return values.map((attribute) => {
    const { type, value } = attribute;
    if (type === "minimum_age") unsignedInteger(value, "minimum_age", 255);
    else if (typeof value !== "string")
      return invalidConfiguration(`expected string value for ${type}`);
    else if (type === "document_type") {
      if (!["passport", "eid", "mnc"].includes(value))
        return invalidConfiguration("Invalid document_type");
    } else if (
      ![
        "document_number",
        "issuing_country",
        "full_name",
        "nationality",
      ].includes(type)
    ) {
      return invalidConfiguration(`unknown identity attribute type: ${type}`);
    }
    return {
      type,
      value: typeof value === "string" ? normalizeUtf16(value) : value,
    } as IdentityAttribute;
  });
}

export function compileRequest(
  config: BuilderConfig,
  selection: RequestSelection,
  options: CompileOptions = {},
): CompiledRequest {
  validateConfig(config, options.now);
  config = normalizeBuilderConfig(config);
  let constraints: ConstraintNode | undefined;
  let legacyLevel = "device";
  let legacySignal = "";
  let attributes: IdentityAttribute[] | undefined;
  let allowLegacy =
    config.type === "request" && (config.allow_legacy_proofs ?? false);
  const presetMode = "preset" in selection;
  if (presetMode) {
    if (config.type !== "request")
      throw new Error(
        "Presets are not supported for session flows. Use .constraints() instead.",
      );
    const preset = selection.preset;
    if (options.nativeVersion === 1 && preset.type === "SelfieCheck") {
      throw new Error(
        "The SelfieCheck preset is not supported by nativePayloadV1FromPreset. Use nativePayloadFromPreset instead.",
      );
    }
    if (options.nativeVersion === 1 && preset.type === "IdentityCheck") {
      throw new Error(
        "IdentityCheck presets are not supported for nativePayloadV1FromPreset. Use nativePayloadFromPreset with a World ID 4.0-compatible client instead.",
      );
    }
    const signal =
      preset.type === "IdentityCheck" ? preset.legacy_signal : preset.signal;
    if (signal != null && typeof signal !== "string")
      return invalidConfiguration("Invalid preset signal");
    legacySignal = signal == null ? "" : normalizeUtf16(signal);
    const item = (
      type: CredentialRequestType["type"],
    ): CredentialRequestType => ({
      type,
      ...(signal == null ? {} : { signal }),
    });
    switch (preset.type) {
      case "OrbLegacy":
        legacyLevel = "orb";
        break;
      case "SecureDocumentLegacy":
        legacyLevel = "secure_document";
        break;
      case "DocumentLegacy":
        legacyLevel = "document";
        break;
      case "SelfieCheckLegacy":
        legacyLevel = "face";
        break;
      case "DeviceLegacy":
        break;
      case "SelfieCheck":
        constraints = item("selfie");
        allowLegacy = false;
        break;
      case "ProofOfHuman":
        constraints = item("proof_of_human");
        legacyLevel = "orb";
        allowLegacy = true;
        break;
      case "Passport":
        constraints = item("passport");
        legacyLevel = "document";
        allowLegacy = true;
        break;
      case "Mnc":
        constraints = item("mnc");
        legacyLevel = "document";
        allowLegacy = true;
        break;
      case "IdentityCheck":
        constraints = { any: [item("passport"), item("mnc")] };
        legacyLevel = "document";
        allowLegacy = true;
        attributes = identityAttributes(preset.attributes);
        break;
      default:
        return invalidConfiguration("Invalid preset");
    }
  } else constraints = selection.constraints;
  const hashes: Record<string, string> = {};
  const legacyHash = hashSignal(legacySignal);
  const rp = config.rp_context!;
  const result = (payload: Record<string, unknown>): CompiledRequest => ({
    payload,
    signal_hashes: hashes,
    legacy_signal_hash: legacyHash,
  });
  if (options.nativeVersion === 1) {
    if (!presetMode || config.type !== "request")
      return invalidConfiguration(
        "v1 native payload only supports uniqueness presets",
      );
    if (constraints) compileConstraints(constraints, false, hashes);
    return result({
      verification_level: legacyLevel,
      action: config.action ?? "",
      signal: legacyHash,
      timestamp: timestamp(rp.created_at),
    });
  }
  // Parse session identifiers even if constraints are absent, like Rust build_request_payload.
  const session =
    config.type === "proveSession"
      ? sessionId(config.session_id)
      : config.type === "createSession"
        ? "create"
        : null;
  const payload: Record<string, unknown> = {
    app_id: config.app_id,
    package_name: config.package_name,
    package_version: config.package_version,
    action: config.type === "request" ? (config.action ?? "") : "",
    ...(config.action_description == null
      ? {}
      : { action_description: config.action_description }),
    signal: legacyHash,
    verification_level: legacyLevel,
    ...(options.nativeVersion == null
      ? {}
      : { timestamp: timestamp(rp.created_at) }),
    allow_legacy_proofs: allowLegacy,
    require_user_presence: config.require_user_presence ?? false,
    environment:
      config.environment === "staging" || config.environment === "sandbox"
        ? config.environment
        : "production",
    ...(config.return_to == null ? {} : { return_to_url: config.return_to }),
  };
  if (constraints) {
    const { items, expression } = compileConstraints(
      constraints,
      !presetMode,
      hashes,
    );
    const signature = normalizeSignature(rp.signature);
    const nonce = fieldElement(rp.nonce, "nonce");
    if (typeof options.requestId !== "string")
      return invalidConfiguration(
        "A request ID is required to compile a proof request",
      );
    const rpId = normalizeRpId(rp.rp_id);
    payload.proof_request = {
      id: options.requestId,
      version: 1,
      proof_type: config.type === "request" ? "uniqueness" : "session",
      created_at: rp.created_at,
      expires_at: rp.expires_at,
      rp_id: rpId,
      oprf_key_id: `0x${BigInt(`0x${rpId.slice(3)}`).toString(16)}`,
      session_id: session,
      action:
        config.type === "request"
          ? `0x${bytesToHex(hashToField(encodeUtf8(config.action ?? "")))}`
          : null,
      signature,
      nonce,
      proof_requests: items,
      ...(expression == null ? {} : { constraints: expression }),
    };
  }
  if (attributes != null) payload.identity_attributes = attributes;
  return result(payload);
}
