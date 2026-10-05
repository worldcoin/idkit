import { afterEach, expect, it, vi } from "vitest";
import {
  configureIDKitRuntime,
  randomBytes,
  randomRequestId,
  fetchBridge,
} from "./runtime";

afterEach(() => {
  configureIDKitRuntime({});
  vi.unstubAllGlobals();
});

it("fails explicitly when the host has no secure entropy", () => {
  vi.stubGlobal("crypto", undefined);
  expect(() => randomBytes(32)).toThrow("cryptographically secure randomness");
});

it("uses the configured provider and produces a correctly shaped UUID without global crypto", () => {
  vi.stubGlobal("crypto", undefined);
  const getRandomValues = vi.fn((bytes: Uint8Array) => bytes.fill(0xff));
  configureIDKitRuntime({ getRandomValues });
  expect(randomRequestId()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  expect(getRandomValues).toHaveBeenCalledOnce();
  expect(globalThis.crypto).toBeUndefined();
});

it("rejects an entropy provider returning the wrong byte count", () => {
  configureIDKitRuntime({ getRandomValues: () => new Uint8Array(1) });
  expect(() => randomBytes(32)).toThrow("filled Uint8Array");
});

it("uses configured fetch and resets to host capability checks", async () => {
  vi.stubGlobal("fetch", undefined);
  const response = new Response("ok");
  configureIDKitRuntime({ fetch: async () => response });
  expect(await fetchBridge("https://bridge.test")).toBe(response);
  configureIDKitRuntime({});
  expect(() => fetchBridge("https://bridge.test")).toThrow("requires fetch");
});
