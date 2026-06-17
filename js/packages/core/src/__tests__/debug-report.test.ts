import { afterEach, describe, expect, it, vi } from "vitest";

const {
  createNativeRequestMock,
  getWorldAppVerifyVersionMock,
  initIDKitMock,
  isInWorldAppMock,
  requestMock,
  rpContextWasmMock,
  wasmBuilderMock,
  wasmRequestMock,
} = vi.hoisted(() => ({
  createNativeRequestMock: vi.fn(),
  getWorldAppVerifyVersionMock: vi.fn(() => 2),
  initIDKitMock: vi.fn(async () => undefined),
  isInWorldAppMock: vi.fn(() => false),
  requestMock: vi.fn(),
  rpContextWasmMock: vi.fn(),
  wasmBuilderMock: {
    preset: vi.fn(),
  },
  wasmRequestMock: {
    connectUrl: vi.fn(() => "wc://request"),
    requestId: vi.fn(() => "request-id"),
    pollForStatus: vi.fn(),
    getDebugReport: vi.fn(),
  },
}));

vi.mock("../lib/wasm", () => ({
  initIDKit: initIDKitMock,
  WasmModule: {
    RpContextWasm: class {
      constructor(...args: unknown[]) {
        rpContextWasmMock(...args);
      }
    },
    request: requestMock,
  },
}));

vi.mock("../transports/native", () => ({
  createNativeRequest: createNativeRequestMock,
  getWorldAppVerifyVersion: getWorldAppVerifyVersionMock,
  isInWorldApp: isInWorldAppMock,
}));

import { IDKit, IDKitErrorCodes, orbLegacy, setDebug } from "../index";

const config = {
  app_id: "app_test" as const,
  action: "test-action",
  rp_context: {
    rp_id: "rp_test",
    nonce: "0x01",
    created_at: 1,
    expires_at: 2,
    signature: "0x1234",
  },
  allow_legacy_proofs: true,
};

const rustDebugReport = {
  transport: "bridge" as const,
  timestamps: { generated_at: "2026-06-17T00:00:00Z" },
  request_id: "request-id",
  connector_uri: "wc://request",
  request_payload: { app_id: "app_test" },
  response_payload: { bridge_status: "completed" },
};

async function createBridgeRequest() {
  requestMock.mockReturnValue(wasmBuilderMock);
  wasmBuilderMock.preset.mockResolvedValue(wasmRequestMock);

  return IDKit.request(config).preset(orbLegacy());
}

describe("debug reports", () => {
  afterEach(() => {
    setDebug(false);
    vi.clearAllMocks();
  });

  it("omits debugReport from failed completion results when debug mode is off", async () => {
    wasmRequestMock.pollForStatus.mockResolvedValue({
      type: "failed",
      error: IDKitErrorCodes.ConnectionFailed,
    });
    wasmRequestMock.getDebugReport.mockReturnValue(rustDebugReport);

    const request = await createBridgeRequest();
    const completion = await request.pollUntilCompletion({ pollInterval: 0 });

    expect(completion).toEqual({
      success: false,
      error: IDKitErrorCodes.ConnectionFailed,
    });
    expect("debugReport" in completion).toBe(false);
    expect(wasmRequestMock.getDebugReport).not.toHaveBeenCalled();
  });

  it("adds package_version to the WASM debug report when debug mode is on", async () => {
    setDebug(true);
    wasmRequestMock.pollForStatus.mockResolvedValue({
      type: "failed",
      error: IDKitErrorCodes.ConnectionFailed,
    });
    wasmRequestMock.getDebugReport.mockReturnValue(rustDebugReport);

    const request = await createBridgeRequest();
    const completion = await request.pollUntilCompletion({ pollInterval: 0 });

    expect(wasmRequestMock.getDebugReport).toHaveBeenCalledTimes(1);
    expect(completion).toEqual({
      success: false,
      error: IDKitErrorCodes.ConnectionFailed,
      debugReport: {
        ...rustDebugReport,
        package_version: "4.1.8",
      },
    });
  });
});
