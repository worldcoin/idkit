"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import {
  documentLegacy,
  deviceLegacy,
  selfieCheckLegacy,
  useIDKitRequest,
  orbLegacy,
  secureDocumentLegacy,
  type Preset,
  type RpContext,
} from "@worldcoin/idkit";

const APP_ID = process.env.NEXT_PUBLIC_APP_ID as `app_${string}` | undefined;
const RP_ID = process.env.NEXT_PUBLIC_RP_ID;
const STAGING_CONNECT_BASE_URL = "https://staging.world.org/verify";
const DEFAULT_BRIDGE_URL = "https://bridge.worldcoin.org";
const CONNECT_URL_OVERRIDE_TOOLTIP =
  "Enable this to change the deeplink base URL to the staging verify endpoint. Useful when testing with a Staging iOS World App build that supports this override.";

type PresetKind = "orb" | "secure_document" | "document" | "device" | "selfie";

function createPreset(kind: PresetKind, signal: string) {
  switch (kind) {
    case "orb":
      return orbLegacy({ signal });
    case "secure_document":
      return secureDocumentLegacy({ signal });
    case "document":
      return documentLegacy({ signal });
    case "device":
      return deviceLegacy({ signal });
    case "selfie":
      return selfieCheckLegacy({ signal });
    default: {
      const exhaustive: never = kind;
      throw new Error(`Unsupported preset: ${String(exhaustive)}`);
    }
  }
}

async function fetchRpContext(action: string): Promise<RpContext> {
  const response = await fetch("/api/rp-signature", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action }),
  });

  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.error ?? "Failed to fetch RP signature");
  }

  const data = (await response.json()) as {
    sig: string;
    nonce: string;
    created_at: number;
    expires_at: number;
  };

  if (!RP_ID) {
    throw new Error("Missing NEXT_PUBLIC_RP_ID");
  }

  console.log(data);

  return {
    rp_id: RP_ID,
    nonce: data.nonce,
    created_at: data.created_at,
    expires_at: data.expires_at,
    signature: data.sig,
  };
}

function base64ToBytes(base64: string): Uint8Array {
  const binStr = atob(base64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes;
}

async function decryptBridgePayload(
  keyBase64: string,
  ivBase64: string,
  payloadBase64: string,
): Promise<unknown> {
  const keyBytes = base64ToBytes(keyBase64);
  const ivBytes = base64ToBytes(ivBase64);
  const ciphertext = base64ToBytes(payloadBase64);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer.slice(
      keyBytes.byteOffset,
      keyBytes.byteOffset + keyBytes.byteLength,
    ) as ArrayBuffer,
    "AES-GCM",
    false,
    ["decrypt"],
  );

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: ivBytes.buffer.slice(
        ivBytes.byteOffset,
        ivBytes.byteOffset + ivBytes.byteLength,
      ) as ArrayBuffer,
    },
    cryptoKey,
    ciphertext.buffer.slice(
      ciphertext.byteOffset,
      ciphertext.byteOffset + ciphertext.byteLength,
    ) as ArrayBuffer,
  );

  return JSON.parse(new TextDecoder().decode(decrypted));
}

function parseConnectorURI(uri: string): {
  requestId: string;
  key: string;
  bridgeUrl: string;
} | null {
  try {
    const url = new URL(uri);
    const requestId = url.searchParams.get("i");
    const key = url.searchParams.get("k");
    const bridgeUrl = url.searchParams.get("b") ?? DEFAULT_BRIDGE_URL;

    if (!requestId || !key) return null;
    return { requestId, key, bridgeUrl };
  } catch {
    return null;
  }
}

// ── Inner component: only mounted once all config is ready ──────────────

