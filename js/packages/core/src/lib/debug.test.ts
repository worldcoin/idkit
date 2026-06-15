import { afterEach, describe, expect, it, vi } from "vitest";
import {
  attachDebugReportToError,
  createIDKitDebugReport,
  setDebug,
  setDebugReportHandler,
  updateDebugReport,
  type IDKitDebugReport,
} from "./debug";

describe("safe IDKit debug reports", () => {
  afterEach(() => {
    setDebug(false);
    setDebugReportHandler(null);
    vi.restoreAllMocks();
  });

  it("only creates safe reports in debug mode", () => {
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

    expect(report.transport.bridge_url).toContain(
      "access_token=%5Bredacted%5D",
    );
    expect(report.request.return_to).toContain("token=%5Bredacted%5D");
    expect(report.transport.connector_uri_redacted).toContain(
      "k=%5Bredacted%5D",
    );
    expect(report.transport.connector_uri_redacted).toContain(
      "c=%5Bredacted%5D",
    );
    expect(payload.proof_request.signature).toMatchObject({
      redacted: true,
    });
    expect(payload.proof_request.nonce).toMatchObject({ redacted: true });
    expect(payload.proof_request.requests[0].proof).toMatchObject({
      redacted: true,
    });
    expect(payload.proof_request.requests[0].nullifier_hash).toMatchObject({
      redacted: true,
    });
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
      expect(serialized).not.toContain(secret);
    }
  });

  it("emits cloned updates and replaces raw error debug payloads", () => {
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
    expect(emitted.transport.connector_uri_redacted).not.toContain("secret");

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
});
