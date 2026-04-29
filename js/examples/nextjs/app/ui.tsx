"use client";

import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  CredentialRequest,
  documentLegacy,
  deviceLegacy,
  selfieCheckLegacy,
  IDKitRequestWidget,
  orbLegacy,
  secureDocumentLegacy,
  setDebug,
  type ConstraintNode,
  type IDKitResult,
  type RpContext,
  Preset,
} from "@worldcoin/idkit";

setDebug(true);

const APP_ID = process.env.NEXT_PUBLIC_APP_ID as `app_${string}` | undefined;
const RP_ID = process.env.NEXT_PUBLIC_RP_ID;
const STAGING_CONNECT_BASE_URL = "https://staging.world.org/verify";
const CONNECT_URL_OVERRIDE_TOOLTIP =
  "Enable this to change the deeplink base URL to the staging verify endpoint. Useful when testing with a Staging iOS World App build that supports this override.";
const GENESIS_ISSUED_AT_MIN_TOOLTIP =
  "Minimum genesis_issued_at timestamp that the used Credential must meet. " +
  "If present, the proof will include a constraint that the credential's genesis issued at timestamp " +
  "is greater than or equal to this value. Useful for migration from previous protocol versions.";
const RETURN_TO_TOOLTIP =
  "Enable this to append a return_to callback to the connector URL. The default value just reopens Chrome, and you can override it before starting a verification.";

type PresetKind = "orb" | "secure_document" | "document" | "device" | "selfie";

type V4CredentialType = "proof_of_human" | "passport";

const V4_CREDENTIAL_TO_NAME: Record<V4CredentialType, string> = {
  proof_of_human: "Proof of Human",
  passport: "Passport",
};

const PRESET_KIND_TO_NAME: Record<PresetKind, string> = {
  orb: "Proof Of Human (Orb)",
  secure_document: "Secure Document",
  document: "Document",
  device: "Device",
  selfie: "Selfie Check",
};

