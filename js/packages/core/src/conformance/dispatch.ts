import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { hashSignal, hashToField } from "../lib/hashing";
import {
  encrypt,
  decrypt,
  encodeBase64,
  decodeBase64,
  deriveInviteCode,
  parseInviteCode,
  generateInviteCode,
} from "../lib/crypto";
import {
  APP_ERROR_CODES,
  compileRequest,
  bridgeResponseToResult,
  validateBridgeUrl,
  validateWireStrings,
} from "../protocol";
import { BridgeRequest, decodeBridgePollResponse } from "../transports/bridge";
import type { BuilderConfig } from "../types/protocol";
import { decodeUtf8 } from "../lib/encoding";
import { parseBridgeJson } from "../lib/bridge-json";

export type ConformanceFailure = {
  kind:
    | "invalid_configuration"
    | "unexpected_response"
    | "json_error"
    | "crypto_error"
    | "base64_error"
    | "app_error";
  appCode?: string;
};

/** Test-only classification of errors actually emitted by the JS implementation.
 * Do not infer success from the requested operation: a TypeError, missing adapter,
 * or unfamiliar dependency error must fail conformance until explicitly reviewed.
 */
export function classifyConformanceError(
  error: unknown,
): ConformanceFailure | undefined {
  if (!(error instanceof Error)) return undefined;
  const { message } = error;
  if (error instanceof SyntaxError && /\bJSON\b/.test(message))
    return { kind: "json_error" };
  if (error.constructor !== Error) return undefined;
  if (message === "unexpected_response") return { kind: "unexpected_response" };
  if (APP_ERROR_CODES.some((code) => code === message))
    return { kind: "app_error", appCode: message };
  if (
    message.startsWith("Invalid configuration: ") ||
    [
      "WrongLength",
      "InvalidChar",
      "BadCheckDigit",
      "Invite code requires 5 random bytes",
      "Presets are not supported for session flows. Use .constraints() instead.",
      "The SelfieCheck preset is not supported by nativePayloadV1FromPreset. Use nativePayloadFromPreset instead.",
      "IdentityCheck presets are not supported for nativePayloadV1FromPreset. Use nativePayloadFromPreset with a World ID 4.0-compatible client instead.",
    ].includes(message)
  )
    return { kind: "invalid_configuration" };
  if (
    [
      "Key must be 32 bytes",
      "Nonce must be 12 bytes",
      "aes/gcm: invalid ghash tag",
      "aes/gcm: invalid nonce length",
      "invalid ciphertext length: smaller than tagLength=16",
    ].includes(message)
  )
    return { kind: "crypto_error" };
  if (
    message === "utf8: invalid source encoding" ||
    message === "Invalid UTF-8"
  )
    return { kind: "json_error" };
  // These diagnostics are from the pinned @scure/base strict base64 decoder.
  if (
    message === "padding: invalid, string should have whole number of bytes" ||
    message === "Excess padding" ||
    /^Non-zero padding: \d+$/.test(message) ||
    /^Unknown letter: .+\. Allowed: ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789\+\/$/.test(
      message,
    )
  ) {
    return { kind: "base64_error" };
  }
  return undefined;
}

/** Shared by Node and Hermes; unknown runtime failures never count as parity. */
export function assertConformanceRejection(
  op: string,
  expected: { kind: string; message: string },
  error: unknown,
): void {
  const actual = classifyConformanceError(error);
  if (!actual) throw new Error(`Unclassified JS rejection: ${String(error)}`);
  let expectedKind = expected.kind;
  // The native runner deserializes typed Rust DTOs before calling the core. JS
  // validates caller config and received objects explicitly at those boundaries.
  // These two representation differences are intentional and narrowly scoped.
  if (expectedKind === "json_error" && op === "compile")
    expectedKind = "invalid_configuration";
  if (
    expectedKind === "json_error" &&
    ["response", "poll", "proof_response"].includes(op) &&
    actual.kind === "unexpected_response"
  ) {
    expectedKind = "unexpected_response";
  }
  if (actual.kind !== expectedKind) {
    throw new Error(
      `JS rejection ${actual.kind} (${String(error)}) differs from Rust ${expected.kind} (${expected.message})`,
    );
  }
  if (expectedKind === "app_error") {
    const nativeVariant = expected.message
      .match(/^App error: ([A-Za-z0-9]+)$/)?.[1]
      ?.toLowerCase();
    const nativeCode = APP_ERROR_CODES.find(
      (code) => code.replace(/_/g, "") === nativeVariant,
    );
    if (!nativeCode || actual.appCode !== nativeCode) {
      throw new Error(
        `JS app error ${actual.appCode} differs from Rust ${expected.message}`,
      );
    }
  }
}

function responseInput(input: Record<string, any>): unknown {
  if (input.response_hex === undefined) return input.response;
  const bytes = hexToBytes(input.response_hex);
  return parseBridgeJson(input.op === "poll" ? bytes : decodeUtf8(bytes));
}

export function jsConfig(config: any): BuilderConfig {
  const { kind, ...rest } = config;
  return {
    ...rest,
    type:
      kind === "create_session"
        ? "createSession"
        : kind === "prove_session"
          ? "proveSession"
          : "request",
  };
}

export function dispatch(input: Record<string, any>): unknown {
  switch (input.op) {
    case "hash_signal":
      return hashSignal(
        typeof input.signal === "string"
          ? input.signal
          : hexToBytes(input.signal.bytes_hex),
      );
    case "hash_to_field":
      return "0x" + bytesToHex(hashToField(hexToBytes(input.input_hex)));
    case "encrypt":
      return {
        ciphertext_hex: bytesToHex(
          encrypt(
            hexToBytes(input.key_hex),
            hexToBytes(input.iv_hex),
            hexToBytes(input.plaintext_hex),
          ),
        ),
      };
    case "decrypt":
      return {
        plaintext_hex: bytesToHex(
          decrypt(
            hexToBytes(input.key_hex),
            hexToBytes(input.iv_hex),
            hexToBytes(input.ciphertext_hex),
          ),
        ),
      };
    case "base64_encode":
      return encodeBase64(hexToBytes(input.input_hex));
    case "base64_decode":
      return { bytes_hex: bytesToHex(decodeBase64(input.value)) };
    case "invite_generate":
      return generateInviteCode(hexToBytes(input.entropy_hex));
    case "poll":
      return decodeBridgePollResponse(
        responseInput(input),
        hexToBytes(input.context.key_hex),
        input.context,
      );
    case "invite_parse":
      return parseInviteCode(input.code);
    case "invite_derive": {
      const derived = deriveInviteCode(input.code);
      return { index: derived.index, key_hex: bytesToHex(derived.key) };
    }
    case "compile":
      return compileRequest(jsConfig(input.config), input.selection, {
        now: input.now,
        requestId: input.request_id,
        nativeVersion: input.native_v1 ? 1 : input.native ? 2 : undefined,
      });
    case "response": {
      const response = responseInput(input);
      if (input.response_hex !== undefined) validateWireStrings(response);
      return bridgeResponseToResult(response, input.context);
    }
    case "bridge_url":
      validateBridgeUrl(input.url, input.app_id);
      return input.url;
    case "connect_url": {
      const c = input.context;
      return new BridgeRequest(
        {
          ...c,
          type: "request",
          package_name: "test",
          package_version: "test",
        },
        { payload: {}, signal_hashes: {}, legacy_signal_hash: "" },
        hexToBytes(c.key_hex),
        c.request_id,
        c.invite_code,
      ).connectUrl();
    }
    default:
      throw new Error(`No JS conformance operation ${input.op}`);
  }
}
