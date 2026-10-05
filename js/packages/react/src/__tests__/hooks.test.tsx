import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDKitErrorCodes, RetryableBridgeError } from "@worldcoin/idkit-core";
import packageJson from "../../package.json";
import { toErrorCode } from "../hooks/common";
import { useIDKitRequest } from "../hooks/useIDKitRequest";
import { useIDKitInviteCodeRequest } from "../hooks/useIDKitInviteCodeRequest";
import { useIDKitSession } from "../hooks/useIDKitSession";

const {
  idKitErrorCodes,
  isInWorldAppMock,
  requestMock,
  requestWithInviteCodeMock,
  createSessionMock,
  proveSessionMock,
  createIDKitNamespaceMock,
} = vi.hoisted(() => {
  const idKitErrorCodes = {
    GenericError: "generic_error",
    ConnectionFailed: "connection_failed",
    Timeout: "timeout",
    Cancelled: "cancelled",
    MalformedRequest: "malformed_request",
    UnexpectedResponse: "unexpected_response",
    InvalidRpSignature: "invalid_rp_signature",
    NullifierReplayed: "nullifier_replayed",
    DuplicateNonce: "duplicate_nonce",
    UnknownRp: "unknown_rp",
    InactiveRp: "inactive_rp",
    TimestampTooOld: "timestamp_too_old",
    TimestampTooFarInFuture: "timestamp_too_far_in_future",
    InvalidTimestamp: "invalid_timestamp",
    RpSignatureExpired: "rp_signature_expired",
    InvalidRpIdFormat: "invalid_rp_id_format",
  };
  const requestMock = vi.fn();
  const requestWithInviteCodeMock = vi.fn();
  const createSessionMock = vi.fn();
  const proveSessionMock = vi.fn();

  return {
    idKitErrorCodes,
    isInWorldAppMock: vi.fn(() => false),
    requestMock,
    requestWithInviteCodeMock,
    createSessionMock,
    proveSessionMock,
    createIDKitNamespaceMock: vi.fn(() => ({
      request: requestMock,
      requestWithInviteCode: requestWithInviteCodeMock,
      createSession: createSessionMock,
      proveSession: proveSessionMock,
    })),
  };
});

vi.mock("@worldcoin/idkit-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@worldcoin/idkit-core")>()),
  IDKitErrorCodes: idKitErrorCodes,
  isInWorldApp: isInWorldAppMock,
  isDebug: () => false,
  createIDKitNamespace: createIDKitNamespaceMock,
}));

const baseRpContext = {
  rp_id: "rp_abc",
  nonce: "nonce",
  created_at: 1,
  expires_at: 2,
  signature: "0x1234",
};
const SESSION_ID_1 = `session_${"11".repeat(64)}` as const;
const SESSION_ID_2 = `session_${"22".repeat(64)}` as const;
const reactNamespaceOptions = {
  package_name: "idkit_react",
  package_version: packageJson.version,
};

function makeRequest(pollOnce: () => Promise<unknown>) {
  return {
    connectorURI: "wc://request",
    pollOnce: vi.fn(pollOnce),
  };
}

