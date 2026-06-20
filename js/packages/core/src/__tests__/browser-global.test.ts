import { execFileSync } from "child_process";
import { webcrypto } from "crypto";
import { readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import vm from "vm";
import { beforeAll, describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "../..");
const distDir = join(packageRoot, "dist");
const scriptPath = join(distDir, "idkit.global.js");
const wasmPath = join(distDir, "idkit_wasm_bg.wasm");
const CDN_ORIGIN = "https://cdn.example.test";
const BRIDGE_ORIGIN = "https://bridge.example.test";
const SCRIPT_URL = `${CDN_ORIGIN}/cdn/idkit.global.js`;
const WASM_URL = `${CDN_ORIGIN}/cdn/idkit_wasm_bg.wasm`;

const APP_ID = "app_staging_test";
const SESSION_ID = `session_${"00".repeat(32)}01${"00".repeat(31)}`;
const RP_CONTEXT = {
  rp_id: "rp_1234567890abcdef",
  nonce: "0x0000000000000000000000000000000000000000000000000000000000000001",
  created_at: 1_700_000_000,
  expires_at: 1_700_003_600,
  signature: `0x${"00".repeat(64)}1b`,
};

type BridgeStatus = {
  status: "initialized" | "retrieved" | "completed";
  httpStatus?: number;
};

let browserContext: Record<string, any>;
let IDKit: any;
let requestSequence = 0;
const staticHits: string[] = [];
const bridgeRequests: Array<{ requestId: string; body: unknown }> = [];
const bridgeStatuses = new Map<string, BridgeStatus>();

function responseWithUrl(url: URL, response: Response): Response {
  Object.defineProperty(response, "url", {
    configurable: true,
    value: url.href,
  });
  return response;
}

async function readFetchBody(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<string> {
  if (typeof init?.body === "string") {
    return init.body;
  }

  if (init?.body instanceof URLSearchParams) {
    return init.body.toString();
  }

  if (init?.body instanceof ArrayBuffer) {
    return new TextDecoder().decode(init.body);
  }

  if (input instanceof Request) {
    return input.clone().text();
  }

  return "";
}

async function mockFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const request = input instanceof Request ? input : undefined;
  const url = new URL(request?.url ?? String(input));
  const method = init?.method ?? request?.method ?? "GET";

  if (url.href === SCRIPT_URL) {
    staticHits.push(url.pathname);
    return responseWithUrl(
      url,
      new Response(await readFile(scriptPath, "utf8"), {
        status: 200,
        headers: { "content-type": "application/javascript" },
      }),
    );
  }

  if (url.href === WASM_URL) {
    staticHits.push(url.pathname);
    return responseWithUrl(
      url,
      new Response(await readFile(wasmPath), {
        status: 200,
        headers: { "content-type": "application/wasm" },
      }),
    );
  }

  if (
    url.origin === BRIDGE_ORIGIN &&
    method === "POST" &&
    url.pathname === "/request"
  ) {
    const rawBody = await readFetchBody(input, init);
    const body = (rawBody ? JSON.parse(rawBody) : {}) as {
      request_id?: string;
    };
    const requestId = body.request_id ?? `browser-test-${++requestSequence}`;
    bridgeRequests.push({ requestId, body });
    bridgeStatuses.set(requestId, { status: "initialized" });
    return responseWithUrl(url, Response.json({ request_id: requestId }));
  }

  if (
    url.origin === BRIDGE_ORIGIN &&
    method === "GET" &&
    url.pathname.startsWith("/response/")
  ) {
    const requestId = decodeURIComponent(
      url.pathname.slice("/response/".length),
    );
    const status = bridgeStatuses.get(requestId);

    if (!status) {
      return responseWithUrl(
        url,
        Response.json({ error: "unknown request" }, { status: 404 }),
      );
    }

    if (status.httpStatus && status.httpStatus >= 400) {
      return responseWithUrl(
        url,
        Response.json(
          { error: "forced bridge failure" },
          { status: status.httpStatus },
        ),
      );
    }

    return responseWithUrl(url, Response.json({ status: status.status }));
  }

  return responseWithUrl(
    url,
    Response.json({ error: "not found" }, { status: 404 }),
  );
}

async function loadScriptTagGlobal(): Promise<Record<string, any>> {
  const script = await mockFetch(SCRIPT_URL).then((response) =>
    response.text(),
  );
  class BrowserRequest extends Request {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      const resolved =
        typeof input === "string" ? new URL(input, BRIDGE_ORIGIN).href : input;
      super(resolved, init);
    }
  }

  const context: Record<string, any> = {
    AbortController,
    clearTimeout,
    console,
    crypto: webcrypto,
    document: {
      baseURI: `${CDN_ORIGIN}/cdn/`,
      currentScript: { src: SCRIPT_URL },
    },
    fetch: mockFetch,
    Headers,
    performance,
    Request: BrowserRequest,
    Response,
    setTimeout,
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    WebAssembly,
  };

  context.globalThis = context;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(script, context, { filename: "idkit.global.js" });
  return context;
}

