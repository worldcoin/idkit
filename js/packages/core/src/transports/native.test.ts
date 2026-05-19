import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDKitErrorCodes } from "../types/result";
import type { BuilderConfig } from "./native";
import { createNativeRequest, getWorldAppVerifyVersion } from "./native";
import { hashSignal } from "../lib/hashing";

const baseConfig: BuilderConfig = {
  type: "request",
  app_id: "app_staging_test",
  action: "test-action",
};

const proofResponseProof = [1n, 2n, 3n, 4n, 5n]
  .map((value) => value.toString(16).padStart(64, "0"))
  .join("");

function proofResponseNullifier(value: string): string {
  return `nil_${value.padStart(64, "0")}`;
}

describe("native transport request lifecycle", () => {
  let listeners: Array<(event: MessageEvent) => void> = [];
  let miniKitHandlers: Record<string, (payload: any) => void> = {};
  let activeRequest: any;

  beforeEach(() => {
    listeners = [];
    miniKitHandlers = {};
    activeRequest = null;

    (globalThis as any).window = {
      addEventListener: vi.fn(
        (type: string, handler: (e: MessageEvent) => void) => {
          if (type === "message") listeners.push(handler);
        },
      ),
      removeEventListener: vi.fn(
        (type: string, handler: (e: MessageEvent) => void) => {
          if (type !== "message") return;
          listeners = listeners.filter((h) => h !== handler);
        },
      ),
      Android: {
        postMessage: vi.fn(),
      },
      MiniKit: {
        subscribe: vi.fn((event: string, handler: (payload: any) => void) => {
          miniKitHandlers[event] = handler;
        }),
        unsubscribe: vi.fn((event: string) => {
          delete miniKitHandlers[event];
        }),
      },
    };
  });

  afterEach(() => {
    activeRequest?.cancel?.();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete (globalThis as any).window;
  });

  it("reuses the in-flight native request instead of cancelling it", async () => {
    const req1 = createNativeRequest({ payload: 1 }, baseConfig, {}, "");
    activeRequest = req1;
    const req2 = createNativeRequest({ payload: 2 }, baseConfig, {}, "");

    expect(req2).toBe(req1);

    const completionPromise = req2.pollUntilCompletion({ timeout: 1000 });

    listeners.forEach((handler) =>
      handler({
        data: {
          type: "miniapp-verify-action",
          payload: {
            status: "success",
            protocol_version: "3.0",
            verification_level: "orb",
            signal_hash: "0xabc",
            proof: "0x01",
            merkle_root: "0x02",
            nullifier_hash: "0x03",
          },
        },
      } as MessageEvent),
    );

    const completion = await completionPromise;
    expect(completion.success).toBe(true);
    if (completion.success) {
      expect(completion.result.responses[0]?.signal_hash).toBe("0xabc");
    }
  });

  it("resolves from MiniKit event channel", async () => {
    const req = createNativeRequest({ payload: 1 }, baseConfig, {}, "");
    activeRequest = req;

    const completionPromise = req.pollUntilCompletion({ timeout: 1000 });

    miniKitHandlers["miniapp-verify-action"]?.({
      status: "success",
      protocol_version: "3.0",
      verification_level: "orb",
      signal_hash: "0xabc",
      proof: "0x01",
      merkle_root: "0x02",
      nullifier_hash: "0x03",
    });

    const completion = await completionPromise;
    expect(completion.success).toBe(true);
  });

  it("uses per-identifier signal hashes when response omits signal_hash", async () => {
    const signalHashes = {
      proof_of_human: hashSignal("poh-signal"),
      selfie: hashSignal("selfie-signal"),
    };

    const req = createNativeRequest({}, baseConfig, signalHashes, "");
    activeRequest = req;

    const completionPromise = req.pollUntilCompletion({ timeout: 1000 });

    miniKitHandlers["miniapp-verify-action"]?.({
      status: "success",
      proof_response: {
        id: "req_abc123",
        version: 1,
        responses: [
          {
            identifier: "proof_of_human",
            proof: proofResponseProof,
            nullifier: proofResponseNullifier("a"),
            issuer_schema_id: 1,
            expires_at_min: 0,
          },
          {
            identifier: "selfie",
            proof: proofResponseProof,
            nullifier: proofResponseNullifier("b"),
            issuer_schema_id: 11,
            expires_at_min: 0,
          },
        ],
      },
    });

    const completion = await completionPromise;
    expect(completion.success).toBe(true);
    if (completion.success) {
      expect(completion.result.responses[0]?.signal_hash).toBe(
        signalHashes.proof_of_human,
      );
      expect(completion.result.responses[1]?.signal_hash).toBe(
        signalHashes.selfie,
      );
    }
  });

  it("normalizes wrapped v4 ProofResponse fields from native host", async () => {
    const req = createNativeRequest({}, baseConfig, {}, "");
    activeRequest = req;

    const completionPromise = req.pollUntilCompletion({ timeout: 1000 });

    miniKitHandlers["miniapp-verify-action"]?.({
      status: "success",
      proof_response: {
        id: "req_abc123",
        version: 1,
        responses: [
          {
            identifier: "proof_of_human",
            proof: proofResponseProof,
            nullifier: proofResponseNullifier("a"),
            issuer_schema_id: 1,
            expires_at_min: 0,
          },
        ],
      },
    });

    const completion = await completionPromise;
    expect(completion.success).toBe(true);
    if (completion.success) {
      expect(completion.result.protocol_version).toBe("4.0");
      expect(completion.result.responses[0]).toMatchObject({
        proof: ["1", "2", "3", "4", "5"],
        nullifier: `0x${"a".padStart(64, "0")}`,
      });
    }
  });

  it("maps v4 ProofResponse error codes from native host", async () => {
    const req = createNativeRequest({}, baseConfig, {}, "");
    activeRequest = req;

    const completionPromise = req.pollUntilCompletion({ timeout: 1000 });

    miniKitHandlers["miniapp-verify-action"]?.({
      status: "success",
      proof_response: {
        id: "req_abc123",
        version: 1,
        error: "nullifier_replay",
        responses: [],
      },
    });

    const completion = await completionPromise;
    expect(completion).toEqual({
      success: false,
      error: IDKitErrorCodes.NullifierReplayed,
    });
  });

  it("rejects root v4 ProofResponse instead of treating it as legacy v3", async () => {
    const req = createNativeRequest({}, baseConfig, {}, "");
    activeRequest = req;

    const completionPromise = req.pollUntilCompletion({ timeout: 1000 });

    miniKitHandlers["miniapp-verify-action"]?.({
      id: "req_abc123",
      version: 1,
      responses: [
        {
          identifier: "proof_of_human",
          proof: proofResponseProof,
          nullifier: proofResponseNullifier("a"),
          issuer_schema_id: 1,
          expires_at_min: 0,
        },
      ],
    });

    await expect(completionPromise).resolves.toEqual({
      success: false,
      error: IDKitErrorCodes.UnexpectedResponse,
    });
  });

  it("prefers response signal_hash over signal hashes map", async () => {
    const signalHashes = { proof_of_human: hashSignal("from-constraints") };

    const req = createNativeRequest({}, baseConfig, signalHashes, "");
    activeRequest = req;

    const completionPromise = req.pollUntilCompletion({ timeout: 1000 });

    miniKitHandlers["miniapp-verify-action"]?.({
      status: "success",
      protocol_version: "3.0",
      verification_level: "orb",
      signal_hash: "0xfromresponse",
      proof: "0x01",
      merkle_root: "0x02",
      nullifier_hash: "0x03",
    });

    const completion = await completionPromise;
    expect(completion.success).toBe(true);
    if (completion.success) {
      expect(completion.result.responses[0]?.signal_hash).toBe(
        "0xfromresponse",
      );
    }
  });

  it("allows creating a fresh request after timeout", async () => {
    vi.useFakeTimers();

    const req1 = createNativeRequest({ payload: 1 }, baseConfig, {}, "");
    activeRequest = req1;

    const completionPromise = req1.pollUntilCompletion({ timeout: 1000 });
    await vi.advanceTimersByTimeAsync(1000);

    await expect(completionPromise).resolves.toEqual({
      success: false,
      error: IDKitErrorCodes.Timeout,
    });

    const req2 = createNativeRequest({ payload: 2 }, baseConfig, {}, "");
    expect(req2).not.toBe(req1);
    activeRequest = req2;
  });

  it("sends version in postMessage envelope", () => {
    const req = createNativeRequest({ data: "test" }, baseConfig, {}, "", 1);
    activeRequest = req;

    const postMessageFn = (globalThis as any).window.Android.postMessage;
    expect(postMessageFn).toHaveBeenCalledTimes(1);

    const sent = JSON.parse(postMessageFn.mock.calls[0][0]);
    expect(sent.version).toBe(1);
    expect(sent.command).toBe("verify");
  });
});

