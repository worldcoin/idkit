/**
 * Bridge protocol client.
 *
 * Implements the World ID bridge protocol in pure TypeScript.
 * Matches the Rust implementation in rust/core/src/bridge.rs.
 */

import {
  generateKey,
  encrypt,
  decrypt,
  encodeBase64,
  decodeBase64,
} from "./crypto";
import { hashSignal } from "./hashing";
import { utf8ToBytes, bytesToHex } from "@noble/hashes/utils";
import type { IDKitRequestConfig, VerificationLevel, Preset } from "./types";
import type { IDKitResult, IDKitResultV3, IDKitResultV4 } from "./types";
import { IDKitErrorCodes, type Status } from "./types";

const DEFAULT_BRIDGE_URL = "https://bridge.worldcoin.org";
const DEFAULT_CONNECT_BASE_URL = "https://world.org/verify";

// ── Preset → bridge params ──────────────────────────────────────────────────

interface PresetBridgeParams {
  verificationLevel: VerificationLevel;
  signal: string | undefined;
}

function presetToBridgeParams(preset: Preset): PresetBridgeParams {
  const signal = preset.signal;
  const map: Record<Preset["type"], VerificationLevel> = {
    OrbLegacy: "orb",
    SecureDocumentLegacy: "secure_document",
    DocumentLegacy: "document",
    SelfieCheckLegacy: "face",
    DeviceLegacy: "device",
  };
  return { verificationLevel: map[preset.type], signal };
}

// ── Bridge request payload (matches Rust BridgeRequestPayload) ──────────────
//
// For legacy presets: constraints is None → no proof_request field.
// Legacy presets only use the v3 fields (signal, verification_level).
// This matches Rust's to_params_from_preset() which sets constraints: None.

function buildRequestPayload(
  config: IDKitRequestConfig,
  preset: Preset,
): Record<string, unknown> {
  const params = presetToBridgeParams(preset);
  const signalHash = hashSignal(params.signal ?? "");

  return {
    app_id: config.app_id,
    action: config.action as string,
    action_description: config.action_description,
    signal: signalHash,
    verification_level: params.verificationLevel,
    // No proof_request for legacy presets (constraints: None in Rust)
    allow_legacy_proofs: config.allow_legacy_proofs,
    environment: config.environment ?? "production",
  };
}

// ── Bridge HTTP client ──────────────────────────────────────────────────────

interface BridgeCreateResponse {
  request_id: string;
}

interface BridgePollResponse {
  status: string;
  response?: { iv: string; payload: string };
}

interface BridgeResponseV1 {
  proof: string;
  merkle_root: string;
  nullifier_hash: string;
  // Android sends `credential_type`, iOS sends `verification_level` (or both)
  verification_level?: string;
  credential_type?: string;
}

interface BridgeMultiLegacyResponse {
  legacy_responses: BridgeResponseV1[];
}

// Raw V2 response from bridge (protocol format, before conversion)
interface RawV2ResponseItem {
  identifier: string;
  issuer_schema_id: number;
  /** ZeroKnowledgeProof: hex string of 160 bytes (320 hex chars) */
  proof: string;
  /** Nullifier: "nil_<64hex>" for uniqueness proofs */
  nullifier?: string;
  /** SessionNullifier: "snil_<128hex>" for session proofs */
  session_nullifier?: string;
  expires_at_min: number;
}

interface BridgeResponseV2 {
  responses: RawV2ResponseItem[];
  session_id?: string;
  error?: string;
}

// ── V2 response conversion (matches Rust from_protocol_item) ────────────────

/** Split 160-byte proof hex string into 5 × U256 hex strings */
function splitProof(proofHex: string): string[] {
  const hex = proofHex.startsWith("0x") ? proofHex.slice(2) : proofHex;
  const result: string[] = [];
  for (let i = 0; i < 5; i++) {
    result.push("0x" + hex.slice(i * 64, (i + 1) * 64));
  }
  return result;
}

/** Extract inner hex from "nil_<64hex>" → "0x<64hex>" */
function parseNullifier(nullifier: string): string {
  if (nullifier.startsWith("nil_")) {
    return "0x" + nullifier.slice(4);
  }
  return nullifier; // already raw hex
}

