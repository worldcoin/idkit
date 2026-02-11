import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { runRequestFlowMock, runSessionFlowMock } = vi.hoisted(() => ({
  runRequestFlowMock: vi.fn(),
  runSessionFlowMock: vi.fn(),
}));

vi.mock("../core/engine", () => ({
  runRequestFlow: runRequestFlowMock,
  runSessionFlow: runSessionFlowMock,
}));

import { useIDKitRequest } from "../hooks/useIDKitRequest";

describe("useIDKitRequest", () => {
  it("opens flow and exposes connector/result", async () => {
    runRequestFlowMock.mockImplementation(async (_config, options) => {
      options.onStatusChange?.("waiting_for_connection");
      options.onConnectorURI?.("wc://request");
      options.onStatusChange?.("confirmed");
      return { proof: "ok" };
    });

    const { result } = renderHook(() =>
      useIDKitRequest({
        app_id: "app_test",
        action: "test-action",
        rp_context: {
          rp_id: "rp_abc",
          nonce: "nonce",
          created_at: 1,
          expires_at: 2,
          signature: "0x1234",
        },
        allow_legacy_proofs: false,
        preset: { type: "OrbLegacy" },
      }),
    );

    act(() => {
      result.current.open();
    });

    await waitFor(() => {
      expect(result.current.status).toBe("confirmed");
    });

    expect(result.current.connectorURI).toBe("wc://request");
    expect(result.current.result).toEqual({ proof: "ok" });
  });

  it("resets when closed", async () => {
    runRequestFlowMock.mockResolvedValue({ proof: "ok" });

    const { result } = renderHook(() =>
      useIDKitRequest({
        app_id: "app_test",
        action: "test-action",
        rp_context: {
          rp_id: "rp_abc",
          nonce: "nonce",
          created_at: 1,
          expires_at: 2,
          signature: "0x1234",
        },
        allow_legacy_proofs: false,
        preset: { type: "OrbLegacy" },
      }),
    );

    act(() => {
      result.current.open();
    });

    await waitFor(() => {
      expect(result.current.status).toBe("confirmed");
    });

    act(() => {
      result.current.setOpen(false);
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.result).toBeNull();
    expect(result.current.connectorURI).toBeNull();
  });
});
