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
  let activeRequest: any;

  beforeEach(() => {
    listeners = [];
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
            proof: "0x01",
            merkle_root: "0x02",
            nullifier_hash: "0x03",
          },
        },
      } as MessageEvent),
    );

    const completion = await completionPromise;
    expect(completion.success).toBe(true);
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
