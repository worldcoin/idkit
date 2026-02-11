import { beforeEach, describe, expect, it, vi } from "vitest";

const { initMock, requestMock, createSessionMock, proveSessionMock } =
  vi.hoisted(() => ({
    initMock: vi.fn(async () => undefined),
    requestMock: vi.fn(),
    createSessionMock: vi.fn(),
    proveSessionMock: vi.fn(),
  }));

vi.mock("@worldcoin/idkit-core", () => {
  return {
    IDKit: {
      init: initMock,
      request: requestMock,
      createSession: createSessionMock,
      proveSession: proveSessionMock,
    },
    IDKitErrorCodes: {
      GenericError: "generic_error",
    },
  };
});

import { runRequestFlow, runSessionFlow } from "../core/engine";

function makeBuilder(result: unknown) {
  return {
    preset: vi.fn(async () => ({
      connectorURI: "wc://flow",
      pollOnce: vi.fn(async () => ({ type: "confirmed", result })),
    })),
  };
}

describe("engine flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes through core poll status values in runRequestFlow", async () => {
    const resultPayload = { proof: "ok" };
    const pollOnce = vi
      .fn()
      .mockResolvedValueOnce({ type: "waiting_for_connection" })
      .mockResolvedValueOnce({ type: "awaiting_confirmation" })
      .mockResolvedValueOnce({ type: "confirmed", result: resultPayload });

    requestMock.mockReturnValue({
      preset: vi.fn(async () => ({
        connectorURI: "wc://request",
        pollOnce,
      })),
    });

    const statuses: string[] = [];

    const result = await runRequestFlow(
      {
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
        pollInterval: 0,
      },
      {
        onStatusChange: status => {
          statuses.push(status);
        },
      },
    );

    expect(initMock).toHaveBeenCalledTimes(1);
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(result).toBe(resultPayload);
    expect(statuses).toEqual([
      "preparing",
      "waiting_for_connection",
      "awaiting_confirmation",
      "confirmed",
    ]);
  });

  it("uses createSession when existing_session_id is absent", async () => {
    const builder = makeBuilder({ session_id: "session_1", responses: [] });
    createSessionMock.mockReturnValue(builder);

    const result = await runSessionFlow({
      app_id: "app_test",
      rp_context: {
        rp_id: "rp_abc",
        nonce: "nonce",
        created_at: 1,
        expires_at: 2,
        signature: "0x1234",
      },
      preset: { type: "OrbLegacy" },
    });

    expect(initMock).toHaveBeenCalledTimes(1);
    expect(createSessionMock).toHaveBeenCalledTimes(1);
    expect(proveSessionMock).not.toHaveBeenCalled();
    expect(result.session_id).toBe("session_1");
  });

  it("uses proveSession when existing_session_id is provided", async () => {
    const builder = makeBuilder({ session_id: "session_2", responses: [] });
    proveSessionMock.mockReturnValue(builder);

    const result = await runSessionFlow({
      app_id: "app_test",
      rp_context: {
        rp_id: "rp_abc",
        nonce: "nonce",
        created_at: 1,
        expires_at: 2,
        signature: "0x1234",
      },
      existing_session_id: "session_2",
      preset: { type: "OrbLegacy" },
    });

    expect(proveSessionMock).toHaveBeenCalledWith("session_2", {
      app_id: "app_test",
      rp_context: {
        rp_id: "rp_abc",
        nonce: "nonce",
        created_at: 1,
        expires_at: 2,
        signature: "0x1234",
      },
      action_description: undefined,
      bridge_url: undefined,
      override_connect_base_url: undefined,
      environment: undefined,
    });
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(result.session_id).toBe("session_2");
  });

  it("throws for empty existing_session_id", async () => {
    await expect(
      runSessionFlow({
        app_id: "app_test",
        rp_context: {
          rp_id: "rp_abc",
          nonce: "nonce",
          created_at: 1,
          expires_at: 2,
          signature: "0x1234",
        },
        existing_session_id: "   ",
        preset: { type: "OrbLegacy" },
      }),
    ).rejects.toThrow("existing_session_id cannot be an empty string");
  });
});
