import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attachDebugReportToError,
  createIDKitDebugReport,
  setDebug,
  setDebugReportHandler,
  updateDebugReport,
  type IDKitDebugReport,
  requestModeFromConfig,
} from "./debug";

describe("IDKit debug reports", () => {
  afterEach(() => {
    setDebug(false);
    setDebugReportHandler(null);
    vi.restoreAllMocks();
  });

  it("only creates raw reports in debug mode", () => {
    const options = {
      mode: "request" as const,
      transportKind: "bridge" as const,
      config: {
        app_id: "app_staging_test",
        action: "claim",
        bridge_url:
          "https://bridge.example/request?access_token=bridge-token&proof=0xproof",
        return_to: "https://rp.example/callback?token=return-token",
      },
      connectorURI:
        "https://world.org/verify?t=wld&i=req-123&k=bridge-key&c=ABC123",
      payload: {
        app_id: "app_staging_test",
        proof_request: {
          signature: "0xsig",
          nonce: "0xnonce",
          requests: [
            {
              proof: "0xproof",
              nullifier_hash: "0xnullifier",
              safe_field: "safe",
            },
          ],
        },
      },
    };

    expect(createIDKitDebugReport(options)).toBeUndefined();

    setDebug(true);
    const report = createIDKitDebugReport(options)!;
    const serialized = JSON.stringify(report);
    const payload = report.request.payload_before_transport as any;

    expect(report.transport.bridge_url).toContain("access_token=bridge-token");
    expect(report.transport.bridge_url).toContain("proof=0xproof");
    expect(report.request.return_to).toContain("token=return-token");
    expect(report.transport.connector_uri).toContain("k=bridge-key");
    expect(report.transport.connector_uri).toContain("c=ABC123");
    expect(payload.proof_request.signature).toBe("0xsig");
    expect(payload.proof_request.nonce).toBe("0xnonce");
    expect(payload.proof_request.requests[0].proof).toBe("0xproof");
    expect(payload.proof_request.requests[0].nullifier_hash).toBe(
      "0xnullifier",
    );
    expect(payload.proof_request.requests[0].safe_field).toBe("safe");
    expect(report.request.payload_before_transport_sha256).toMatch(/^sha256:/);

    for (const secret of [
      "bridge-token",
      "bridge-key",
      "ABC123",
      "0xsig",
      "0xnonce",
      "0xproof",
      "0xnullifier",
      "return-token",
    ]) {
      expect(serialized).toContain(secret);
    }
  });

  it("emits cloned updates and attaches reports without enumerating them on errors", () => {
    setDebug(true);
    const handler = vi.fn();
    setDebugReportHandler(handler);

    const report = createIDKitDebugReport({
      mode: "request",
      transportKind: "bridge",
      config: {
        app_id: "app_staging_test",
      },
    })!;

    updateDebugReport(report, {
      status: "error",
      connectorURI: "https://world.org/verify?t=wld&i=req-123&k=secret",
      errorCode: "connection_failed",
    });

    const emitted = handler.mock.calls[0][0] as IDKitDebugReport;
    expect(emitted).not.toBe(report);
    expect(emitted.lifecycle.error_code).toBe("connection_failed");
    expect(emitted.transport.connector_uri).toContain("secret");

    const error = new Error("boom") as Error & {
      debugPayload?: unknown;
      debugReport?: IDKitDebugReport;
    };
    error.debugPayload = { proof_request: { signature: "0xsig" } };

    attachDebugReportToError(error, report);

    expect(error.debugPayload).toBeUndefined();
    expect(error.debugReport).toEqual(report);
    expect(Object.keys(error)).not.toContain("debugReport");
    expect(JSON.stringify(error)).not.toContain("0xsig");
  });

  it("maps builder config request types into debug report modes", () => {
    expect(requestModeFromConfig({ type: "request" })).toBe("request");
    expect(requestModeFromConfig({ type: "createSession" })).toBe(
      "create_session",
    );
    expect(requestModeFromConfig({ type: "proveSession" })).toBe(
      "prove_session",
    );
  });
});
