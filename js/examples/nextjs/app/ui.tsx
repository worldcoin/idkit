"use client";

import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  documentLegacy,
  deviceLegacy,
  selfieCheckLegacy,
  IDKitRequestWidget,
  orbLegacy,
  secureDocumentLegacy,
  type IDKitResult,
  type RpContext,
} from "@worldcoin/idkit";

if (typeof window !== "undefined") {
  (window as any).IDKIT_DEBUG = true;
}

const APP_ID = process.env.NEXT_PUBLIC_APP_ID as `app_${string}` | undefined;
const RP_ID = process.env.NEXT_PUBLIC_RP_ID;
const STAGING_CONNECT_BASE_URL = "https://staging.world.org/verify";
const CONNECT_URL_OVERRIDE_TOOLTIP =
  "Enable this to change the deeplink base URL to the staging verify endpoint. Useful when testing with a Staging iOS World App build that supports this override.";
const RETURN_TO_TOOLTIP =
  "Enable this to append a return_to callback to the connector URL. The default value opens the current page in Chrome, and you can override it before starting a verification.";

type PresetKind = "orb" | "secure_document" | "document" | "device" | "selfie";

function createChromeDeeplink(url: string): string {
  const parsed = new URL(url);
  const protocol =
    parsed.protocol === "https:" ? "googlechromes://" : "googlechrome://";

  return `${protocol}${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

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

async function verifyProof(payload: IDKitResult): Promise<unknown> {
  if (!RP_ID) {
    throw new Error("Missing NEXT_PUBLIC_RP_ID");
  }

  const response = await fetch("/api/verify-proof", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rp_id: RP_ID, devPortalPayload: payload }),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error ?? "Verification failed");
  }

  return json;
}

export function DemoClient(): ReactElement {
  const [isLightTheme, setIsLightTheme] = useState(false);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [widgetRpContext, setWidgetRpContext] = useState<RpContext | null>(
    null,
  );
  const [widgetError, setWidgetError] = useState<string | null>(null);
  const [widgetVerifyResult, setWidgetVerifyResult] = useState<unknown>(null);
  const [widgetPresetKind, setWidgetPresetKind] = useState<PresetKind>("orb");
  const [widgetSignal, setWidgetSignal] = useState("demo-signal-initial");
  const [action, setAction] = useState("test-action");
  const [environment, setEnvironment] = useState<"production" | "staging">(
    "production",
  );
  const [useStagingConnectBaseUrl, setUseStagingConnectBaseUrl] =
    useState(false);
  const [isConnectUrlTooltipOpen, setIsConnectUrlTooltipOpen] = useState(false);
  const [useReturnTo, setUseReturnTo] = useState(false);
  const [returnTo, setReturnTo] = useState("");
  const [isReturnToTooltipOpen, setIsReturnToTooltipOpen] = useState(false);

  const widgetPreset = useMemo(
    () => createPreset(widgetPresetKind, widgetSignal),
    [widgetPresetKind, widgetSignal],
  );
  const overrideConnectBaseUrl =
    environment === "staging" && useStagingConnectBaseUrl
      ? STAGING_CONNECT_BASE_URL
      : undefined;
  const effectiveReturnTo = useReturnTo ? returnTo.trim() || undefined : undefined;

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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setReturnTo((current) =>
      current.length > 0 ? current : createChromeDeeplink(window.location.href),
    );
  }, []);

  const startWidgetFlow = async (presetKind: PresetKind) => {
    setWidgetError(null);
    setWidgetVerifyResult(null);

    try {
      const rpContext = await fetchRpContext(action || "test-action");
      setWidgetPresetKind(presetKind);
      setWidgetSignal(`demo-signal-${Date.now()}`);
      setWidgetRpContext(rpContext);
      setWidgetOpen(true);
    } catch (error) {
      setWidgetError(error instanceof Error ? error.message : "Unknown error");
    }
  };

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
        <div className="config-row">
          <label htmlFor="cfgReturnToEnabled">Return to</label>
          <div
            className="tooltip"
            onMouseEnter={() => setIsReturnToTooltipOpen(true)}
            onMouseLeave={() => setIsReturnToTooltipOpen(false)}
          >
            <button
              type="button"
              className="tooltip-trigger"
              aria-label="Explain return_to"
              aria-describedby={
                isReturnToTooltipOpen ? "return-to-tooltip" : undefined
              }
              aria-expanded={isReturnToTooltipOpen}
              onFocus={() => setIsReturnToTooltipOpen(true)}
              onBlur={() => setIsReturnToTooltipOpen(false)}
              onClick={() => setIsReturnToTooltipOpen(true)}
            >
              ?
            </button>
            {isReturnToTooltipOpen && (
              <span
                id="return-to-tooltip"
                role="tooltip"
                className="tooltip-content"
              >
                {RETURN_TO_TOOLTIP}
              </span>
            )}
          </div>
          <input
            type="checkbox"
            id="cfgReturnToEnabled"
            checked={useReturnTo}
            onChange={(e) => setUseReturnTo(e.target.checked)}
          />
          <input
            type="text"
            id="cfgReturnTo"
            value={returnTo}
            onChange={(e) => setReturnTo(e.target.value)}
            disabled={!useReturnTo}
            placeholder="googlechromes://example.com/path"
          />
        </div>
      </section>

      <div className="stack">
        <button onClick={() => startWidgetFlow("orb")}>Verify with Orb</button>
        <button onClick={() => startWidgetFlow("secure_document")}>
          Verify with Secure Document
        </button>
        <button onClick={() => startWidgetFlow("document")}>
          Verify with Document
        </button>
        <button onClick={() => startWidgetFlow("device")}>
          Verify with Device
        </button>
        <button onClick={() => startWidgetFlow("selfie")}>
          Verify with Selfie Check
        </button>
      </div>
      {widgetError && <p className="status">Error: {widgetError}</p>}

      {widgetRpContext && (
        <IDKitRequestWidget
          open={widgetOpen}
          onOpenChange={setWidgetOpen}
          app_id={APP_ID}
          action={action || "test-action"}
          rp_context={widgetRpContext}
          allow_legacy_proofs={true}
          preset={widgetPreset}
          onSuccess={() => {}}
          handleVerify={async (result) => {
            const verified = await verifyProof(result);
            setWidgetVerifyResult(verified);
          }}
          onError={(errorCode) => {
            setWidgetError(`Verification failed: ${errorCode}`);
          }}
          environment={environment}
          override_connect_base_url={overrideConnectBaseUrl}
          return_to={effectiveReturnTo}
        />
      )}

      {widgetVerifyResult && (
        <>
          <h3>Verification response</h3>
          <pre>{JSON.stringify(widgetVerifyResult, null, 2)}</pre>
        </>
      )}
    </>
  );
}
