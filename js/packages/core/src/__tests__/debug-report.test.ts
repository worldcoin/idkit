import { afterEach, describe, expect, it, vi } from "vitest";
import packageJson from "../../package.json";

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

describe("debug reports", () => {
  afterEach(() => {
    setDebug(false);
    vi.clearAllMocks();
  });

  it("exposes a debugReport via getDebugReport() regardless of debug mode", async () => {
    setDebug(false);
    requestMock.mockReturnValue(wasmBuilderMock);
    wasmBuilderMock.preset.mockResolvedValue(wasmRequestMock);
    wasmRequestMock.pollForStatus.mockResolvedValue({
      type: "failed",
      error: IDKitErrorCodes.ConnectionFailed,
    });
    wasmRequestMock.getDebugReport.mockReturnValue({
      transport: "bridge",
      generated_at: "2026-06-17T00:00:00Z",
      request_id: "request-id",
      request_payload: { app_id: "app_test" },
      response_payload: { bridge_status: "retrieved" },
    });

    const request = await IDKit.request({
      app_id: "app_test",
      action: "test-action",
      rp_context: {
        rp_id: "rp_test",
        nonce: "0x01",
        created_at: 1,
        expires_at: 2,
        signature: "0x1234",
      },
      allow_legacy_proofs: true,
    }).preset(orbLegacy());

    expect(requestMock).toHaveBeenCalledWith(
      "app_test",
      "idkit_js_core",
      packageJson.version,
      "test-action",
      expect.anything(),
      null,
      null,
      true,
      false,
      null,
      null,
      null,
    );

    const completion = await request.pollUntilCompletion({ pollInterval: 0 });

    // The completion result no longer carries the debug report.
    expect(completion).toEqual({
      success: false,
      error: IDKitErrorCodes.ConnectionFailed,
    });

    // The report is fetched on demand from the request handle.
    expect(request.getDebugReport()).toEqual({
      version: 1,
      transport: "bridge",
      generated_at: "2026-06-17T00:00:00Z",
      request_id: "request-id",
      request_payload: { app_id: "app_test" },
      response_payload: { bridge_status: "retrieved" },
      package_version: packageJson.version,
    });
    expect(wasmRequestMock.getDebugReport).toHaveBeenCalledTimes(1);
  });
});