function createChromeAppDeeplink(url: string): string {
  const parsed = new URL(url);
  return parsed.protocol === "https:" ? "googlechromes://" : "googlechrome://";
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
  const [widgetIdkitResult, setWidgetIdkitResult] =
    useState<IDKitResult | null>(null);
  const [widgetSignal, setWidgetSignal] = useState("demo-signal-initial");
  const [action, setAction] = useState("test-action");
  const [environment, setEnvironment] = useState<"production" | "staging">(
    "production",
  );
  const [useStagingConnectBaseUrl, setUseStagingConnectBaseUrl] =
    useState(false);
  const [isConnectUrlTooltipOpen, setIsConnectUrlTooltipOpen] = useState(false);
  const [worldIdVersion, setWorldIdVersion] = useState<"3.0" | "4.0">("3.0");
  const [v4CredentialType, setV4CredentialType] =
    useState<V4CredentialType>("proof_of_human");
  const [presetKind, setPresetKind] = useState<PresetKind>("orb");
  const [genesisEnabled, setGenesisEnabled] = useState(false);
  const [genesisDate, setGenesisDate] = useState("");
  const [isGenesisTooltipOpen, setIsGenesisTooltipOpen] = useState(false);
  const [useReturnTo, setUseReturnTo] = useState(false);
  const [returnTo, setReturnTo] = useState("");
  const [isReturnToTooltipOpen, setIsReturnToTooltipOpen] = useState(false);
  const [requireUserPresence, setRequireUserPresence] = useState(false);

  const genesisIssuedAtMin =
    genesisEnabled && genesisDate
      ? Math.floor(new Date(genesisDate).getTime() / 1000)
      : undefined;

  const widgetConstraintsOrPreset:
    | {
        constraints: ConstraintNode;
      }
    | {
        preset: Preset;
      } = useMemo(
    () =>
      worldIdVersion === "4.0"
        ? {
            constraints: CredentialRequest(v4CredentialType, {
              genesis_issued_at_min: genesisIssuedAtMin,
            }),
          }
        : { preset: createPreset(presetKind, widgetSignal) },
    [
      worldIdVersion,
      presetKind,
      v4CredentialType,
      genesisIssuedAtMin,
      widgetSignal,
    ],
  );

  const overrideConnectBaseUrl =
    environment === "staging" && useStagingConnectBaseUrl
      ? STAGING_CONNECT_BASE_URL
      : undefined;
  const effectiveReturnTo = useReturnTo
    ? returnTo.trim() || undefined
    : undefined;

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
    if (worldIdVersion !== "4.0") {
      setGenesisEnabled(false);
      setGenesisDate("");
    }
  }, [worldIdVersion]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setReturnTo((current) =>
      current.length > 0
        ? current
        : createChromeAppDeeplink(window.location.href),
    );
  }, []);

  const startWidgetFlow = async () => {
    setWidgetError(null);
    setWidgetVerifyResult(null);
    setWidgetIdkitResult(null);

    try {
      const rpContext = await fetchRpContext(action || "test-action");
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
          <label htmlFor="cfgWorldID">World ID</label>
          <select
            id="cfgWorldID"
            value={worldIdVersion}
            onChange={(e) => setWorldIdVersion(e.target.value as "3.0" | "4.0")}
          >
            <option value="3.0">3.0</option>
            <option value="4.0">4.0</option>
          </select>
        </div>

        {worldIdVersion === "3.0" && (
          <div className="config-row">
            <label htmlFor="cfgCredentialv3">Credential</label>
            <select
              id="cfgCredentialv3"
              value={presetKind}
              onChange={(e) => setPresetKind(e.target.value as PresetKind)}
            >
              <option value="orb">Proof Of Human (Orb)</option>
              <option value="selfie">Selfie Check</option>
              <option value="secure_document">Secure Document</option>
              <option value="document">Document</option>
              <option value="device">Device</option>
            </select>
          </div>
        )}

        {worldIdVersion === "4.0" && (
          <>
            <div className="config-row">
              <label htmlFor="cfgCredentialv4">Credential</label>
              <select
                id="cfgCredentialv4"
                value={v4CredentialType}
                onChange={(e) =>
                  setV4CredentialType(e.target.value as V4CredentialType)
                }
              >
                <option value="proof_of_human">Proof Of Human (Orb)</option>
                <option value="passport">Passport</option>
              </select>
            </div>
            <div className="config-row">
              <label htmlFor="cfgGenesisEnabled">
                Min. Genesis Issuing Date
              </label>
              <div
                className="tooltip"
                onMouseEnter={() => setIsGenesisTooltipOpen(true)}
                onMouseLeave={() => setIsGenesisTooltipOpen(false)}
              >
                <button
                  type="button"
                  className="tooltip-trigger"
                  aria-label="Explain Min. Genesis Issuing Date"
                  aria-describedby={
                    isGenesisTooltipOpen
                      ? "genesis-issued-at-tooltip"
                      : undefined
                  }
                  aria-expanded={isGenesisTooltipOpen}
                  onFocus={() => setIsGenesisTooltipOpen(true)}
                  onBlur={() => setIsGenesisTooltipOpen(false)}
                  onClick={() => setIsGenesisTooltipOpen(true)}
                >
                  ?
                </button>
                {isGenesisTooltipOpen && (
                  <span
                    id="genesis-issued-at-tooltip"
                    role="tooltip"
                    className="tooltip-content"
                  >
                    {GENESIS_ISSUED_AT_MIN_TOOLTIP}
                  </span>
                )}
              </div>
              <input
                type="checkbox"
                id="cfgGenesisEnabled"
                checked={genesisEnabled}
                onChange={(e) => setGenesisEnabled(e.target.checked)}
              />
              {genesisEnabled && (
                <input
                  type="datetime-local"
                  id="cfgGenesisDate"
                  value={genesisDate}
                  onChange={(e) => setGenesisDate(e.target.value)}
                />
              )}
            </div>
          </>
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
            placeholder="googlechromes://"
          />
        </div>
        <div className="config-row">
          <label htmlFor="cfgRequireUserPresence">
            {"User presence (Face Auth)"}
          </label>
          <input
            type="checkbox"
            id="cfgRequireUserPresence"
            checked={requireUserPresence}
            onChange={(e) => setRequireUserPresence(e.target.checked)}
          />
        </div>
      </section>

      <div className="stack">
        {worldIdVersion === "3.0" && (
          <>
            <button onClick={startWidgetFlow}>
              Verify with {PRESET_KIND_TO_NAME[presetKind]}
            </button>
          </>
        )}

        {worldIdVersion === "4.0" && (
          <>
            <button onClick={startWidgetFlow}>
              Verify with {V4_CREDENTIAL_TO_NAME[v4CredentialType]}
            </button>
          </>
        )}
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
          require_user_presence={requireUserPresence}
          {...widgetConstraintsOrPreset}
          onSuccess={(result) => {
            setWidgetIdkitResult(result);
          }}
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

      {widgetIdkitResult && (
        <>
          <h3>IDKit response</h3>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {JSON.stringify(widgetIdkitResult, null, 2)}
          </pre>
        </>
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
