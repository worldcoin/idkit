import { beforeEach, describe, expect, it, vi } from "vitest";

const initMock = vi.fn(async () => undefined);
const createSessionMock = vi.fn();
const proveSessionMock = vi.fn();

vi.mock("@worldcoin/idkit-core", () => {
  return {
    IDKit: {
      init: initMock,
      createSession: createSessionMock,
      proveSession: proveSessionMock,
    },
    AppErrorCodes: {
      GenericError: "generic_error",
    },
  };
});

import { runSessionFlow } from "../core/engine";

function makeBuilder(result: unknown) {
  return {
    preset: vi.fn(async () => ({
      connectorURI: "wc://flow",
      pollOnce: vi.fn(async () => ({ type: "confirmed", result })),
    })),
    constraints: vi.fn(async () => ({
      connectorURI: "wc://flow",
      pollOnce: vi.fn(async () => ({ type: "confirmed", result })),
    })),
  };
}

describe("runSessionFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      constraints: { any: [] },
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
