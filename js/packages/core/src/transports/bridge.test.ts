import { afterEach, describe, expect, it, vi } from "vitest";
import {
  IDKit,
  proofOfHuman,
  orbLegacy,
  configureIDKitRuntime,
} from "../index";
import {
  decodeBase64,
  encodeBase64,
  encrypt,
  decrypt,
  deriveInviteCode,
} from "../lib/crypto";
import { decodeUtf8, encodeUtf8 } from "../lib/encoding";
import {
  config as oracleConfig,
  context,
  legacy,
  response as protocolResponse,
} from "../conformance/cases";
import { decodeBridgePollResponse } from "./bridge";
import type { BridgeResponseContext } from "../protocol";
import type { IDKitRequestConfig } from "../types/config";
const config = {
  ...oracleConfig,
  app_id: "app_staging_test",
} as IDKitRequestConfig;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
afterEach(() => {
  configureIDKitRuntime({});
  vi.useRealTimers();
});

describe("bridge raw JSON compatibility", () => {
  it("keeps raw UTF-8 provenance for consumed strings and ignores extension bytes", async () => {
    const rawResponse = (body: Uint8Array) =>
      new Response(new Uint8Array(body).buffer);
    const bytes = (prefix: string, suffix: string): Uint8Array =>
      new Uint8Array([...encodeUtf8(prefix), 0xff, ...encodeUtf8(suffix)]);
    for (const invalid of [
      bytes('{"request_id":"', '"}'),
      bytes('{"request_id":"id","', '":true}'),
      encodeUtf8('\ufeff{"request_id":"id"}'),
    ]) {
      configureIDKitRuntime({ fetch: async () => rawResponse(invalid) });
      await expect(IDKit.request(config).preset(orbLegacy())).rejects.toThrow();
    }
    configureIDKitRuntime({
      fetch: async (_url, init) =>
        rawResponse(
          init?.method === "POST"
            ? bytes('{"request_id":"id","extension":"', '"}')
            : bytes('{"status":"initialized","extension":"', '"}'),
        ),
    });
    const request = await IDKit.request(config).preset(orbLegacy());
    expect(await request.pollOnce()).toEqual({
      type: "waiting_for_connection",
    });
    configureIDKitRuntime({
      fetch: async () => rawResponse(bytes('{"status":"', '"}')),
    });
    await expect(request.pollOnce()).rejects.toThrow("unexpected_response");
  });

  it("preserves duplicate fields from raw bridge HTTP responses", async () => {
    for (const raw of [
      '{"request_id":"first","request_id":"last"}',
      '{"request_id":"first","request\\u005fid":"last"}',
    ]) {
      configureIDKitRuntime({ fetch: async () => new Response(raw) });
      await expect(IDKit.request(config).preset(orbLegacy())).rejects.toThrow(
        "unexpected_response",
      );
    }
    let raw = '{"status":"initialized","extension":1,"extension":2}';
    configureIDKitRuntime({
      fetch: async (_url, init) =>
        new Response(
          init?.method === "POST"
            ? '{"request_id":"id","extension":1,"extension":2}'
            : raw,
        ),
    });
    const request = await IDKit.request(config).preset(orbLegacy());
    expect(await request.pollOnce()).toEqual({
      type: "waiting_for_connection",
    });
    for (const invalid of [
      '{"status":"retrieved","status":"initialized"}',
      '{"status":"initialized","response":null,"response":null}',
      '{"status":"initialized","response":{"iv":"","iv":"","payload":""}}',
    ]) {
      raw = invalid;
      await expect(request.pollOnce()).rejects.toThrow("unexpected_response");
    }
  });

  it("matches Rust's duplicate handling for encrypted response variants", () => {
    const key = new Uint8Array(32);
    const iv = new Uint8Array(12);
    const decode = (raw: string) =>
      decodeBridgePollResponse(
        {
          status: "completed",
          response: {
            iv: encodeBase64(iv),
            payload: encodeBase64(encrypt(key, iv, encodeUtf8(raw))),
          },
        },
        key,
        context as BridgeResponseContext,
      );
    const legacyFields = JSON.stringify(legacy).slice(1, -1);
    const duplicatedProof = JSON.stringify(protocolResponse).replace(
      '"proof":',
      '"proof":"earlier","proof":',
    );
    for (const raw of [
      JSON.stringify(protocolResponse).replace('"version":1', '"version":1.0'),
      JSON.stringify(protocolResponse).replace(
        '"issuer_schema_id":1',
        '"issuer_schema_id":1.0',
      ),
      JSON.stringify(protocolResponse).replace(
        /"expires_at_min":\d+/,
        '"expires_at_min":0e0',
      ),
      JSON.stringify(protocolResponse).replace(
        /"expires_at_min":\d+/,
        '"expires_at_min":-0',
      ),
    ]) {
      expect(() => decode(raw)).toThrow("unexpected_response");
      expect(() => decode(`{"proof_response":${raw}}`)).toThrow(
        "unexpected_response",
      );
    }
    for (const invalid of [
      '{"error_code":"user_rejected","error_code":"generic_error"}',
      `{${legacyFields},"proof":"last"}`,
      duplicatedProof,
      `{"proof_response":${JSON.stringify(protocolResponse)},"identity_attested":true,"identity_attested":false}`,
    ])
      expect(() => decode(invalid)).toThrow("unexpected_response");
    for (const valid of [
      `{${legacyFields},"extension":1,"extension":2}`,
      `{"error_code":"user_rejected","error_code":"generic_error",${legacyFields}}`,
      `{"proof_response":${duplicatedProof}}`,
    ])
      expect(decode(valid).type).toBe("confirmed");
  });
});

