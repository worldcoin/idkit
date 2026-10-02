import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IDKit,
  orbLegacy,
  configureIDKitRuntime,
  RetryableBridgeError,
  type IDKitRequestConfig,
  type RequestOptions,
} from "../index";
import { config as oracleConfig, legacy } from "../conformance/cases";
import { decodeBase64, encodeBase64, encrypt } from "../lib/crypto";
import { encodeUtf8 } from "../lib/encoding";
const config = {
  ...oracleConfig,
  app_id: "app_staging_test",
} as IDKitRequestConfig;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
afterEach(() => {
  configureIDKitRuntime({});
  vi.useRealTimers();
});

for (const invite of [false, true])
  describe(`bridge resilience (invite=${invite})`, () => {
    const create = (options?: RequestOptions) =>
      (invite
        ? IDKit.requestWithInviteCode(config)
        : IDKit.request(config)
      ).preset(orbLegacy(), options);
    const setup = (poll: (signal: AbortSignal) => Promise<Response>) => {
      const fetch = vi.fn(async (_url: any, init?: RequestInit) => {
        if (init?.method === "POST")
          return json({
            request_id: JSON.parse(init.body as string).request_id ?? "id",
          });
        return poll(init!.signal!);
      });
      configureIDKitRuntime({ fetch });
      return fetch;
    };
    it.each(["network", "body", 408, 429, 500, 502, 503, 504])(
      "recovers from %s and decrypts the next successful proof",
      async (failure) => {
        vi.useFakeTimers();
        let calls = 0;
        let key: Uint8Array;
        const fetch = setup(async () => {
          calls++;
          if (calls === 1) {
            if (failure === "network")
              throw new TypeError("Network request failed");
            if (failure === "body")
              return {
                ok: true,
                status: 200,
                text: async () => {
                  throw new TypeError("body interrupted");
                },
              } as unknown as Response;
            return json({}, failure as number);
          }
          const iv = new Uint8Array(12);
          return json({
            status: "completed",
            response: {
              iv: encodeBase64(iv),
              payload: encodeBase64(
                encrypt(key, iv, encodeUtf8(JSON.stringify(legacy))),
              ),
            },
          });
        });
        const request = await create();
        key = decodeBase64(
          new URL(request.connectorURI).searchParams.get("k")!,
        );
        const result = request.pollUntilCompletion({
          timeout: 250,
          pollInterval: 100,
        });
        await vi.advanceTimersByTimeAsync(100);
        expect(await result).toMatchObject({ success: true });
        expect(calls).toBe(2);
        expect(fetch).toHaveBeenCalledTimes(3);
        expect(vi.getTimerCount()).toBe(0);
      },
    );
    it("does not extend the original deadline during an outage", async () => {
      vi.useFakeTimers();
      const fetch = setup(async () => {
        throw new TypeError("offline");
      });
      const request = await create();
      const result = request.pollUntilCompletion({
        timeout: 250,
        pollInterval: 100,
      });
      await vi.advanceTimersByTimeAsync(250);
      expect(await result).toEqual({ success: false, error: "timeout" });
      expect(fetch).toHaveBeenCalledTimes(4);
      expect(vi.getTimerCount()).toBe(0);
    });
    it.each([400, 401, 403, 404])("keeps HTTP %s terminal", async (status) => {
      const fetch = setup(async () => json({}, status));
      expect(await (await create()).pollUntilCompletion()).toEqual({
        success: false,
        error: "connection_failed",
      });
      expect(fetch).toHaveBeenCalledTimes(2);
    });
    it("exposes retryable failures to manual pollers", async () => {
      setup(async () => json({}, 503));
      await expect((await create()).pollOnce()).rejects.toBeInstanceOf(
        RetryableBridgeError,
      );
    });
    it("does not retry malformed JSON", async () => {
      const fetch = setup(async () => new Response("{broken"));
      expect(await (await create()).pollUntilCompletion()).toMatchObject({
        success: false,
      });
      expect(fetch).toHaveBeenCalledTimes(2);
    });
    it.each(["fetch", "body"])(
      "aborts a pending %s on timeout/cancellation",
      async (stage) => {
        vi.useFakeTimers();
        for (const cancel of [false, true]) {
          let signal: AbortSignal | undefined;
          setup(async (s) => {
            signal = s;
            return stage === "fetch"
              ? new Promise<Response>(() => {})
              : ({
                  ok: true,
                  status: 200,
                  text: () => new Promise<string>(() => {}),
                } as unknown as Response);
          });
          const request = await create();
          const controller = new AbortController();
          const pending = request.pollUntilCompletion({
            timeout: 250,
            signal: controller.signal,
          });
          await vi.advanceTimersByTimeAsync(0);
          expect(signal?.aborted).toBe(false);
          if (cancel) controller.abort();
          else await vi.advanceTimersByTimeAsync(250);
          expect(await pending).toEqual({
            success: false,
            error: cancel ? "cancelled" : "timeout",
          });
          expect(signal?.aborted).toBe(true);
          expect(vi.getTimerCount()).toBe(0);
        }
      },
    );
    it.each(["fetch", "body"])(
      "bounds request creation including a hung %s and sends abort",
      async (stage) => {
        vi.useFakeTimers();
        for (const cancel of [false, true]) {
          let signal: AbortSignal | undefined;
          const fetch = vi.fn(async (_url: any, init?: RequestInit) => {
            signal = init!.signal!;
            return stage === "fetch"
              ? new Promise<Response>(() => {})
              : ({
                  ok: true,
                  status: 200,
                  text: () => new Promise<string>(() => {}),
                } as unknown as Response);
          });
          configureIDKitRuntime({ fetch });
          const controller = new AbortController();
          const pending = create({ timeout: 250, signal: controller.signal });
          const assertion = expect(pending).rejects.toThrow(
            cancel ? "cancelled" : "timeout",
          );
          await vi.advanceTimersByTimeAsync(0);
          if (cancel) controller.abort();
          else await vi.advanceTimersByTimeAsync(250);
          await assertion;
          expect(signal?.aborted).toBe(true);
          expect(fetch).toHaveBeenCalledTimes(1);
          expect(vi.getTimerCount()).toBe(0);
        }
      },
    );
    it("defaults creation to a 30-second deadline without retrying POST", async () => {
      vi.useFakeTimers();
      const fetch = vi.fn(() => new Promise<Response>(() => {}));
      configureIDKitRuntime({ fetch });
      const pending = expect(create()).rejects.toThrow("timeout");
      await vi.advanceTimersByTimeAsync(30000);
      await pending;
      expect(fetch).toHaveBeenCalledTimes(1);
    });
    it("does not start a cancelled request", async () => {
      const fetch = setup(async () => json({}));
      const controller = new AbortController();
      controller.abort();
      await expect(create({ signal: controller.signal })).rejects.toThrow(
        "cancelled",
      );
      expect(fetch).not.toHaveBeenCalled();
    });
  });
