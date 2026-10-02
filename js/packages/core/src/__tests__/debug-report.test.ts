import { afterEach, describe, expect, it, vi } from "vitest";
import packageJson from "../../package.json";

const {
  createNativeRequestMock,
  getWorldAppVerifyVersionMock,
  isInWorldAppMock,
  requestMock,
  bridgeRequestMock,
} = vi.hoisted(() => ({
  createNativeRequestMock: vi.fn(),
  getWorldAppVerifyVersionMock: vi.fn(() => 2),
  isInWorldAppMock: vi.fn(() => false),
  requestMock: vi.fn(),
  bridgeRequestMock: {
    connectUrl: vi.fn(() => "wc://request"),
    requestId: vi.fn(() => "request-id"),
    pollForStatus: vi.fn(),
    getDebugReport: vi.fn(),
  },
}));
vi.mock("../transports/bridge", () => ({ createBridgeRequest: requestMock }));

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
    requestMock.mockResolvedValue(bridgeRequestMock);
    bridgeRequestMock.pollForStatus.mockResolvedValue({
      type: "failed",
      error: IDKitErrorCodes.ConnectionFailed,
    });
    bridgeRequestMock.getDebugReport.mockReturnValue({
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
      expect.objectContaining({
        app_id: "app_test",
        package_name: "idkit_js_core",
        package_version: packageJson.version,
        action: "test-action",
        allow_legacy_proofs: true,
        require_user_presence: false,
      }),
      { preset: orbLegacy() },
      false,
      undefined,
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
    expect(bridgeRequestMock.getDebugReport).toHaveBeenCalledTimes(1);
  });
});
