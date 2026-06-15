import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import packageJson from "../../package.json";

let _debug = false;

export type IDKitDebugReportStatus =
  | "created"
  | "sent"
  | "waiting_for_connection"
  | "awaiting_confirmation"
  | "success"
  | "error"
  | "cancelled"
  | "timeout";

export type IDKitDebugTransportKind =
  | "bridge"
  | "invite_code_bridge"
  | "native";

export type IDKitDebugRequestMode =
  | "request"
  | "invite_code_request"
  | "create_session"
  | "prove_session";

export type IDKitDebugRuntimePlatform =
  | "web"
  | "world_app_ios"
  | "world_app_android"
  | "unknown";

export type IDKitDebugReport = {
  schema_version: 1;
  created_at: string;
  sdk: {
    package_name: string;
    package_version: string;
  };
  runtime: {
    platform: IDKitDebugRuntimePlatform;
    in_world_app: boolean;
    user_agent?: string;
  };
  request: {
    mode: IDKitDebugRequestMode;
    app_id?: string;
    action?: string;
    environment?: string;
    return_to?: string;
    allow_legacy_proofs?: boolean;
    require_user_presence?: boolean;
    payload_before_transport?: unknown;
    payload_before_transport_sha256?: string;
    payload_before_transport_size_bytes?: number;
    signal_hashes?: Record<string, string>;
    legacy_signal_hash?: string;
  };
  transport: {
    kind: IDKitDebugTransportKind;
    bridge_url?: string;
    bridge_host?: string;
    request_id?: string;
    connector_uri?: string;
    connector_uri_sha256?: string;
    native_command_version?: 1 | 2;
    native_platform?: "ios" | "android" | "unknown";
  };
  lifecycle: {
    created_request_at?: string;
    sent_to_transport_at?: string;
    response_received_at?: string;
    updated_at: string;
    status: IDKitDebugReportStatus;
    error_code?: string;
    error_message?: string;
  };
};

export type IDKitDebugReportHandler = (report: IDKitDebugReport) => void;

let _debugReportHandler: IDKitDebugReportHandler | null = null;

export function isDebug(): boolean {
  if (_debug) return true;
  return typeof window !== "undefined" && Boolean((window as any).IDKIT_DEBUG);
}

export function setDebug(enabled: boolean): void {
  _debug = enabled;
}

export function setDebugReportHandler(
  handler: IDKitDebugReportHandler | null,
): void {
  _debugReportHandler = handler;
}

export function emitDebugReport(report: IDKitDebugReport | undefined): void {
  if (!report || !isDebug() || !_debugReportHandler) {
    return;
  }

  _debugReportHandler(cloneDebugReport(report)!);
}

export function cloneDebugReport(
  report: IDKitDebugReport | undefined,
): IDKitDebugReport | undefined {
  if (!report) {
    return undefined;
  }

  return cloneValue(report) as IDKitDebugReport;
}

export function requestModeFromConfig(config: {
  type: "request" | "createSession" | "proveSession";
}): IDKitDebugRequestMode {
  if (config.type === "createSession") return "create_session";
  if (config.type === "proveSession") return "prove_session";
  return "request";
}

export function createIDKitDebugReport(options: {
  mode: IDKitDebugRequestMode;
  transportKind: IDKitDebugTransportKind;
  config: {
    app_id?: string;
    action?: string;
    environment?: string;
    return_to?: string;
    allow_legacy_proofs?: boolean;
    require_user_presence?: boolean;
    bridge_url?: string;
  };
  payload?: unknown;
  signalHashes?: Record<string, string>;
  legacySignalHash?: string;
  requestId?: string;
  connectorURI?: string;
  nativeCommandVersion?: 1 | 2;
  nativePlatform?: "ios" | "android" | "unknown";
}): IDKitDebugReport | undefined {
  if (!isDebug()) {
    return undefined;
  }

  const now = new Date().toISOString();
  const payloadJson =
    options.payload === undefined
      ? undefined
      : stableStringify(options.payload);
  const payload =
    options.payload === undefined
      ? undefined
      : normalizeForJson(options.payload);

  return {
    schema_version: 1,
    created_at: now,
    sdk: {
      package_name: packageJson.name,
      package_version: packageJson.version,
    },
    runtime: getRuntimeDebugInfo(),
    request: {
      mode: options.mode,
      app_id: options.config.app_id,
      action: options.config.action,
      environment: options.config.environment ?? "production",
      return_to: options.config.return_to,
      allow_legacy_proofs: options.config.allow_legacy_proofs,
      require_user_presence: options.config.require_user_presence,
      payload_before_transport: payload,
      payload_before_transport_sha256:
        payloadJson === undefined ? undefined : fingerprintString(payloadJson),
      payload_before_transport_size_bytes:
        payloadJson === undefined
          ? undefined
          : new TextEncoder().encode(payloadJson).byteLength,
      signal_hashes: options.signalHashes,
      legacy_signal_hash: options.legacySignalHash,
    },
    transport: {
      kind: options.transportKind,
      bridge_url: options.config.bridge_url,
      bridge_host: getUrlHost(options.config.bridge_url),
      request_id: options.requestId,
      connector_uri: options.connectorURI,
      connector_uri_sha256: options.connectorURI
        ? fingerprintString(options.connectorURI)
        : undefined,
      native_command_version: options.nativeCommandVersion,
      native_platform: options.nativePlatform,
    },
    lifecycle: {
      created_request_at: now,
      updated_at: now,
      status: "created",
    },
  };
}