describe("encrypted bridge lifecycle", () => {
  it("sends an encrypted request and decrypts the app's independently chosen response IV", async () => {
    const posts: any[] = [];
    let pollBody: unknown = { status: "initialized" };
    const fetch = vi.fn(async (url: any, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push(JSON.parse(init.body as string));
        return json({ request_id: "request-id" });
      }
      return json(pollBody);
    });
    configureIDKitRuntime({ fetch });
    const rp = { ...config.rp_context };
    const request = await IDKit.request({ ...config, rp_context: rp }).preset(
      proofOfHuman({ signal: "🌍" }),
    );
    const key = decodeBase64(
      new URL(request.connectorURI).searchParams.get("k")!,
    );
    const payload = JSON.parse(
      decodeUtf8(
        decrypt(key, decodeBase64(posts[0].iv), decodeBase64(posts[0].payload)),
      ),
    );
    expect(payload.proof_request.proof_requests[0]).toMatchObject({
      identifier: "proof_of_human",
      issuer_schema_id: 1,
      signal: "0xf09f8c8d",
    });
    expect(posts[0]).not.toHaveProperty("request_id");
    expect(await request.pollOnce()).toEqual({
      type: "waiting_for_connection",
    });
    pollBody = { status: "retrieved" };
    expect(await request.pollOnce()).toEqual({ type: "awaiting_confirmation" });
    const iv = new Uint8Array(12).fill(7);
    const plaintext = JSON.stringify(legacy);
    pollBody = {
      status: "completed",
      response: {
        iv: encodeBase64(iv),
        payload: encodeBase64(encrypt(key, iv, encodeUtf8(plaintext))),
      },
    };
    rp.nonce = "changed-after-creation";
    const completion = await request.pollUntilCompletion({ pollInterval: 0 });
    expect(completion.success).toBe(true);
    if (completion.success)
      expect(completion.result.nonce).toBe(config.rp_context.nonce);
    expect(request.getDebugReport()).toMatchObject({
      request_id: "request-id",
      request_payload: payload,
      response_payload: plaintext,
    });
    (
      request.getDebugReport().request_payload as Record<string, unknown>
    ).environment = "sandbox";
    expect(request.getDebugReport().request_payload).toEqual(payload);
    expect(fetch.mock.calls.map((call) => call[0])).toEqual([
      "https://bridge.worldcoin.org/request",
      ...Array(3).fill("https://bridge.worldcoin.org/response/request-id"),
    ]);
    // A failed authentication never replaces the last successfully decrypted debug payload.
    pollBody = {
      status: "completed",
      response: {
        iv: encodeBase64(iv),
        payload: encodeBase64(new Uint8Array(32)),
      },
    };
    await expect(request.pollOnce()).rejects.toThrow();
    expect(request.getDebugReport().response_payload).toBe(plaintext);
  });

  it("retries an invite collision once with a fresh code/IV and checks the bridge's echoed ID", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1700000000000));
    const bodies: any[] = [];
    let random = 0;
    configureIDKitRuntime({
      getRandomValues: (bytes) => {
        for (let i = 0; i < bytes.length; i++) bytes[i] = random++;
        return bytes;
      },
      fetch: async (_url, init) => {
        const body = JSON.parse(init!.body as string);
        bodies.push(body);
        return bodies.length === 1
          ? json({}, 409)
          : json({ request_id: body.request_id });
      },
    });
    const request =
      await IDKit.requestWithInviteCode(config).preset(proofOfHuman());
    expect(bodies).toHaveLength(2);
    expect(bodies[0].request_id).not.toBe(bodies[1].request_id);
    expect(bodies[0].iv).not.toBe(bodies[1].iv);
    const query = new URL(request.connectorURI).searchParams;
    const derived = deriveInviteCode(query.get("c")!);
    expect(derived.index).toBe(request.requestId);
    expect(encodeBase64(derived.key)).toBe(query.get("k"));
    expect(request.expiresAt).toBe(1700000900);
    configureIDKitRuntime({ fetch: async () => json({ request_id: "wrong" }) });
    await expect(
      IDKit.requestWithInviteCode(config).preset(orbLegacy()),
    ).rejects.toThrow("mismatched request_id");
  });

  it("bounds retries, preserves connection errors, and handles cancellation before polling", async () => {
    const fetch = vi.fn(async () => json({}, 409));
    configureIDKitRuntime({ fetch });
    await expect(
      IDKit.requestWithInviteCode(config).preset(orbLegacy()),
    ).rejects.toThrow("collision after retries");
    expect(fetch).toHaveBeenCalledTimes(2);
    configureIDKitRuntime({
      fetch: async (_url, init) =>
        init?.method === "POST" ? json({ request_id: "id" }) : json({}, 404),
    });
    const request = await IDKit.request(config).preset(orbLegacy());
    expect(await request.pollOnce()).toEqual({
      type: "failed",
      error: "connection_failed",
    });
    const controller = new AbortController();
    controller.abort();
    expect(
      await request.pollUntilCompletion({ signal: controller.signal }),
    ).toEqual({ success: false, error: "cancelled" });
  });

  it("preserves unknown-environment fallback and Rust URL spelling", async () => {
    configureIDKitRuntime({ fetch: async () => json({ request_id: "id" }) });
    const request = await IDKit.request({
      ...config,
      environment: "future" as any,
      bridge_url: "https://bridge.worldcoin.org/",
      return_to: " myapp://callback?x='()+ ",
    }).preset(orbLegacy());
    expect(request.connectorURI).toContain("https://world.org/verify?t=wld");
    expect(request.connectorURI).toContain(
      "&b=https%3A%2F%2Fbridge.worldcoin.org%2F",
    );
    expect(request.connectorURI).toContain("%27%28%29%2B");
  });

  it.each([false, true])(
    "times out the polling wrapper (invite=%s)",
    async (invite) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2023-11-14T22:13:20Z"));
      const fetch = vi.fn(async (_url: any, init?: RequestInit) =>
        init?.method === "POST"
          ? json({
              request_id: JSON.parse(init.body as string).request_id ?? "id",
            })
          : json({ status: "initialized" }),
      );
      configureIDKitRuntime({ fetch });
      const request = await (
        invite ? IDKit.requestWithInviteCode(config) : IDKit.request(config)
      ).preset(orbLegacy());
      const completion = request.pollUntilCompletion({
        pollInterval: 100,
        timeout: 250,
      });
      await vi.advanceTimersByTimeAsync(250);
      expect(await completion).toEqual({ success: false, error: "timeout" });
      // The final interval is bounded by the same absolute deadline.
      expect(
        fetch.mock.calls.filter(([, init]) => init?.method !== "POST"),
      ).toHaveLength(3);
      await vi.advanceTimersByTimeAsync(1000);
      expect(fetch).toHaveBeenCalledTimes(4); // One create, three polls, then stopped.
    },
  );

  it.each([false, true])(
    "cancels between polls without making another request (invite=%s)",
    async (invite) => {
      vi.useFakeTimers();
      const fetch = vi.fn(async (_url: any, init?: RequestInit) =>
        init?.method === "POST"
          ? json({
              request_id: JSON.parse(init.body as string).request_id ?? "id",
            })
          : json({ status: "retrieved" }),
      );
      configureIDKitRuntime({ fetch });
      const request = await (
        invite ? IDKit.requestWithInviteCode(config) : IDKit.request(config)
      ).preset(orbLegacy());
      const controller = new AbortController();
      const completion = request.pollUntilCompletion({
        pollInterval: 100,
        signal: controller.signal,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(2);
      controller.abort();
      await vi.advanceTimersByTimeAsync(0);
      expect(await completion).toEqual({ success: false, error: "cancelled" });
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([
    [false, "timeout"],
    [true, "timeout"],
    [false, "cancelled"],
    [true, "cancelled"],
  ] as const)(
    "bounds a never-settling fetch (invite=%s, outcome=%s)",
    async (invite, outcome) => {
      vi.useFakeTimers();
      let resolvePoll!: (value: Response) => void;
      let rejectPoll!: (error: Error) => void;
      const fetch = vi.fn(async (_url: any, init?: RequestInit) => {
        if (init?.method === "POST")
          return json({
            request_id: JSON.parse(init.body as string).request_id ?? "id",
          });
        return new Promise<Response>((resolve, reject) => {
          resolvePoll = resolve;
          rejectPoll = reject;
        });
      });
      configureIDKitRuntime({ fetch });
      const request = await (
        invite ? IDKit.requestWithInviteCode(config) : IDKit.request(config)
      ).preset(orbLegacy());
      const controller = new AbortController();
      const add = vi.spyOn(controller.signal, "addEventListener");
      const remove = vi.spyOn(controller.signal, "removeEventListener");
      let settled = false;
      const completion = request
        .pollUntilCompletion({ timeout: 250, signal: controller.signal })
        .then((value) => {
          settled = true;
          return value;
        });
      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(2);
      if (outcome === "cancelled") {
        controller.abort();
        await vi.advanceTimersByTimeAsync(0);
      } else {
        await vi.advanceTimersByTimeAsync(249);
        expect(settled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
      }
      expect(await completion).toEqual({ success: false, error: outcome });
      expect(vi.getTimerCount()).toBe(0);
      expect(remove.mock.calls).toEqual(
        add.mock.calls.map(([name, handler]) => [name, handler]),
      );
      // Late settlements must not restart polling or cause unhandled rejection.
      if (outcome === "cancelled")
        rejectPoll(new Error("late fetch rejection"));
      else resolvePoll(json({ status: "retrieved" }));
      await vi.advanceTimersByTimeAsync(1000);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(await completion).toEqual({ success: false, error: outcome });
    },
  );

  it("trims return URLs with Rust's Unicode whitespace rules", async () => {
    configureIDKitRuntime({ fetch: async () => json({ request_id: "id" }) });
    const nel = await IDKit.request({
      ...config,
      return_to: "\u0085callback://ok\u0085",
    }).preset(orbLegacy());
    expect(nel.connectorURI).toContain("&return_to=callback%3A%2F%2Fok");
    const bom = await IDKit.request({
      ...config,
      return_to: "\ufeffcallback://ok\ufeff",
    }).preset(orbLegacy());
    expect(bom.connectorURI).toContain(
      "&return_to=%EF%BB%BFcallback%3A%2F%2Fok%EF%BB%BF",
    );
  });

  it("normalizes owned config strings before building URLs and handling responses", async () => {
    let key: Uint8Array;
    configureIDKitRuntime({
      fetch: async (_url, init) => {
        if (init?.method === "POST") return json({ request_id: "id" });
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
      },
    });
    const request = await IDKit.request({
      ...config,
      action: "action-\ud800",
      action_description: "description-\ud800",
      rp_context: { ...config.rp_context, nonce: "nonce-\ud800" },
      bridge_url: "http://localhost/path-\ud800",
      return_to: " callback://\ud800 ",
      override_connect_base_url: "https://world.org/verify/\ud800",
    }).preset(orbLegacy());
    expect(request.connectorURI).toContain("https://world.org/verify/\ufffd?");
    expect(request.connectorURI).toContain(
      "&return_to=callback%3A%2F%2F%EF%BF%BD",
    );
    expect(request.connectorURI).toContain(
      "&b=http%3A%2F%2Flocalhost%2Fpath-%EF%BF%BD",
    );
    key = decodeBase64(new URL(request.connectorURI).searchParams.get("k")!);
    expect(await request.pollOnce()).toMatchObject({
      type: "confirmed",
      result: {
        action: "action-\ufffd",
        action_description: "description-\ufffd",
        nonce: "nonce-\ufffd",
      },
    });
  });

  it("keeps the selected signal snapshot across an invite collision", async () => {
    const preset = proofOfHuman({ signal: "before" });
    const bodies: Array<{ iv: string; payload: string; request_id: string }> =
      [];
    configureIDKitRuntime({
      fetch: async (_url, init) => {
        const body = JSON.parse(init!.body as string);
        bodies.push(body);
        if (bodies.length === 1) {
          preset.signal = "after";
          return json({}, 409);
        }
        return json({ request_id: body.request_id });
      },
    });
    const request = await IDKit.requestWithInviteCode(config).preset(preset);
    const key = decodeBase64(
      new URL(request.connectorURI).searchParams.get("k")!,
    );
    const payload = JSON.parse(
      decodeUtf8(
        decrypt(
          key,
          decodeBase64(bodies[1].iv),
          decodeBase64(bodies[1].payload),
        ),
      ),
    );
    expect(payload.proof_request.proof_requests[0].signal).toBe(
      "0x6265666f7265",
    );
  });

  it("rejects invalid Unicode in consumed outer strings while allowing ignored extension values", async () => {
    const ignored = { extension: "\ud800", nested: { "\ud800": "\ud800" } };
    configureIDKitRuntime({
      fetch: async () => json({ request_id: "id", ...ignored }),
    });
    await expect(
      IDKit.request(config).preset(orbLegacy()),
    ).resolves.toMatchObject({ requestId: "id" });
    for (const body of [
      { request_id: "\ud800" },
      { request_id: "id", "\ud800": true },
    ]) {
      configureIDKitRuntime({ fetch: async () => json(body) });
      await expect(IDKit.request(config).preset(orbLegacy())).rejects.toThrow(
        "unexpected_response",
      );
    }
    const decode = (body: unknown) =>
      decodeBridgePollResponse(
        body,
        new Uint8Array(32),
        context as BridgeResponseContext,
      );
    expect(decode({ status: "initialized", ...ignored })).toEqual({
      type: "waiting_for_connection",
    });
    expect(
      decode({
        status: "retrieved",
        response: { iv: "", payload: "", ...ignored },
      }),
    ).toEqual({ type: "awaiting_confirmation" });
    for (const body of [
      { status: "\ud800" },
      { status: "initialized", "\ud800": true },
      { status: "initialized", response: { iv: "\ud800", payload: "" } },
      { status: "retrieved", response: { iv: "", payload: "\ud800" } },
      {
        status: "initialized",
        response: { iv: "", payload: "", "\ud800": true },
      },
    ])
      expect(() => decode(body)).toThrow("unexpected_response");
  });
});
