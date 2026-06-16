import { afterEach, describe, expect, it, vi } from "vitest";

const wasmMock = vi.hoisted(() => {
  const state: { nextRequest?: unknown } = {};

  return {
    state,
    request: vi.fn(() => ({
      constraints: vi.fn(async () => state.nextRequest),
      constraintsWithInviteCode: vi.fn(async () => state.nextRequest),
      nativePayload: vi.fn(),
      nativePayloadFromPreset: vi.fn(),
      nativePayloadV1FromPreset: vi.fn(),
      preset: vi.fn(async () => state.nextRequest),
      presetWithInviteCode: vi.fn(async () => state.nextRequest),
    })),
    RpContextWasm: vi.fn(),
  };
});

vi.mock("./lib/wasm", () => ({
  initIDKit: vi.fn(async () => {}),
  WasmModule: {
    RpContextWasm: wasmMock.RpContextWasm,
    request: wasmMock.request,
    createSession: vi.fn(),
    proveSession: vi.fn(),
  },
}));

import { CredentialRequest, IDKit } from "./request";
import { setDebug } from "./lib/debug";

const baseConfig = {
  app_id: "app_staging_test",
  action: "test-action",
  rp_context: {
    rp_id: "rp_test",
    nonce: "0x01",
    created_at: 1,
    expires_at: 2,
    signature: "0x1234",
  },
  allow_legacy_proofs: false,
} as const;

function makeWasmRequest(status: object, inviteCode = false) {
  return {
    connectUrl: vi.fn(() => "https://world.org/verify?t=wld&i=req_1"),
    debugPayload: vi.fn(() => ({ proof_request: { id: "req_1" } })),
    expiresAt: vi.fn(() => 123),
    pollForStatus: vi.fn(async () => status),
    requestId: vi.fn(() => inviteCode ? "invite_req_1" : "req_1"),
  };
}

describe("bridge debug reports", () => {
  afterEach(() => {
    setDebug(false);
    delete (globalThis as any).window;
    wasmMock.state.nextRequest = undefined;
    vi.clearAllMocks();
  });

  it("stores the latest bridge poll status as response_payload", async () => {
    setDebug(true);
    const status = { type: "awaiting_confirmation" };
    const wasmRequest = makeWasmRequest(status);
    wasmMock.state.nextRequest = wasmRequest;

    const request = await IDKit.request(baseConfig).constraints(
      CredentialRequest("proof_of_human"),
    );

    expect(request.getDebugReport()).toMatchObject({
      request_id: "req_1",
      request_payload: { proof_request: { id: "req_1" } },
    });
    expect(request.getDebugReport()).not.toHaveProperty("response_payload");

    await expect(request.pollOnce()).resolves.toBe(status);

    expect(request.getDebugReport()).toMatchObject({
      request_id: "req_1",
      request_payload: { proof_request: { id: "req_1" } },
      response_payload: status,
    });
  });

  it("stores the latest invite-code poll status as response_payload", async () => {
    setDebug(true);
    const status = {
      type: "confirmed",
      result: { protocol_version: "4.0", verification_level: "Orb" },
    };
    const wasmRequest = makeWasmRequest(status, true);
    wasmMock.state.nextRequest = wasmRequest;

    const request = await IDKit.requestWithInviteCode(baseConfig).constraints(
      CredentialRequest("proof_of_human"),
    );

    expect(request.getDebugReport()).not.toHaveProperty("response_payload");

    await expect(request.pollOnce()).resolves.toBe(status);

    expect(request.getDebugReport()).toMatchObject({
      request_id: "invite_req_1",
      response_payload: status,
    });
  });
});