function requestConfig(action: string, allowLegacyProofs = false) {
  return {
    app_id: APP_ID,
    action,
    rp_context: RP_CONTEXT,
    allow_legacy_proofs: allowLegacyProofs,
    bridge_url: BRIDGE_ORIGIN,
    environment: "staging" as const,
  };
}

function sessionConfig() {
  return {
    app_id: APP_ID,
    rp_context: RP_CONTEXT,
    bridge_url: BRIDGE_ORIGIN,
    environment: "staging" as const,
  };
}

describe.sequential("CDN script-tag global", () => {
  beforeAll(async () => {
    execFileSync("pnpm", ["run", "build:ts"], {
      cwd: packageRoot,
      stdio: "pipe",
    });

    browserContext = await loadScriptTagGlobal();
    IDKit = browserContext.IDKit;
  }, 30_000);

  it("exposes the expected client API on window without RP signing", () => {
    expect(browserContext.window.IDKit).toBe(IDKit);
    expect(browserContext.IDKitBundle).toBe(IDKit);

    for (const name of [
      "request",
      "requestWithInviteCode",
      "createSession",
      "proveSession",
      "CredentialRequest",
      "any",
      "all",
      "enumerate",
      "orbLegacy",
      "secureDocumentLegacy",
      "documentLegacy",
      "deviceLegacy",
      "selfieCheckLegacy",
      "proofOfHuman",
      "passport",
      "mnc",
      "identityCheck",
    ]) {
      expect(typeof IDKit[name], name).toBe("function");
    }

    expect(IDKit.signRequest).toBeUndefined();
  });

  it("makes all v4 and legacy credential helpers available from the global", () => {
    expect(
      IDKit.CredentialRequest("proof_of_human", {
        signal: "person-1",
        genesis_issued_at_min: 100,
        expires_at_min: 200,
      }),
    ).toEqual({
      type: "proof_of_human",
      signal: "person-1",
      genesis_issued_at_min: 100,
      expires_at_min: 200,
    });

    expect(
      IDKit.all(
        IDKit.CredentialRequest("proof_of_human"),
        IDKit.any(
          IDKit.CredentialRequest("passport"),
          IDKit.CredentialRequest("mnc"),
        ),
      ),
    ).toEqual({
      all: [
        { type: "proof_of_human" },
        { any: [{ type: "passport" }, { type: "mnc" }] },
      ],
    });

    expect(IDKit.proofOfHuman({ signal: "poh" })).toEqual({
      type: "ProofOfHuman",
      signal: "poh",
    });
    expect(IDKit.passport({ signal: "passport" })).toEqual({
      type: "Passport",
      signal: "passport",
    });
    expect(IDKit.mnc({ signal: "mnc" })).toEqual({
      type: "Mnc",
      signal: "mnc",
    });
    expect(
      IDKit.identityCheck({
        attributes: [{ type: "minimum_age", value: 18 }],
        legacy_signal: "legacy-person",
      }),
    ).toEqual({
      type: "IdentityCheck",
      attributes: [{ type: "minimum_age", value: 18 }],
      legacy_signal: "legacy-person",
    });
    expect(IDKit.orbLegacy({ signal: "legacy" })).toEqual({
      type: "OrbLegacy",
      signal: "legacy",
    });
  });

  it("loads WASM automatically from the CDN asset path", async () => {
    const request = await IDKit.request(
      requestConfig("cdn-wasm-load"),
    ).constraints(IDKit.CredentialRequest("proof_of_human"));

    expect(staticHits).toContain("/cdn/idkit.global.js");
    expect(staticHits).toContain("/cdn/idkit_wasm_bg.wasm");
    expect(request.requestId).toMatch(/^browser-test-\d+$/);
    expect(request.connectorURI).toContain(`i=${request.requestId}`);
  });

  it("stress tests concurrent uniqueness requests and credential combinations", async () => {
    const cases = [
      IDKit.CredentialRequest("proof_of_human", { signal: "poh" }),
      IDKit.any(
        IDKit.CredentialRequest("passport", { signal: "passport" }),
        IDKit.CredentialRequest("mnc", { signal: "mnc" }),
      ),
      IDKit.all(
        IDKit.CredentialRequest("proof_of_human"),
        IDKit.CredentialRequest("selfie"),
      ),
      IDKit.enumerate(
        IDKit.CredentialRequest("passport"),
        IDKit.CredentialRequest("mnc"),
      ),
    ];

    const requests = await Promise.all(
      cases.map((constraint, index) =>
        IDKit.request(requestConfig(`concurrent-${index}`)).constraints(
          constraint,
        ),
      ),
    );

    expect(new Set(requests.map((request) => request.requestId)).size).toBe(
      cases.length,
    );
    expect(bridgeRequests.length).toBeGreaterThanOrEqual(cases.length);
  });

  it("creates invite-code requests from the browser global", async () => {
    const request = await IDKit.requestWithInviteCode(
      requestConfig("invite-code", true),
    ).constraints(IDKit.CredentialRequest("proof_of_human"));

    expect(request.requestId).toMatch(/^[0-9a-f]+$/);
    expect(request.expiresAt).toBeGreaterThan(Date.now() / 1000);
    expect(request.connectorURI).toContain(`i=${request.requestId}`);
    expect(request.connectorURI).toContain("&c=");
    expect(request.connectorURI).toContain("&a=app_staging_test");
  });

  it("keeps legacy proof migration configurable and usable", async () => {
    const presets = [
      IDKit.orbLegacy({ signal: "orb" }),
      IDKit.secureDocumentLegacy({ signal: "secure-document" }),
      IDKit.documentLegacy({ signal: "document" }),
      IDKit.deviceLegacy({ signal: "device" }),
      IDKit.selfieCheckLegacy({ signal: "selfie" }),
      IDKit.proofOfHuman({ signal: "poh" }),
      IDKit.passport({ signal: "passport" }),
      IDKit.mnc({ signal: "mnc" }),
      IDKit.identityCheck({
        attributes: [{ type: "nationality", value: "US" }],
        legacy_signal: "identity",
      }),
    ];

    const requests = await Promise.all(
      presets.map((preset, index) =>
        IDKit.request(requestConfig(`legacy-preset-${index}`, true)).preset(
          preset,
        ),
      ),
    );

    expect(requests).toHaveLength(presets.length);
    expect(requests.every((request) => request.connectorURI)).toBe(true);
  });

  it("stress tests polling, cancellation, timeout, and bridge failure behavior", async () => {
    const waiting = await IDKit.request(
      requestConfig("poll-waiting"),
    ).constraints(IDKit.CredentialRequest("proof_of_human"));

    await expect(waiting.pollOnce()).resolves.toEqual({
      type: "waiting_for_connection",
    });

    const controller = new AbortController();
    controller.abort();
    await expect(
      waiting.pollUntilCompletion({
        pollInterval: 1,
        timeout: 100,
        signal: controller.signal,
      }),
    ).resolves.toEqual({ success: false, error: "cancelled" });

    await expect(
      waiting.pollUntilCompletion({ pollInterval: 1, timeout: 5 }),
    ).resolves.toEqual({ success: false, error: "timeout" });

    const failed = await IDKit.request(
      requestConfig("poll-failed"),
    ).constraints(IDKit.CredentialRequest("proof_of_human"));
    bridgeStatuses.set(failed.requestId, {
      status: "initialized",
      httpStatus: 500,
    });

    await expect(failed.pollOnce()).resolves.toEqual({
      type: "failed",
      error: "connection_failed",
    });
  });

  it("creates session and prove-session requests from the browser global", async () => {
    const createSessionRequest = await IDKit.createSession(
      sessionConfig(),
    ).constraints(
      IDKit.any(
        IDKit.CredentialRequest("proof_of_human"),
        IDKit.CredentialRequest("passport"),
      ),
    );

    const proveSessionRequest = await IDKit.proveSession(
      SESSION_ID,
      sessionConfig(),
    ).constraints(
      IDKit.all(
        IDKit.CredentialRequest("proof_of_human"),
        IDKit.CredentialRequest("mnc"),
      ),
    );

    expect(createSessionRequest.requestId).toMatch(/^browser-test-\d+$/);
    expect(proveSessionRequest.requestId).toMatch(/^browser-test-\d+$/);
    expect(createSessionRequest.connectorURI).toContain(
      `i=${createSessionRequest.requestId}`,
    );
    expect(proveSessionRequest.connectorURI).toContain(
      `i=${proveSessionRequest.requestId}`,
    );
  });
});