describe("request/session hooks", () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    isInWorldAppMock.mockReturnValue(false);
    requestMock.mockClear();
    requestWithInviteCodeMock.mockClear();
    createSessionMock.mockClear();
    proveSessionMock.mockClear();
  });

  it("creates a React namespace", () => {
    expect(createIDKitNamespaceMock).toHaveBeenCalledWith(
      reactNamespaceOptions,
    );
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
        polling: { interval: 0 },
      }),
    );

    act(() => {
      result.current.open();
    });

    expect(result.current.isAwaitingUserConnection).toBe(true);
    expect(result.current.isAwaitingUserConfirmation).toBe(false);
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
      expect(result.current.isAwaitingUserConnection).toBe(true);
      expect(result.current.isAwaitingUserConfirmation).toBe(false);
    });

    await waitFor(() => {
      expect(pollOnce).toHaveBeenCalledTimes(2);
    });
    act(() => {
      pollResolvers.shift()?.({ type: "awaiting_confirmation" });
    });
    await waitFor(() => {
      expect(result.current.isAwaitingUserConnection).toBe(false);
      expect(result.current.isAwaitingUserConfirmation).toBe(true);
    });

    await waitFor(() => {
      expect(pollOnce).toHaveBeenCalledTimes(3);
    });
    act(() => {
      pollResolvers.shift()?.({ type: "confirmed", result: { proof: "ok" } });
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
      expect(result.current.isAwaitingUserConnection).toBe(false);
      expect(result.current.isAwaitingUserConfirmation).toBe(false);
    });

    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledWith({
      app_id: "app_test",
      action: "test-action",
      rp_context: baseRpContext,
      action_description: undefined,
      bridge_url: undefined,
      return_to: undefined,
      allow_legacy_proofs: false,
      require_user_presence: false,
      override_connect_base_url: undefined,
      environment: undefined,
    });
    expect(result.current.connectorURI).toBe("wc://request");
    expect(result.current.result).toEqual({ proof: "ok" });
  });

  it("session hook uses createSession when existing_session_id is absent", async () => {
    createSessionMock.mockReturnValue({
      constraints: vi.fn(async () => ({
        connectorURI: "wc://session-create",
        pollOnce: vi.fn(async () => ({
          type: "confirmed",
          result: { session_id: SESSION_ID_1, responses: [] },
        })),
      })),
    });

    const { result } = renderHook(() =>
      useIDKitSession({
        app_id: "app_test",
        rp_context: baseRpContext,
        constraints: { all: [] },
      }),
    );

    act(() => {
      result.current.open();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(createSessionMock).toHaveBeenCalledTimes(1);
    expect(createSessionMock).toHaveBeenCalledWith({
      app_id: "app_test",
      rp_context: baseRpContext,
      action_description: undefined,
      bridge_url: undefined,
      require_user_presence: false,
      override_connect_base_url: undefined,
      return_to: undefined,
      environment: undefined,
    });
    expect(proveSessionMock).not.toHaveBeenCalled();
    expect(result.current.result?.session_id).toBe(SESSION_ID_1);
  });

  it("session hook uses proveSession when existing_session_id is provided", async () => {
    proveSessionMock.mockReturnValue({
      constraints: vi.fn(async () => ({
        connectorURI: "wc://session-prove",
        pollOnce: vi.fn(async () => ({
          type: "confirmed",
          result: { session_id: SESSION_ID_2, responses: [] },
        })),
      })),
    });

    const { result } = renderHook(() =>
      useIDKitSession({
        app_id: "app_test",
        rp_context: baseRpContext,
        existing_session_id: SESSION_ID_2,
        constraints: { all: [] },
      }),
    );

    act(() => {
      result.current.open();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(proveSessionMock).toHaveBeenCalledWith(SESSION_ID_2, {
      app_id: "app_test",
      rp_context: baseRpContext,
      action_description: undefined,
      bridge_url: undefined,
      require_user_presence: false,
      override_connect_base_url: undefined,
      return_to: undefined,
      environment: undefined,
    });
    expect(result.current.result?.session_id).toBe(SESSION_ID_2);
  });

  it("request hook forwards return_to to core", async () => {
    requestMock.mockReturnValue({
      preset: vi.fn(async () =>
        makeRequest(async () => ({
          type: "confirmed",
          result: { proof: "ok" },
        })),
      ),
    });

    const { result } = renderHook(() =>
      useIDKitRequest({
        app_id: "app_test",
        action: "test-action",
        rp_context: baseRpContext,
        allow_legacy_proofs: false,
        return_to: "idkit://callback?step=proof",
        preset: { type: "OrbLegacy" },
      }),
    );

    act(() => {
      result.current.open();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(requestMock).toHaveBeenCalledWith({
      app_id: "app_test",
      action: "test-action",
      rp_context: baseRpContext,
      action_description: undefined,
      bridge_url: undefined,
      return_to: "idkit://callback?step=proof",
      allow_legacy_proofs: false,
      require_user_presence: false,
      override_connect_base_url: undefined,
      environment: undefined,
    });
  });

  it("request hook forwards require_user_presence to core", async () => {
    requestMock.mockReturnValue({
      preset: vi.fn(async () =>
        makeRequest(async () => ({
          type: "confirmed",
          result: { proof: "ok" },
        })),
      ),
    });

    const { result } = renderHook(() =>
      useIDKitRequest({
        app_id: "app_test",
        action: "test-action",
        rp_context: baseRpContext,
        allow_legacy_proofs: false,
        require_user_presence: true,
        preset: { type: "OrbLegacy" },
      }),
    );

    act(() => {
      result.current.open();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({ require_user_presence: true }),
    );
  });

  it("session hook forwards return_to to createSession", async () => {
    createSessionMock.mockReturnValue({
      constraints: vi.fn(async () => ({
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
        return_to: "idkit://callback?step=create",
        require_user_presence: true,
        constraints: { all: [] },
      }),
    );

    act(() => {
      result.current.open();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(createSessionMock).toHaveBeenCalledWith({
      app_id: "app_test",
      rp_context: baseRpContext,
      action_description: undefined,
      bridge_url: undefined,
      require_user_presence: true,
      override_connect_base_url: undefined,
      return_to: "idkit://callback?step=create",
      environment: undefined,
    });
  });

  it("session hook forwards return_to to proveSession", async () => {
    proveSessionMock.mockReturnValue({
      constraints: vi.fn(async () => ({
        connectorURI: "wc://session-prove",
        pollOnce: vi.fn(async () => ({
          type: "confirmed",
          result: { session_id: "session_2", responses: [] },
        })),
      })),
    });

    const validSessionId = `session_${"22".repeat(64)}` as const;
    const { result } = renderHook(() =>
      useIDKitSession({
        app_id: "app_test",
        rp_context: baseRpContext,
        existing_session_id: validSessionId,
        return_to: "idkit://callback?step=prove",
        constraints: { all: [] },
      }),
    );

    act(() => {
      result.current.open();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(proveSessionMock).toHaveBeenCalledWith(validSessionId, {
      app_id: "app_test",
      rp_context: baseRpContext,
      action_description: undefined,
      bridge_url: undefined,
      require_user_presence: false,
      override_connect_base_url: undefined,
      return_to: "idkit://callback?step=prove",
      environment: undefined,
    });
  });

  it("session hook fails on empty existing_session_id", async () => {
    const { result } = renderHook(() =>
      useIDKitSession({
        app_id: "app_test",
        rp_context: baseRpContext,
        existing_session_id: "   " as unknown as `session_${string}`,
        constraints: { all: [] },
      }),
    );

    act(() => {
      result.current.open();
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.errorCode).toBe(IDKitErrorCodes.MalformedRequest);
  });

  it("session hook fails on malformed existing_session_id format", async () => {
    const { result } = renderHook(() =>
      useIDKitSession({
        app_id: "app_test",
        rp_context: baseRpContext,
        existing_session_id: "session_2" as `session_${string}`,
        constraints: { all: [] },
      }),
    );

    act(() => {
      result.current.open();
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
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
      expect(result.current.isError).toBe(true);
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
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.errorCode).toBe(IDKitErrorCodes.UnexpectedResponse);
  });

  it.each(["timeout", "cancelled", "unexpected_response"])(
    "preserves %s from core Error objects",
    (code) => {
      expect(toErrorCode(new Error(code))).toBe(code);
    },
  );

  it("maps local RpContext validation errors to specific error codes", () => {
    expect(
      toErrorCode(
        new Error(
          "Invalid RpContext: Invalid configuration: Invalid RP ID: must start with 'rp_'",
        ),
      ),
    ).toBe(IDKitErrorCodes.InvalidRpIdFormat);
    expect(
      toErrorCode(
        "Invalid RpContext: Invalid configuration: created_at cannot be in the future",
      ),
    ).toBe(IDKitErrorCodes.TimestampTooFarInFuture);
    expect(
      toErrorCode(
        "Invalid RpContext: Invalid configuration: expires_at must be greater than created_at",
      ),
    ).toBe(IDKitErrorCodes.InvalidTimestamp);
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
      result.current.reset();
    });

    expect(result.current.isAwaitingUserConnection).toBe(false);
    expect(result.current.isAwaitingUserConfirmation).toBe(false);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.result).toBeNull();
    expect(result.current.connectorURI).toBeNull();
    expect(result.current.errorCode).toBeNull();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isAwaitingUserConnection).toBe(false);
    expect(result.current.isAwaitingUserConfirmation).toBe(false);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.result).toBeNull();
    expect(result.current.connectorURI).toBeNull();
    expect(result.current.errorCode).toBeNull();
  });

  it.each(["request", "invite"] as const)(
    "%s ignores a stale handle that finishes creation after reset",
    async (mode) => {
      let resolveStale: (value: unknown) => void = () => {};
      const stale = {
        ...makeRequest(async () => ({
          type: "confirmed",
          result: { proof: "stale" },
        })),
        expiresAt: 1,
        getDebugReport: () => ({ request_id: "stale" }),
      };
      const current = {
        ...makeRequest(async () => ({ type: "waiting_for_connection" })),
        expiresAt: 2,
        getDebugReport: () => ({ request_id: "current" }),
      };
      const preset = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveStale = resolve;
            }),
        )
        .mockResolvedValue(current);
      (mode === "request"
        ? requestMock
        : requestWithInviteCodeMock
      ).mockReturnValue({ preset });
      const useRequest =
        mode === "request" ? useIDKitRequest : useIDKitInviteCodeRequest;
      const { result, unmount } = renderHook(() =>
        useRequest({
          app_id: "app_test",
          action: "test-action",
          rp_context: baseRpContext,
          allow_legacy_proofs: false,
          preset: { type: "OrbLegacy" },
        }),
      );

      act(() => result.current.open());
      await waitFor(() => expect(preset).toHaveBeenCalledTimes(1));
      act(() => {
        result.current.reset();
        result.current.open();
      });
      await waitFor(() =>
        expect(result.current.getDebugReport()).toEqual({
          request_id: "current",
        }),
      );
      await act(async () => resolveStale(stale));
      expect(stale.pollOnce).not.toHaveBeenCalled();
      expect(result.current.getDebugReport()).toEqual({
        request_id: "current",
      });
      expect(result.current.result).toBeNull();
      unmount();
    },
  );

  for (const mode of ["request", "invite"] as const) {
    const useRequest =
      mode === "request" ? useIDKitRequest : useIDKitInviteCodeRequest;
    const configure = (preset: ReturnType<typeof vi.fn>) =>
      (mode === "request"
        ? requestMock
        : requestWithInviteCodeMock
      ).mockReturnValue({ preset });
    const config = {
      app_id: "app_test" as const,
      action: "test-action",
      rp_context: baseRpContext,
      allow_legacy_proofs: false,
      preset: { type: "OrbLegacy" as const },
      polling: { interval: 100, timeout: 250 },
    };

    it(`${mode} preserves its connector and expiry contract inside World App`, async () => {
      vi.useFakeTimers();
      isInWorldAppMock.mockReturnValue(true);
      configure(
        vi.fn(async () => ({
          ...makeRequest(async () => ({ type: "waiting_for_connection" })),
          expiresAt: 1234,
        })),
      );
      const { result, unmount } = renderHook(() => useRequest(config));
      expect(result.current.connectorURI).toBeNull();
      act(() => result.current.open());
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(result.current.isInWorldApp).toBe(true);
      expect(result.current.connectorURI).toBe(
        mode === "invite" ? "wc://request" : null,
      );
      if (mode === "invite") {
        expect(result.current).toHaveProperty("codeExpiresAt", 1234);
      } else {
        expect(result.current).not.toHaveProperty("codeExpiresAt");
      }
      act(() => result.current.reset());
      expect(result.current.connectorURI).toBeNull();
      if (mode === "invite") {
        expect(result.current).toHaveProperty("codeExpiresAt", null);
      }
      expect(vi.getTimerCount()).toBe(0);
      unmount();
    });

    it(`${mode} preserves ordinary rejected-poll error mapping without retrying`, async () => {
      vi.useFakeTimers();
      const handle = {
        ...makeRequest(async () => {
          throw new Error("ordinary poll failure");
        }),
        expiresAt: 1,
      };
      configure(vi.fn(async () => handle));
      const { result, unmount } = renderHook(() => useRequest(config));
      act(() => result.current.open());
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(result.current.errorCode).toBe(IDKitErrorCodes.GenericError);
      expect(handle.pollOnce).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
      unmount();
    });

    it(`${mode} retries transport failures and preserves awaiting-confirmation state`, async () => {
      vi.useFakeTimers();
      const pollOnce = vi
        .fn()
        .mockResolvedValueOnce({ type: "awaiting_confirmation" })
        .mockRejectedValueOnce(new RetryableBridgeError("offline"))
        .mockResolvedValueOnce({ type: "confirmed", result: { proof: "ok" } });
      configure(
        vi.fn(async () => ({
          connectorURI: "wc://request",
          pollOnce,
          expiresAt: 1,
        })),
      );
      const { result, unmount } = renderHook(() => useRequest(config));
      act(() => result.current.open());
      await act(async () => vi.advanceTimersByTimeAsync(100));
      expect(result.current.isError).toBe(false);
      expect(result.current.isAwaitingUserConfirmation).toBe(true);
      await act(async () => vi.advanceTimersByTimeAsync(100));
      expect(result.current.isSuccess).toBe(true);
      expect(pollOnce).toHaveBeenCalledTimes(3);
      expect(vi.getTimerCount()).toBe(0);
      unmount();
    });

    it(`${mode} keeps a repeated outage within the original deadline`, async () => {
      vi.useFakeTimers();
      const pollOnce = vi
        .fn()
        .mockRejectedValue(new RetryableBridgeError("offline"));
      configure(
        vi.fn(async () => ({
          connectorURI: "wc://request",
          pollOnce,
          expiresAt: 1,
        })),
      );
      const { result, unmount } = renderHook(() => useRequest(config));
      act(() => result.current.open());
      await act(async () => vi.advanceTimersByTimeAsync(250));
      expect(result.current.errorCode).toBe(IDKitErrorCodes.Timeout);
      expect(pollOnce).toHaveBeenCalledTimes(3);
      expect(vi.getTimerCount()).toBe(0);
      unmount();
    });

    it(`${mode} times out hung creation and ignores the late handle`, async () => {
      vi.useFakeTimers();
      let resolveCreation!: (value: unknown) => void;
      const handle = {
        ...makeRequest(async () => ({
          type: "confirmed",
          result: { proof: "late" },
        })),
        expiresAt: 1,
      };
      const preset = vi.fn(
        () =>
          new Promise((resolve) => {
            resolveCreation = resolve;
          }),
      );
      configure(preset);
      const { result, unmount } = renderHook(() => useRequest(config));
      act(() => result.current.open());
      await act(async () => vi.advanceTimersByTimeAsync(249));
      expect(result.current.isError).toBe(false);
      await act(async () => vi.advanceTimersByTimeAsync(1));
      expect(result.current.errorCode).toBe(IDKitErrorCodes.Timeout);
      expect(result.current.connectorURI).toBeNull();
      expect((preset.mock.calls as any)[0][1].signal.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      await act(async () => resolveCreation(handle));
      expect(handle.pollOnce).not.toHaveBeenCalled();
      expect(result.current.errorCode).toBe(IDKitErrorCodes.Timeout);
      expect(result.current.connectorURI).toBeNull();
      unmount();
    });

    it(`${mode} bounds hung polling by the deadline established before creation`, async () => {
      vi.useFakeTimers();
      let rejectPoll!: (reason: Error) => void;
      const handle = {
        ...makeRequest(
          () =>
            new Promise((_resolve, reject) => {
              rejectPoll = reject;
            }),
        ),
        expiresAt: 1,
      };
      configure(
        vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
          return handle;
        }),
      );
      const { result, unmount } = renderHook(() => useRequest(config));
      act(() => result.current.open());
      await act(async () => vi.advanceTimersByTimeAsync(150));
      expect(handle.pollOnce).toHaveBeenCalledTimes(1);
      await act(async () => vi.advanceTimersByTimeAsync(99));
      expect(result.current.isError).toBe(false);
      await act(async () => vi.advanceTimersByTimeAsync(1));
      expect(result.current.errorCode).toBe(IDKitErrorCodes.Timeout);
      expect(vi.getTimerCount()).toBe(0);
      expect((handle.pollOnce.mock.calls as any)[0][0].signal.aborted).toBe(
        true,
      );
      await act(async () => rejectPoll(new Error("late transport rejection")));
      expect(result.current.errorCode).toBe(IDKitErrorCodes.Timeout);
      expect(handle.pollOnce).toHaveBeenCalledTimes(1);
      unmount();
    });

    it.each(["reset", "unmount"] as const)(
      `${mode} cancels hung polling on %s and ignores late success`,
      async (cancel) => {
        vi.useFakeTimers();
        let resolvePoll!: (value: unknown) => void;
        const handle = {
          ...makeRequest(
            () =>
              new Promise((resolve) => {
                resolvePoll = resolve;
              }),
          ),
          expiresAt: 1,
        };
        configure(vi.fn(async () => handle));
        const { result, unmount } = renderHook(() => useRequest(config));
        act(() => result.current.open());
        await act(async () => vi.advanceTimersByTimeAsync(0));
        expect(handle.pollOnce).toHaveBeenCalledTimes(1);
        if (cancel === "reset") act(() => result.current.reset());
        else unmount();
        await act(async () => vi.advanceTimersByTimeAsync(0));
        expect(vi.getTimerCount()).toBe(0);
        expect((handle.pollOnce.mock.calls as any)[0][0].signal.aborted).toBe(
          true,
        );
        await act(async () =>
          resolvePoll({ type: "confirmed", result: { proof: "stale" } }),
        );
        expect(result.current.isSuccess).toBe(false);
        expect(result.current.result).toBeNull();
        expect(handle.pollOnce).toHaveBeenCalledTimes(1);
        if (cancel === "reset") {
          expect(result.current.connectorURI).toBeNull();
          expect(result.current.errorCode).toBeNull();
          unmount();
        }
      },
    );
  }
});