/** Extract [nullifier, action] from "snil_<128hex>" → ["0x<64hex>", "0x<64hex>"] */
function parseSessionNullifier(snil: string): string[] {
  const hex = snil.startsWith("snil_") ? snil.slice(5) : snil;
  return ["0x" + hex.slice(0, 64), "0x" + hex.slice(64, 128)];
}

export interface BridgeConnection {
  requestId: string;
  connectUrl: string;
  key: Uint8Array;
  bridgeUrl: string;
  nonce: string;
  action?: string;
  actionDescription?: string;
  environment: string;
  legacySignalHash: string;
  signalHashes: Record<string, string>;
}

export async function createBridgeConnection(
  config: IDKitRequestConfig,
  preset: Preset,
): Promise<BridgeConnection> {
  const { key, nonce } = generateKey();
  const bridgeUrl = (config.bridge_url ?? DEFAULT_BRIDGE_URL).replace(/\/$/, "");

  const params = presetToBridgeParams(preset);
  const payload = buildRequestPayload(config, preset);
  const legacySignalHash = payload.signal as string;

  // Cache signal hash for response matching (same as Rust CachedSignalHashes)
  // For legacy presets, all credential types share the same signal hash
  const signalHashes: Record<string, string> = {};
  if (params.signal) {
    const hash = hashSignal(params.signal);
    // Map all possible credential identifiers to the same hash
    signalHashes[params.verificationLevel] = hash;
  }

  console.log("[IDKit bridge] sending payload:", JSON.stringify(payload, null, 2));
  const payloadBytes = utf8ToBytes(JSON.stringify(payload));
  const ciphertext = encrypt(key, nonce, payloadBytes);

  const encryptedPayload = {
    iv: encodeBase64(nonce),
    payload: encodeBase64(ciphertext),
  };

  const response = await fetch(`${bridgeUrl}/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(encryptedPayload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Bridge request failed (${response.status}): ${body || "no details"}`);
  }

  const { request_id }: BridgeCreateResponse = await response.json();

  const baseUrl = config.override_connect_base_url ?? DEFAULT_CONNECT_BASE_URL;
  const keyParam = encodeURIComponent(encodeBase64(key));
  let connectUrl = `${baseUrl}?t=wld&i=${request_id}&k=${keyParam}`;

  if (config.return_to?.trim()) {
    connectUrl += `&return_to=${encodeURIComponent(config.return_to.trim())}`;
  }
  if (config.bridge_url && config.bridge_url !== DEFAULT_BRIDGE_URL) {
    connectUrl += `&b=${encodeURIComponent(config.bridge_url)}`;
  }

  return {
    requestId: request_id,
    connectUrl,
    key,
    bridgeUrl,
    nonce: config.rp_context.nonce,
    action: config.action as string,
    actionDescription: config.action_description,
    environment: config.environment ?? "production",
    legacySignalHash,
    signalHashes,
  };
}

export async function pollBridgeStatus(connection: BridgeConnection): Promise<Status> {
  const { bridgeUrl, requestId, key } = connection;

  let response: Response;
  try {
    response = await fetch(`${bridgeUrl}/response/${requestId}`);
  } catch {
    return { type: "failed", error: IDKitErrorCodes.ConnectionFailed };
  }

  if (!response.ok) {
    return { type: "failed", error: IDKitErrorCodes.ConnectionFailed };
  }

  const poll: BridgePollResponse = await response.json();

  switch (poll.status) {
    case "initialized":
      return { type: "waiting_for_connection" };
    case "retrieved":
      return { type: "awaiting_confirmation" };
    case "completed": {
      if (!poll.response) {
        return { type: "failed", error: IDKitErrorCodes.UnexpectedResponse };
      }

      const iv = decodeBase64(poll.response.iv);
      const ciphertext = decodeBase64(poll.response.payload);
      const plaintext = decrypt(key, iv, ciphertext);
      let jsonStr = "";
      for (let i = 0; i < plaintext.length; i++) {
        jsonStr += String.fromCharCode(plaintext[i]);
      }
      const decoded = JSON.parse(jsonStr);
      console.log("[IDKit bridge] decrypted response:", JSON.stringify(decoded, null, 2));

      return parseBridgeResponse(decoded, connection);
    }
    default:
      return { type: "failed", error: IDKitErrorCodes.UnexpectedResponse };
  }
}

