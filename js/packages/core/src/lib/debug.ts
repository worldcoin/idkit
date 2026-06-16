import packageJson from "../../package.json";

let _debug = false;

export type IDKitDebugTransport = "bridge" | "mini_app";

export type IDKitDebugReport = {
  package_version: string;
  transport: IDKitDebugTransport;
  timestamps: { generated_at: string };
  request_id?: string;
  connector_uri?: string;
  request_payload?: object;
  response_payload?: object;
  mini_app?: Record<string, unknown>;
};

export function isDebug(): boolean {
  if (_debug) return true;
  return typeof window !== "undefined" && Boolean((window as any).IDKIT_DEBUG);
}

export function setDebug(enabled: boolean): void {
  _debug = enabled;
}

export function createIDKitDebugReport(options: {
  transport: IDKitDebugTransport;
  requestPayload?: unknown;
  responsePayload?: unknown;
  requestId?: string;
  connectorURI?: string;
}): IDKitDebugReport | undefined {
  if (!isDebug()) return undefined;

  const now = new Date().toISOString();
  const report: IDKitDebugReport = {
    package_version: packageJson.version,
    transport: options.transport,
    timestamps: { generated_at: now },
  };

  if (options.transport === "mini_app") {
    const miniApp = getMiniAppDebugInfo();
    if (miniApp) report.mini_app = miniApp;
  }

  if (options.requestPayload && typeof options.requestPayload === "object") {
    report.request_payload = options.requestPayload;
  }
  if (options.responsePayload && typeof options.responsePayload === "object") {
    report.response_payload = options.responsePayload;
  }
  if (options.requestId) report.request_id = options.requestId;
  if (options.connectorURI) report.connector_uri = options.connectorURI;
  return report;
}

function getMiniAppDebugInfo(): Record<string, unknown> | undefined {
  const worldApp =
    typeof window !== "undefined" ? (window as any).WorldApp : undefined;
  if (!worldApp || typeof worldApp !== "object") return undefined;

  const miniApp: Record<string, unknown> = {};
  if (worldApp.world_app_version !== undefined) {
    miniApp.world_app_version = worldApp.world_app_version;
  }
  if (worldApp.device_os !== undefined) {
    miniApp.platform = worldApp.device_os;
  }

  return Object.keys(miniApp).length > 0 ? miniApp : undefined;
}