function IDKitFlow({
  appId,
  action,
  rpContext,
  preset,
  environment,
  overrideConnectBaseUrl,
  onTryAgain,
}: {
  appId: `app_${string}`;
  action: string;
  rpContext: RpContext;
  preset: Preset;
  environment: "production" | "staging";
  overrideConnectBaseUrl: string | undefined;
  onTryAgain: () => void;
}): ReactElement {
  const flow = useIDKitRequest({
    app_id: appId,
    action,
    rp_context: rpContext,
    allow_legacy_proofs: true,
    preset,
    environment,
    override_connect_base_url: overrideConnectBaseUrl,
  });

  const [decodedPayload, setDecodedPayload] = useState<string | null>(null);
  const [isFetchingPayload, setIsFetchingPayload] = useState(false);

  // Auto-open immediately on mount
  const hasOpened = useRef(false);
  useEffect(() => {
    if (!hasOpened.current) {
      hasOpened.current = true;
      flow.open();
    }
  }, [flow]);

  // Fetch and decrypt bridge payload when connectorURI appears
  const lastFetchedURI = useRef<string | null>(null);
  useEffect(() => {
    if (!flow.connectorURI || flow.connectorURI === lastFetchedURI.current)
      return;
    lastFetchedURI.current = flow.connectorURI;

    const parsed = parseConnectorURI(flow.connectorURI);
    if (!parsed) return;

    const controller = new AbortController();

    void (async () => {
      setIsFetchingPayload(true);
      setDecodedPayload(null);

      try {
        const url = `${parsed.bridgeUrl}/request/${parsed.requestId}`;
        const res = await fetch(url, { signal: controller.signal });

        if (!res.ok) {
          console.error("Bridge request fetch failed:", res.status);
          return;
        }

        const data = await res.json();

        if (data.iv && data.payload) {
          const decrypted = await decryptBridgePayload(
            parsed.key,
            data.iv,
            data.payload,
          );
          setDecodedPayload(JSON.stringify(decrypted, null, 2));
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error("Bridge payload fetch/decrypt failed:", err);
        }
      } finally {
        setIsFetchingPayload(false);
      }
    })();

    return () => controller.abort();
  }, [flow.connectorURI]);

  const getStatusText = () => {
    if (flow.isError) return `Error: ${flow.errorCode}`;
    if (flow.isSuccess) return "Success";
    if (flow.isAwaitingUserConfirmation) return "Awaiting user confirmation...";
    if (flow.isAwaitingUserConnection) return "Awaiting user connection...";
    if (flow.isOpen) return "Connecting...";
    return "Idle";
  };

  return (
    <>
      {flow.connectorURI && (
        <section>
          <h3>Connector URI</h3>
          <textarea
            readOnly
            rows={3}
            value={flow.connectorURI}
            style={{ width: "100%", fontFamily: "monospace", fontSize: "12px" }}
          />
        </section>
      )}

      {(decodedPayload || isFetchingPayload) && (
        <section>
          <h3>Decoded Bridge Payload</h3>
          {isFetchingPayload && !decodedPayload && (
            <p>Polling bridge for response...</p>
          )}
          {decodedPayload && (
            <textarea
              readOnly
              rows={15}
              value={decodedPayload}
              style={{
                width: "100%",
                fontFamily: "monospace",
                fontSize: "12px",
              }}
            />
          )}
        </section>
      )}

      {flow.result && (
        <section>
          <h3>Hook Result</h3>
          <pre>{JSON.stringify(flow.result, null, 2)}</pre>
        </section>
      )}

      <button onClick={onTryAgain} style={{ marginTop: "1rem" }}>
        Try Again
      </button>
    </>
  );
}

// ── Outer component: config panel + rpContext fetching ───────────────────

