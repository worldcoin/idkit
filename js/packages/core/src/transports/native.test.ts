import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDKitErrorCodes } from "../types/result";
import type { BuilderConfig } from "./native";
import { createNativeRequest } from "./native";

const baseConfig: BuilderConfig = {
  type: "request",
  app_id: "app_staging_test",
  action: "test-action",
};

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
    const req1 = createNativeRequest({ payload: 1 }, baseConfig);
    activeRequest = req1;
    const req2 = createNativeRequest({ payload: 2 }, baseConfig);

    expect(req2).toBe(req1);

    const completionPromise = req2.pollUntilCompletion({ timeout: 1000 });

    // Simulate World App native success message.
    listeners.forEach((handler) =>
      handler({
        data: {
          type: "miniapp-verify-action",
          payload: {
            status: "success",
            protocol_version: "3.0",
            verification_level: "orb",
            signal_hash:
              "0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4",
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
      expect(completion.result.responses[0]?.signal_hash).toBe(
        "0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4",
      );
    }
  });

  it("resolves from MiniKit event channel when postMessage is not used", async () => {
    const req = createNativeRequest({ payload: 1 }, baseConfig);
    activeRequest = req;

    expect((window as any).MiniKit.subscribe).toHaveBeenCalledWith(
      "miniapp-verify-action",
      expect.any(Function),
    );

    const completionPromise = req.pollUntilCompletion({ timeout: 1000 });

    miniKitHandlers["miniapp-verify-action"]?.({
      status: "success",
      protocol_version: "3.0",
      verification_level: "orb",
      signal_hash:
        "0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4",
      proof: "0x01",
      merkle_root: "0x02",
      nullifier_hash: "0x03",
    });

    const completion = await completionPromise;
    expect(completion.success).toBe(true);
    if (completion.success) {
      expect(completion.result.responses[0]?.signal_hash).toBe(
        "0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4",
      );
    }
    expect((window as any).MiniKit.unsubscribe).toHaveBeenCalledWith(
      "miniapp-verify-action",
    );
  });

  it("maps signal_hash for legacy multi-verification native payloads", async () => {
    const req = createNativeRequest({ payload: 1 }, baseConfig);
    activeRequest = req;

    const completionPromise = req.pollUntilCompletion({ timeout: 1000 });

    miniKitHandlers["miniapp-verify-action"]?.({
      status: "success",
      verifications: [
        {
          verification_level: "orb",
          signal_hash:
            "0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4",
          proof: "0x01",
          merkle_root: "0x02",
          nullifier_hash: "0x03",
        },
        {
          verification_level: "device",
          signal_hash:
            "0x0f7cfd8ad7f6f3793f6fca63ef9f998f6d1ee6125f68ff9c7a7fd0dfaca8757f",
          proof: "0x11",
          merkle_root: "0x12",
          nullifier_hash: "0x13",
        },
      ],
    });

    const completion = await completionPromise;
    expect(completion.success).toBe(true);
    if (completion.success) {
      expect(completion.result.protocol_version).toBe("4.0");
      expect(completion.result.responses[0]?.signal_hash).toBe(
        "0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4",
      );
      expect(completion.result.responses[1]?.signal_hash).toBe(
        "0x0f7cfd8ad7f6f3793f6fca63ef9f998f6d1ee6125f68ff9c7a7fd0dfaca8757f",
      );
    }
  });

  it("falls back to legacy payload signal hash when native response omits signal_hash", async () => {
    const req = createNativeRequest(
      {
        signal:
          "0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4",
      },
      baseConfig,
    );
    activeRequest = req;

    const completionPromise = req.pollUntilCompletion({ timeout: 1000 });

    miniKitHandlers["miniapp-verify-action"]?.({
      status: "success",
      protocol_version: "3.0",
      verification_level: "orb",
      proof: "0x01",
      merkle_root: "0x02",
      nullifier_hash: "0x03",
    });

    const completion = await completionPromise;
    expect(completion.success).toBe(true);
    if (completion.success) {
      expect(completion.result.responses[0]?.signal_hash).toBe(
        "0x00c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a4",
      );
    }
  });

  it("allows creating a fresh request after timeout", async () => {
    vi.useFakeTimers();

    const req1 = createNativeRequest({ payload: 1 }, baseConfig);
    activeRequest = req1;

    const completionPromise = req1.pollUntilCompletion({ timeout: 1000 });
    await vi.advanceTimersByTimeAsync(1000);

    await expect(completionPromise).resolves.toEqual({
      success: false,
      error: IDKitErrorCodes.Timeout,
    });

    const req2 = createNativeRequest({ payload: 2 }, baseConfig);
    expect(req2).not.toBe(req1);
    activeRequest = req2;
  });

  it("allows creating a fresh request after abort", async () => {
    const req1 = createNativeRequest({ payload: 1 }, baseConfig);
    activeRequest = req1;

    const controller = new AbortController();
    const completionPromise = req1.pollUntilCompletion({
      timeout: 1000,
      signal: controller.signal,
    });

    controller.abort();

    await expect(completionPromise).resolves.toEqual({
      success: false,
      error: IDKitErrorCodes.Cancelled,
    });

    const req2 = createNativeRequest({ payload: 2 }, baseConfig);
    expect(req2).not.toBe(req1);
    activeRequest = req2;
  });
});