describe("getWorldAppVerifyVersion", () => {
  afterEach(() => {
    delete (globalThis as any).window;
  });

  it("returns 2 when verify v2 is listed in supported_commands", () => {
    (globalThis as any).window = {
      WorldApp: {
        supported_commands: [{ name: "verify", supported_versions: [1, 2] }],
      },
    };

    expect(getWorldAppVerifyVersion()).toBe(2);
  });

  it("returns 1 when verify only supports v1", () => {
    (globalThis as any).window = {
      WorldApp: {
        supported_commands: [{ name: "verify", supported_versions: [1] }],
      },
    };

    expect(getWorldAppVerifyVersion()).toBe(1);
  });

  it("returns 1 when WorldApp is missing", () => {
    (globalThis as any).window = {};

    expect(getWorldAppVerifyVersion()).toBe(1);
  });

  it("returns 1 when supported_commands is missing", () => {
    (globalThis as any).window = {
      WorldApp: {},
    };

    expect(getWorldAppVerifyVersion()).toBe(1);
  });

  it("returns 1 when supported_versions is missing on verify", () => {
    (globalThis as any).window = {
      WorldApp: {
        supported_commands: [{ name: "verify" }],
      },
    };

    expect(getWorldAppVerifyVersion()).toBe(1);
  });
});