export function updateDebugReport(
  report: IDKitDebugReport | undefined,
  update: {
    status?: IDKitDebugReportStatus;
    requestId?: string;
    connectorURI?: string;
    sentToTransportAt?: string;
    responseReceivedAt?: string;
    errorCode?: string;
    errorMessage?: string;
  },
): IDKitDebugReport | undefined {
  if (!report) {
    return undefined;
  }

  if (update.requestId) {
    report.transport.request_id = update.requestId;
  }
  if (update.connectorURI) {
    report.transport.connector_uri = update.connectorURI;
    report.transport.connector_uri_sha256 = fingerprintString(
      update.connectorURI,
    );
  }

  report.lifecycle.updated_at = new Date().toISOString();
  report.lifecycle.status = update.status ?? report.lifecycle.status;

  if (update.sentToTransportAt) {
    report.lifecycle.sent_to_transport_at = update.sentToTransportAt;
  }
  if (update.responseReceivedAt) {
    report.lifecycle.response_received_at = update.responseReceivedAt;
  }
  if (update.errorCode) {
    report.lifecycle.error_code = update.errorCode;
  }
  if (update.errorMessage) {
    report.lifecycle.error_message = update.errorMessage;
  }

  emitDebugReport(report);
  return report;
}

export function attachDebugReportToError<T extends unknown>(
  error: T,
  report: IDKitDebugReport | undefined,
): T {
  if (
    !report ||
    (typeof error !== "object" && typeof error !== "function") ||
    error === null
  ) {
    return error;
  }

  deleteRawDebugPayload(error);

  Object.defineProperty(error, "debugReport", {
    configurable: true,
    enumerable: false,
    value: cloneDebugReport(report),
  });

  return error;
}

function deleteRawDebugPayload(error: object): void {
  if (!("debugPayload" in error)) {
    return;
  }

  try {
    delete (error as { debugPayload?: unknown }).debugPayload;
    return;
  } catch {
    // Fall through to the non-enumerable overwrite below.
  }

  try {
    Object.defineProperty(error, "debugPayload", {
      configurable: true,
      enumerable: false,
      value: undefined,
    });
  } catch {
    // Best effort: never let debug-report attachment fail because cleanup did.
  }
}

function getRuntimeDebugInfo(): IDKitDebugReport["runtime"] {
  const userAgent =
    typeof navigator !== "undefined" ? navigator.userAgent : undefined;
  const worldApp =
    typeof window !== "undefined" ? (window as any).WorldApp : undefined;
  const isWorldApp = Boolean(worldApp);

  return {
    platform: getRuntimePlatform(isWorldApp),
    in_world_app: isWorldApp,
    user_agent: userAgent,
  };
}

function getRuntimePlatform(inWorldApp: boolean): IDKitDebugRuntimePlatform {
  if (!inWorldApp) {
    return typeof window === "undefined" ? "unknown" : "web";
  }

  const w = window as any;
  if (w.webkit?.messageHandlers?.minikit) {
    return "world_app_ios";
  }
  if (w.Android) {
    return "world_app_android";
  }
  return "unknown";
}

function getUrlHost(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).host;
  } catch {
    return undefined;
  }
}

function fingerprintString(value: string): string {
  return `sha256:${fingerprintBytes(new TextEncoder().encode(value))}`;
}

function fingerprintBytes(value: Uint8Array): string {
  return bytesToHex(sha256(value));
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForJson(value)) ?? "undefined";
}

function normalizeForJson(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (value instanceof Uint8Array) {
    return {
      type: "Uint8Array",
      data: Array.from(value),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeForJson(item));
  }

  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(object)
        .sort()
        .map((childKey) => [childKey, normalizeForJson(object[childKey])]),
    );
  }

  return value;
}

function cloneValue(value: unknown): unknown {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(stableStringify(value));
}
