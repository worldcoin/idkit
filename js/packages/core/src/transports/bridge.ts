import {
  withRequestTimeout,
  type RequestOptions,
} from "../lib/request-options";
import { resolveBridgeEndpoint } from "../lib/url";
import { assertUniqueJsonFields, parseBridgeJson } from "../lib/bridge-json";
import { encodeUtf8, decodeUtf8, decodeUtf8Lossy } from "../lib/encoding";
import {
  compileRequest,
  bridgeResponseToResult,
  normalizeBuilderConfig,
  validateWireStrings,
  type BridgeResponseContext,
} from "../protocol";
import type { BuilderConfig, ConstraintNode, Preset } from "../types/protocol";
import type { Status } from "../request";
import type { DebugReportWithoutVersion } from "../lib/debug";
import {
  decodeBase64,
  encodeBase64,
  encrypt,
  decrypt,
  generateInviteCode,
  deriveInviteCode,
} from "../lib/crypto";
import { fetchBridge, randomBytes, randomRequestId } from "../lib/runtime";

export type RequestSelection =
  | { preset: Preset }
  | { constraints: ConstraintNode };
const DEFAULT_BRIDGE = "https://bridge.worldcoin.org";
const CONNECT_URLS: Record<string, string> = {
  production: "https://world.org/verify",
  staging: "https://staging.world.org/verify",
  sandbox: "https://sandbox.world.org/verify",
};

/** Rust urlencoding uses RFC3986 unreserved characters, unlike encodeURIComponent. */
const escape = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
const endpoint = (bridge: string, path: string): string =>
  resolveBridgeEndpoint(bridge, path);
// Rust str::trim uses Unicode White_Space: unlike JS trim it includes NEL and
// excludes BOM. Spell out the stable set instead of relying on host regex tables.
const trimReturnTo = (value: string): string =>
  value.replace(
    /^[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/g,
    "",
  );

/** A retryable GET failure. Creation POSTs are never automatically retried. */
export class RetryableBridgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableBridgeError";
  }
}

export function isRetryableBridgeError(
  error: unknown,
): error is RetryableBridgeError {
  return error instanceof RetryableBridgeError;
}

async function readBridgeJson(
  response: Response,
  retryRead = false,
): Promise<unknown> {
  const read = async <T>(operation: () => Promise<T>): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      if (!retryRead || error instanceof SyntaxError) throw error;
      throw new RetryableBridgeError("Bridge response body could not be read");
    }
  };
  // Parse outside the IO catch: malformed JSON is terminal, not a network outage.
  if (typeof response.arrayBuffer === "function")
    return parseBridgeJson(
      new Uint8Array(await read(() => response.arrayBuffer())),
    );
  if (typeof response.text === "function")
    return parseBridgeJson(await read(() => response.text()));
  return read(() => response.json());
}

export class BridgeRequest {
  private responsePayload: string | undefined;

  constructor(
    private config: BuilderConfig,
    private compiled: ReturnType<typeof compileRequest>,
    private key: Uint8Array,
    private id: string,
    private code?: string,
    private expiry?: number,
  ) {}

  requestId(): string {
    return this.id;
  }
  expiresAt(): number {
    return this.expiry!;
  }

  connectUrl(): string {
    const environment =
      this.config.environment === "staging" ||
      this.config.environment === "sandbox"
        ? this.config.environment
        : "production";
    const base =
      this.config.override_connect_base_url ?? CONNECT_URLS[environment];
    let url = `${base}?t=wld&i=${this.id}&k=${escape(encodeBase64(this.key))}`;
    const returnTo =
      this.config.return_to == null
        ? undefined
        : trimReturnTo(this.config.return_to);
    if (returnTo) url += `&return_to=${escape(returnTo)}`;
    // Preserve the configured spelling, matching Rust BridgeUrl serialization.
    const bridge = this.config.bridge_url ?? DEFAULT_BRIDGE;
    if (bridge !== DEFAULT_BRIDGE) url += `&b=${escape(bridge)}`;
    if (this.code) url += `&c=${this.code}&a=${escape(this.config.app_id)}`;
    return url;
  }

  getDebugReport(): DebugReportWithoutVersion {
    return {
      transport: "bridge",
      generated_at: new Date().toISOString(),
      request_id: this.id,
      request_payload: JSON.parse(JSON.stringify(this.compiled.payload)),
      ...(this.responsePayload === undefined
        ? {}
        : { response_payload: this.responsePayload }),
    };
  }

  pollForStatus(options?: RequestOptions): Promise<Status> {
    return withRequestTimeout((signal) => this.poll(signal), options);
  }

  private async poll(signal: AbortSignal): Promise<Status> {
    const response = await fetchBridge(
      endpoint(
        this.config.bridge_url ?? DEFAULT_BRIDGE,
        `/response/${this.id}`,
      ),
      { signal },
    ).catch(() => {
      throw new RetryableBridgeError("Bridge poll could not connect");
    });
    if (
      response.status === 408 ||
      response.status === 429 ||
      (response.status >= 500 && response.status < 600)
    )
      throw new RetryableBridgeError(
        `Bridge poll returned HTTP ${response.status}`,
      );
    if (!response.ok)
      return { type: "failed", error: "connection_failed" as Status["error"] };
    return decodeBridgePollResponse(
      await readBridgeJson(response, true),
      this.key,
      {
        nonce: this.config.rp_context!.nonce,
        action: this.config.type === "request" ? this.config.action : undefined,
        action_description: this.config.action_description,
        environment: this.compiled.payload.environment as
          | "production"
          | "staging"
          | "sandbox",
        signal_hashes: this.compiled.signal_hashes,
        legacy_signal_hash: this.compiled.legacy_signal_hash,
        require_user_presence: this.config.require_user_presence ?? false,
      },
      (plaintext) => {
        this.responsePayload = plaintext;
      },
    );
  }
}

