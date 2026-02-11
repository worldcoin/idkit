import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDKitErrorCodes } from "@worldcoin/idkit-core";
import { useIDKitRequest } from "../hooks/useIDKitRequest";
import { useIDKitSession } from "../hooks/useIDKitSession";

const { initMock, requestMock, createSessionMock, proveSessionMock } =
  vi.hoisted(() => ({
    initMock: vi.fn(async () => undefined),
    requestMock: vi.fn(),
    createSessionMock: vi.fn(),
    proveSessionMock: vi.fn(),
  }));

vi.mock("@worldcoin/idkit-core", () => ({
  IDKit: {
    init: initMock,
    request: requestMock,
    createSession: createSessionMock,
    proveSession: proveSessionMock,
  },
  IDKitErrorCodes: {
    GenericError: "generic_error",
    ConnectionFailed: "connection_failed",
    Timeout: "timeout",
    Cancelled: "cancelled",
    MalformedRequest: "malformed_request",
    UnexpectedResponse: "unexpected_response",
  },
}));

const baseRpContext = {
  rp_id: "rp_abc",
  nonce: "nonce",
  created_at: 1,
  expires_at: 2,
  signature: "0x1234",
};

function makeRequest(pollOnce: () => Promise<unknown>) {
  return {
    connectorURI: "wc://request",
    pollOnce: vi.fn(pollOnce),
  };
}

