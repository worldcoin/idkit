import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { getRandomValues } = vi.hoisted(() => ({
  getRandomValues: vi.fn((bytes: Uint8Array) => bytes.fill(0x42)),
}));
vi.mock("expo-crypto", () => ({ getRandomValues }));

beforeEach(() => {
  vi.resetModules();
  getRandomValues.mockClear();
  vi.stubGlobal("crypto", undefined);
});
afterEach(() => vi.unstubAllGlobals());

it("supplies Expo entropy without a global polyfill or app configuration", async () => {
  await import("./expo");
  const { randomBytes } = await import("./lib/runtime");

  expect(randomBytes(32)).toEqual(new Uint8Array(32).fill(0x42));
  expect(getRandomValues).toHaveBeenCalledOnce();
  expect(globalThis.crypto).toBeUndefined();
});

it("preserves explicit providers and restores the Expo default on reset", async () => {
  const { configureIDKitRuntime, randomBytes, fetchBridge } =
    await import("./lib/runtime");
  const response = new Response("ok");
  const fetch = vi.fn(async () => response);
  configureIDKitRuntime({
    getRandomValues: (bytes) => bytes.fill(0x11),
    fetch,
  });
  await import("./expo");

  expect(randomBytes(16)).toEqual(new Uint8Array(16).fill(0x11));
  expect(await fetchBridge("https://bridge.test")).toBe(response);
  expect(getRandomValues).not.toHaveBeenCalled();

  configureIDKitRuntime({ fetch });
  expect(randomBytes(16)).toEqual(new Uint8Array(16).fill(0x42));
  expect(await fetchBridge("https://bridge.test")).toBe(response);
});

it("propagates an unavailable native entropy provider", async () => {
  await import("./expo");
  const { randomBytes } = await import("./lib/runtime");
  getRandomValues.mockImplementationOnce(() => {
    throw new Error("Native entropy unavailable");
  });
  expect(() => randomBytes(32)).toThrow("Native entropy unavailable");
});