export function DemoClient(): ReactElement {
  const [isLightTheme, setIsLightTheme] = useState(false);
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [widgetPresetKind, setWidgetPresetKind] = useState<PresetKind>("orb");
  const [widgetSignal, setWidgetSignal] = useState("demo-signal-initial");
  const [action, setAction] = useState("test-action");
  const [environment, setEnvironment] = useState<"production" | "staging">(
    "production",
  );
  const [useStagingConnectBaseUrl, setUseStagingConnectBaseUrl] =
    useState(false);
  const [isConnectUrlTooltipOpen, setIsConnectUrlTooltipOpen] = useState(false);
  // Bump to remount IDKitFlow with fresh hook state
  const [flowKey, setFlowKey] = useState(0);

  const widgetPreset = useMemo(
    () => createPreset(widgetPresetKind, widgetSignal),
    [widgetPresetKind, widgetSignal],
  );
  const overrideConnectBaseUrl =
    environment === "staging" && useStagingConnectBaseUrl
      ? STAGING_CONNECT_BASE_URL
      : undefined;

  const hasAutoStarted = useRef(false);

  // Auto-fetch rpContext on first render
  useEffect(() => {
    if (!APP_ID || !RP_ID || hasAutoStarted.current) return;
    hasAutoStarted.current = true;

    void (async () => {
      try {
        const ctx = await fetchRpContext(action || "test-action");
        setRpContext(ctx);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch RP context",
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      isLightTheme ? "light" : "dark",
    );
  }, [isLightTheme]);

  useEffect(() => {
    if (environment !== "staging") {
      setUseStagingConnectBaseUrl(false);
      setIsConnectUrlTooltipOpen(false);
    }
  }, [environment]);

  const handleTryAgain = useCallback(async () => {
    setError(null);
    setRpContext(null);

    try {
      setWidgetSignal(`demo-signal-${Date.now()}`);
      const ctx = await fetchRpContext(action || "test-action");
      setRpContext(ctx);
      setFlowKey((k) => k + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch RP context",
      );
    }
  }, [action]);

  if (!APP_ID || !RP_ID) {
    return (
      <>
        <button
          className="theme-toggle secondary"
          onClick={() => setIsLightTheme((value) => !value)}
        >
          {isLightTheme ? "Dark" : "Light"}
        </button>
        <section>
          <h2>Missing environment configuration</h2>
          <p>
            Set <code>NEXT_PUBLIC_APP_ID</code> and{" "}
            <code>NEXT_PUBLIC_RP_ID</code> in <code>.env.local</code>.
          </p>
        </section>
      </>
    );
  }

  return (
    <>
      <button
        className="theme-toggle secondary"
        onClick={() => setIsLightTheme((value) => !value)}
      >
        {isLightTheme ? "Dark" : "Light"}
      </button>
      <section className="config-panel">
        <div className="config-row">
          <label htmlFor="cfgAppId">App ID</label>
          <input type="text" id="cfgAppId" value={APP_ID} readOnly />
        </div>
        <div className="config-row">
          <label htmlFor="cfgRpId">RP ID</label>
          <input type="text" id="cfgRpId" value={RP_ID} readOnly />
        </div>
        <div className="config-row">
          <label htmlFor="cfgAction">Action</label>
          <input
            type="text"
            id="cfgAction"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
        </div>
        <div className="config-row">
          <label htmlFor="cfgPreset">Legacy Preset</label>
          <select
            id="cfgPreset"
            value={widgetPresetKind}
            onChange={(e) => setWidgetPresetKind(e.target.value as PresetKind)}
          >
            <option value="orb">Orb</option>
            <option value="secure_document">Secure Document</option>
            <option value="document">Document</option>
            <option value="device">Device</option>
            <option value="selfie">Selfie Check</option>
          </select>
        </div>
        <div className="config-row">
          <label htmlFor="cfgEnv">Environment</label>
          <select
            id="cfgEnv"
            value={environment}
            onChange={(e) =>
              setEnvironment(e.target.value as "production" | "staging")
            }
          >
            <option value="production">Production</option>
            <option value="staging">Staging</option>
          </select>
        </div>
        {environment === "staging" && (
          <div className="config-row">
            <label htmlFor="cfgOverrideConnectBaseUrl">
              Connect URL override
            </label>
            <div
              className="tooltip"
              onMouseEnter={() => setIsConnectUrlTooltipOpen(true)}
              onMouseLeave={() => setIsConnectUrlTooltipOpen(false)}
            >
              <button
                type="button"
                className="tooltip-trigger"
                aria-label="Explain Connect URL override"
                aria-describedby={
                  isConnectUrlTooltipOpen
                    ? "connect-url-override-tooltip"
                    : undefined
                }
                aria-expanded={isConnectUrlTooltipOpen}
                onFocus={() => setIsConnectUrlTooltipOpen(true)}
                onBlur={() => setIsConnectUrlTooltipOpen(false)}
                onClick={() => setIsConnectUrlTooltipOpen(true)}
              >
                ?
              </button>
              {isConnectUrlTooltipOpen && (
                <span
                  id="connect-url-override-tooltip"
                  role="tooltip"
                  className="tooltip-content"
                >
                  {CONNECT_URL_OVERRIDE_TOOLTIP}
                </span>
              )}
            </div>
            <input
              type="checkbox"
              id="cfgOverrideConnectBaseUrl"
              checked={useStagingConnectBaseUrl}
              onChange={(e) => setUseStagingConnectBaseUrl(e.target.checked)}
            />
            <span className="config-note">{STAGING_CONNECT_BASE_URL}</span>
          </div>
        )}
      </section>

      {error && (
        <section>
          <p className="status">Error: {error}</p>
        </section>
      )}

      {rpContext ? (
        <IDKitFlow
          key={flowKey}
          appId={APP_ID}
          action={action || "test-action"}
          rpContext={rpContext}
          preset={widgetPreset}
          environment={environment}
          overrideConnectBaseUrl={overrideConnectBaseUrl}
          onTryAgain={handleTryAgain}
        />
      ) : (
        !error && <p>Loading RP context...</p>
      )}
    </>
  );
}