// ── Response parsing (matches Rust BridgeResponse untagged enum) ────────────

function parseBridgeResponse(decoded: unknown, connection: BridgeConnection): Status {
  const obj = decoded as Record<string, unknown>;

  // Error response
  if (typeof obj.error_code === "string") {
    const code = obj.error_code as IDKitErrorCodes;
    return {
      type: "failed",
      error: Object.values(IDKitErrorCodes).includes(code) ? code : IDKitErrorCodes.GenericError,
    };
  }

  // V2 protocol response (has `responses` array)
  if (Array.isArray(obj.responses)) {
    const v2 = obj as unknown as BridgeResponseV2;

    if (v2.error) {
      return { type: "failed", error: IDKitErrorCodes.GenericError };
    }

    // Convert protocol format → IDKit format (matches Rust from_protocol_item)
    if (v2.session_id) {
      const result: IDKitResult = {
        protocol_version: "4.0" as const,
        nonce: connection.nonce,
        action_description: connection.actionDescription,
        session_id: v2.session_id as `session_${string}`,
        responses: v2.responses.map((item) => ({
          identifier: item.identifier,
          signal_hash: connection.signalHashes[item.identifier],
          proof: splitProof(item.proof),
          session_nullifier: item.session_nullifier
            ? parseSessionNullifier(item.session_nullifier)
            : [],
          issuer_schema_id: item.issuer_schema_id,
          expires_at_min: item.expires_at_min,
        })),
        environment: connection.environment,
      };
      return { type: "confirmed", result };
    }

    const result: IDKitResultV4 = {
      protocol_version: "4.0",
      nonce: connection.nonce,
      action: connection.action ?? "",
      action_description: connection.actionDescription,
      responses: v2.responses.map((item) => ({
        identifier: item.identifier,
        signal_hash: connection.signalHashes[item.identifier],
        proof: splitProof(item.proof),
        nullifier: item.nullifier ? parseNullifier(item.nullifier) : "",
        issuer_schema_id: item.issuer_schema_id,
        expires_at_min: item.expires_at_min,
      })),
      environment: connection.environment,
    };
    return { type: "confirmed", result };
  }

  // Multi-legacy response
  if (Array.isArray(obj.legacy_responses)) {
    const legacy = obj as unknown as BridgeMultiLegacyResponse;
    const result: IDKitResultV3 = {
      protocol_version: "3.0",
      nonce: connection.nonce,
      action: connection.action,
      action_description: connection.actionDescription,
      responses: legacy.legacy_responses.map((item) => {
        const level = item.verification_level ?? item.credential_type ?? "orb";
        return {
        identifier: level,
        signal_hash: connection.signalHashes[level] ?? connection.legacySignalHash,
        proof: item.proof,
        merkle_root: item.merkle_root,
        nullifier: item.nullifier_hash,
      };
      }),
      environment: connection.environment,
    };
    return { type: "confirmed", result };
  }

  // V1 single legacy response
  if (typeof obj.proof === "string" && typeof obj.merkle_root === "string") {
    const v1 = obj as unknown as BridgeResponseV1;
    const level = v1.verification_level ?? v1.credential_type ?? "orb";
    const result: IDKitResultV3 = {
      protocol_version: "3.0",
      nonce: connection.nonce,
      action: connection.action,
      action_description: connection.actionDescription,
      responses: [
        {
          identifier: level,
          signal_hash: connection.legacySignalHash,
          proof: v1.proof,
          merkle_root: v1.merkle_root,
          nullifier: v1.nullifier_hash,
        },
      ],
      environment: connection.environment,
    };
    return { type: "confirmed", result };
  }

  return { type: "failed", error: IDKitErrorCodes.UnexpectedResponse };
}
