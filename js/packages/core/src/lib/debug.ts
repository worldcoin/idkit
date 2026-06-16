import packageJson from "../../package.json";

let _debug = false;
let _debugReportHandler: IDKitDebugReportHandler | null = null;

export type IDKitDebugTransport = "bridge" | "mini_app";
export type IDKitDebugReportStatus =
  | "created"
  | "sent"
  | "waiting_for_connection"
  | "awaiting_confirmation"
  | "success"
  | "error"
  | "cancelled"
  | "timeout";

export type IDKitDebugReport = {
  version: 1;
  package_version: string;
  transport: IDKitDebugTransport;
  status: string;
  timestamps: Record<string, unknown>;
  request_id?: string;
  connector_uri?: string;
  request_payload?: object;
  response_payload?: object;
  mini_app?: Record<string, unknown>;
  error?: Record<string, unknown>;
};

export type IDKitDebugReportHandler = (report: IDKitDebugReport) => void;

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
  if (report && isDebug() && _debugReportHandler) {
    _debugReportHandler(cloneDebugReport(report)!);
  }
}

export function cloneDebugReport(
  report: IDKitDebugReport | undefined,
): IDKitDebugReport | undefined {
  if (!report) return undefined;

  return cloneValue(report) as IDKitDebugReport;
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

  Object.defineProperty(error, "debugReport", {
    configurable: true,
    enumerable: false,
    value: cloneDebugReport(report),
  });

  return error;
}

export function createIDKitDebugReport(options: {
  transport: IDKitDebugTransport;
  payload?: unknown;
  requestId?: string;
  connectorURI?: string;
}): IDKitDebugReport | undefined {
  if (!isDebug()) return undefined;

  const now = new Date().toISOString();
  const report: IDKitDebugReport = {
    version: 1,
    package_version: packageJson.version,
    transport: options.transport,
    status: "created",
    timestamps: { created_at: now, updated_at: now },
  };

  const miniApp = getMiniAppDebugInfo();
  if (miniApp) report.mini_app = miniApp;

  if (options.payload && typeof options.payload === "object") {
    report.request_payload = options.payload;
  }
  if (options.requestId) report.request_id = options.requestId;
  if (options.connectorURI) report.connector_uri = options.connectorURI;
  return report;
}

export function updateDebugReport(
  report: IDKitDebugReport | undefined,
  update: {
    status?: IDKitDebugReportStatus;
    requestId?: string;
    connectorURI?: string;
    sentToTransportAt?: string;
    responseReceivedAt?: string;
    responsePayload?: unknown;
    errorCode?: string;
    errorMessage?: string;
  },
): IDKitDebugReport | undefined {
  if (!report) return undefined;

  if (update.requestId) report.request_id = update.requestId;
  if (update.connectorURI) report.connector_uri = update.connectorURI;
  if (update.status) report.status = update.status;
  if (update.sentToTransportAt) {
    report.timestamps.sent_to_transport_at = update.sentToTransportAt;
  }
  if (update.responseReceivedAt) {
    report.timestamps.response_received_at = update.responseReceivedAt;
  }
  if (update.responsePayload !== undefined) {
    if (update.responsePayload && typeof update.responsePayload === "object") {
      report.response_payload = update.responsePayload;
    }
  }
  if (update.errorCode !== undefined || update.errorMessage !== undefined) {
    report.error = {
      code: update.errorCode ?? report.error?.code,
      message: update.errorMessage ?? report.error?.message,
    };
  }

  report.timestamps.updated_at = new Date().toISOString();
  emitDebugReport(report);
  return report;
}

function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, child]) => child !== undefined),
  ) as T;
}

function getMiniAppDebugInfo(): Record<string, unknown> | undefined {
  const worldApp =
    typeof window !== "undefined" ? (window as any).WorldApp : undefined;
  if (!worldApp || typeof worldApp !== "object") return undefined;

  return compact({
    world_app_version: worldApp.world_app_version,
    platform: worldApp.device_os,
  });
}

function normalizeForJson(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();

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
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        normalizeForJson(child),
      ]),
    );
  }

  return value;
}

function cloneValue(value: unknown): unknown {
  try {
    if (typeof structuredClone === "function") {
      return structuredClone(value);
    }
  } catch {
    // Fall through to JSON clone below.
  }

  return JSON.parse(JSON.stringify(normalizeForJson(value)) ?? "null");
}