export async function createBridgeRequest(
  config: BuilderConfig,
  selection: RequestSelection,
  inviteCode = false,
  options?: RequestOptions,
): Promise<BridgeRequest> {
  return withRequestTimeout(
    (signal) =>
      createBridgeRequestWithSignal(config, selection, inviteCode, signal),
    options,
  );
}

async function createBridgeRequestWithSignal(
  config: BuilderConfig,
  selection: RequestSelection,
  inviteCode: boolean,
  signal: AbortSignal,
): Promise<BridgeRequest> {
  config = normalizeBuilderConfig(config);
  // Rust owns the selected constraints/preset before the first network await.
  // Retain that compiled snapshot if an invite-code collision requires a retry.
  const initial = compileRequest(config, selection, {
    requestId: randomRequestId(),
  });
  for (let attempt = 0; attempt < (inviteCode ? 2 : 1); attempt++) {
    if (signal.aborted) throw new Error("cancelled");
    const compiled =
      attempt === 0
        ? initial
        : {
            ...initial,
            payload: {
              ...initial.payload,
              ...(initial.payload.proof_request == null
                ? {}
                : {
                    proof_request: {
                      ...(initial.payload.proof_request as Record<
                        string,
                        unknown
                      >),
                      id: randomRequestId(),
                    },
                  }),
            },
          };
    const code = inviteCode ? generateInviteCode() : undefined;
    const derived = code ? deriveInviteCode(code) : undefined;
    const key = derived?.key ?? randomBytes(32);
    const iv = randomBytes(12);
    const payload = encrypt(
      key,
      iv,
      encodeUtf8(JSON.stringify(compiled.payload)),
    );
    const response = await fetchBridge(
      endpoint(config.bridge_url ?? DEFAULT_BRIDGE, "/request"),
      {
        signal,
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          iv: encodeBase64(iv),
          payload: encodeBase64(payload),
          ...(derived ? { request_id: derived.index } : {}),
        }),
      },
    );
    if (inviteCode && response.status === 409) {
      if (attempt === 0) continue;
      throw new Error(
        "invite-code index collision after retries — bridge or entropy budget misconfigured",
      );
    }
    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(
        `Bridge request failed with status ${response.status}: ${details || "no error details"}`,
      );
    }
    const body: unknown = await readBridgeJson(response);
    if (
      !body ||
      typeof body !== "object" ||
      !("request_id" in body) ||
      typeof body.request_id !== "string"
    )
      throw new Error("unexpected_response");
    assertUniqueJsonFields(body, ["request_id"]);
    validateWireStrings(Object.keys(body));
    validateWireStrings(body.request_id);
    if (derived && body.request_id !== derived.index)
      throw new Error(
        `Bridge echoed mismatched request_id (sent ${derived.index}, got ${body.request_id})`,
      );
    return new BridgeRequest(
      config,
      compiled,
      key,
      body.request_id,
      code,
      code ? Math.floor(Date.now() / 1000) + 900 : undefined,
    );
  }
  throw new Error("Bridge request failed");
}

/** Production poll decoding, also executed by the native differential test harness. */
export function decodeBridgePollResponse(
  body: unknown,
  key: Uint8Array,
  context: BridgeResponseContext,
  onPlaintext?: (plaintext: string) => void,
): Status {
  if (!body || typeof body !== "object" || !("status" in body))
    throw new Error("unexpected_response");
  const poll = body as {
    status: unknown;
    response?: { iv?: unknown; payload?: unknown } | null;
  };
  assertUniqueJsonFields(body, ["status", "response"]);
  if (typeof poll.status !== "string") throw new Error("unexpected_response");
  // Struct deserialization reads field names and known strings, but ignores
  // unknown values. Do not reject surrogate escapes in ignored extension values.
  validateWireStrings(Object.keys(body));
  validateWireStrings(poll.status);
  if (
    poll.response != null &&
    (typeof poll.response !== "object" ||
      typeof poll.response.iv !== "string" ||
      typeof poll.response.payload !== "string")
  )
    throw new Error("unexpected_response");
  if (poll.response != null) {
    assertUniqueJsonFields(poll.response, ["iv", "payload"]);
    validateWireStrings(Object.keys(poll.response));
    validateWireStrings(poll.response.iv);
    validateWireStrings(poll.response.payload);
  }
  if (poll.status === "initialized") return { type: "waiting_for_connection" };
  if (poll.status === "retrieved") return { type: "awaiting_confirmation" };
  if (poll.status !== "completed" || !poll.response)
    throw new Error("unexpected_response");
  const bytes = decrypt(
    key,
    decodeBase64(poll.response.iv as string),
    decodeBase64(poll.response.payload as string),
  );
  onPlaintext?.(decodeUtf8Lossy(bytes));
  const payload: unknown = parseBridgeJson(decodeUtf8(bytes));
  validateWireStrings(payload);
  return bridgeResponseToResult(payload, context) as Status;
}