describe("request/session hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("request hook exposes full status sequence and result", async () => {
    const pollResolvers: Array<(value: unknown) => void> = [];
    const pollOnce = vi.fn(
      () =>
        new Promise((resolve) => {
          pollResolvers.push(resolve);
        }),
    );

    requestMock.mockReturnValue({
      preset: vi.fn(async () => ({
        connectorURI: "wc://request",
        pollOnce,
      })),
    });

    const { result } = renderHook(() =>
      useIDKitRequest({
        app_id: "app_test",
        action: "test-action",
        rp_context: baseRpContext,
        allow_legacy_proofs: false,
        preset: { type: "OrbLegacy" },
        pollInterval: 0,
      }),
    );

    act(() => {
      result.current.open();
    });

    expect(result.current.status).toBe("waiting_for_connection");
    await waitFor(() => {
      expect(result.current.connectorURI).toBe("wc://request");
    });
    await waitFor(() => {
      expect(pollOnce).toHaveBeenCalledTimes(1);
    });

    act(() => {
      pollResolvers.shift()?.({ type: "waiting_for_connection" });
    });
    await waitFor(() => {
      expect(result.current.status).toBe("waiting_for_connection");
    });

    await waitFor(() => {
      expect(pollOnce).toHaveBeenCalledTimes(2);
    });
    act(() => {
      pollResolvers.shift()?.({ type: "awaiting_confirmation" });
    });
    await waitFor(() => {
      expect(result.current.status).toBe("awaiting_confirmation");
    });

    await waitFor(() => {
      expect(pollOnce).toHaveBeenCalledTimes(3);
    });
    act(() => {
      pollResolvers.shift()?.({ type: "confirmed", result: { proof: "ok" } });
    });
    await waitFor(() => {
      expect(result.current.status).toBe("confirmed");
    });

    expect(initMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(result.current.connectorURI).toBe("wc://request");
    expect(result.current.result).toEqual({ proof: "ok" });
  });

  it("session hook uses createSession when existing_session_id is absent", async () => {
    createSessionMock.mockReturnValue({
      preset: vi.fn(async () => ({
        connectorURI: "wc://session-create",
        pollOnce: vi.fn(async () => ({
          type: "confirmed",
          result: { session_id: "session_1", responses: [] },
        })),
      })),
    });

    const { result } = renderHook(() =>
      useIDKitSession({
        app_id: "app_test",
        rp_context: baseRpContext,
        preset: { type: "OrbLegacy" },
      }),
    );

    act(() => {
      result.current.open();
    });

    await waitFor(() => {
      expect(result.current.status).toBe("confirmed");
    });

    expect(createSessionMock).toHaveBeenCalledTimes(1);
    expect(proveSessionMock).not.toHaveBeenCalled();
    expect(result.current.result?.session_id).toBe("session_1");
  });

  it("session hook uses proveSession when existing_session_id is provided", async () => {
    proveSessionMock.mockReturnValue({
      preset: vi.fn(async () => ({
        connectorURI: "wc://session-prove",
        pollOnce: vi.fn(async () => ({
          type: "confirmed",
          result: { session_id: "session_2", responses: [] },
        })),
      })),
    });

    const { result } = renderHook(() =>
      useIDKitSession({
        app_id: "app_test",
        rp_context: baseRpContext,
        existing_session_id: "session_2",
        preset: { type: "OrbLegacy" },
      }),
    );

    act(() => {
      result.current.open();
    });

    await waitFor(() => {
      expect(result.current.status).toBe("confirmed");
    });

    expect(proveSessionMock).toHaveBeenCalledWith("session_2", {
      app_id: "app_test",
      rp_context: baseRpContext,
      action_description: undefined,
      bridge_url: undefined,
      override_connect_base_url: undefined,
      environment: undefined,
    });
    expect(result.current.result?.session_id).toBe("session_2");
  });

  it("session hook fails on empty existing_session_id", async () => {
    const { result } = renderHook(() =>
      useIDKitSession({
        app_id: "app_test",
        rp_context: baseRpContext,
        existing_session_id: "   ",
        preset: { type: "OrbLegacy" },
      }),
    );

    act(() => {
      result.current.open();
    });

    await waitFor(() => {
      expect(result.current.status).toBe("failed");
    });

    expect(result.current.errorCode).toBe(IDKitErrorCodes.MalformedRequest);
  });

  it("request hook maps failed core status to errorCode", async () => {
    requestMock.mockReturnValue({
      preset: vi.fn(async () =>
        makeRequest(async () => ({
          type: "failed",
          error: "connection_failed",
        })),
      ),
    });

    const { result } = renderHook(() =>
      useIDKitRequest({
        app_id: "app_test",
        action: "test-action",
        rp_context: baseRpContext,
        allow_legacy_proofs: false,
        preset: { type: "OrbLegacy" },
      }),
    );

    act(() => {
      result.current.open();
    });

    await waitFor(() => {
      expect(result.current.status).toBe("failed");
    });

    expect(result.current.errorCode).toBe(IDKitErrorCodes.ConnectionFailed);
  });

  it("request hook maps confirmed status without payload to unexpected_response", async () => {
    requestMock.mockReturnValue({
      preset: vi.fn(async () =>
        makeRequest(async () => ({
          type: "confirmed",
        })),
      ),
    });

    const { result } = renderHook(() =>
      useIDKitRequest({
        app_id: "app_test",
        action: "test-action",
        rp_context: baseRpContext,
        allow_legacy_proofs: false,
        preset: { type: "OrbLegacy" },
      }),
    );

    act(() => {
      result.current.open();
    });

    await waitFor(() => {
      expect(result.current.status).toBe("failed");
    });

    expect(result.current.errorCode).toBe(IDKitErrorCodes.UnexpectedResponse);
  });

  it("reset/close aborts active run and prevents stale result updates", async () => {
    requestMock.mockReturnValue({
      preset: vi.fn(async () =>
        makeRequest(async () => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return { type: "confirmed", result: { proof: "late-proof" } };
        }),
      ),
    });

    const { result } = renderHook(() =>
      useIDKitRequest({
        app_id: "app_test",
        action: "test-action",
        rp_context: baseRpContext,
        allow_legacy_proofs: false,
        preset: { type: "OrbLegacy" },
      }),
    );

    act(() => {
      result.current.open();
    });

    await waitFor(() => {
      expect(result.current.connectorURI).toBe("wc://request");
    });

    act(() => {
      result.current.setOpen(false);
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.result).toBeNull();
    expect(result.current.connectorURI).toBeNull();
    expect(result.current.errorCode).toBeNull();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.status).toBe("idle");
    expect(result.current.result).toBeNull();
    expect(result.current.connectorURI).toBeNull();
    expect(result.current.errorCode).toBeNull();
  });
});
