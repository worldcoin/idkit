"use client";

import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  CredentialRequest,
  documentLegacy,
  deviceLegacy,
  selfieCheckLegacy,
  IDKitInviteCodeRequestWidget,
  IDKitRequestWidget,
  orbLegacy,
  secureDocumentLegacy,
  setDebug,
  type ConstraintNode,
  type IDKitResult,
  type IntegrityBundle,
  type RpContext,
  Preset,
} from "@worldcoin/idkit";

setDebug(true);

const APP_ID = process.env.NEXT_PUBLIC_APP_ID as `app_${string}` | undefined;
const RP_ID = process.env.NEXT_PUBLIC_RP_ID;
const STAGING_CONNECT_BASE_URL = "https://staging.world.org/verify";
const STAGING_DEVPORTAL_BASE_URL = "https://staging-developer.worldcoin.org";
const CONNECT_URL_OVERRIDE_TOOLTIP =
  "Enable this to change the deeplink base URL to the staging verify endpoint. Useful when testing with a Staging iOS World App build that supports this override.";
const DEVPORTAL_URL_OVERRIDE_TOOLTIP =
  "Enable this to send proof verification requests to the staging Developer Portal instead of production.";
const GENESIS_ISSUED_AT_MIN_TOOLTIP =
  "Minimum genesis_issued_at timestamp that the used Credential must meet. " +
  "If present, the proof will include a constraint that the credential's genesis issued at timestamp " +
  "is greater than or equal to this value. Useful for migration from previous protocol versions.";
const RETURN_TO_TOOLTIP =
  "Enable this to append a return_to callback to the connector URL. The default value just reopens Chrome, and you can override it before starting a verification.";

type PresetKind = "orb" | "secure_document" | "document" | "device" | "selfie";

type V4CredentialType = "proof_of_human" | "passport" | "mnc";

const V4_CREDENTIAL_TO_NAME: Record<V4CredentialType, string> = {
  proof_of_human: "Proof of Human",
  passport: "Passport",
  mnc: "MNC",
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

async function verifyProof(
  payload: IDKitResult,
  devPortalBaseUrl?: string,
): Promise<unknown> {
  if (!RP_ID) {
    throw new Error("Missing NEXT_PUBLIC_RP_ID");
  }

  const response = await fetch("/api/verify-proof", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      rp_id: RP_ID,
      devPortalPayload: payload,
      devPortalBaseUrl,
    }),
  });

  const json = await response.json();
  console.log("Verify proof response:", {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    payload: json,
  });

  if (!response.ok) {
    throw new Error(json.error ?? "Verification failed");
  }
  return json;
}

// Extract flat proof strings from an IDKit result for the integrity bundle digest.
// V3 responses have proof: string; V4 responses have proof: string[].
function extractProofs(result: IDKitResult): string[] {
  return (result.responses as Array<{ proof: string | string[] }>).flatMap(
    (r) => (Array.isArray(r.proof) ? r.proof : [r.proof]),
  );
}

interface IntegrityBundleVerifyResult {
  valid: boolean;
  jwtValid: boolean;
  jwtError?: string;
  jwtClaims?: { issuer: string; audience: string[]; expiresAt: number };
  expectedIss?: string;
  rawJwtClaims?: Record<string, unknown> | null;
  assertionValid?: boolean;
  assertionError?: string;
  signatureFormat?: string;
  timestamp?: number;
  version?: number;
  step2?: {
    signatureBytes: number;
    signatureHex: string;
    authenticatorDataBytes?: number;
    authenticatorDataHex?: string;
  };
  step3?: { computedKid: string; jwtKid: string };
  step4?: { clientDataHash: string; integrityDigest: string };
  step5?: { messageToVerify: string; sigNonce?: string };
}

async function verifyIntegrityBundle(
  result: IDKitResult,
  environment: string,
): Promise<IntegrityBundleVerifyResult> {
  const response = await fetch("/api/verify-integrity-bundle", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      bundle: result.integrity_bundle,
      proofs: extractProofs(result),
      nonce: result.nonce,
      protocol_version: result.protocol_version,
      environment,
    }),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error ?? "Integrity bundle verification failed");
  }

  return json as IntegrityBundleVerifyResult;
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
  const [integrityBundleResult, setIntegrityBundleResult] =
    useState<IntegrityBundleVerifyResult | null>(null);
  const [integrityBundleError, setIntegrityBundleError] = useState<
    string | null
  >(null);
  const [widgetSignal, setWidgetSignal] = useState("demo-signal-initial");
  const [action, setAction] = useState("test-action");
  const [environment, setEnvironment] = useState<"production" | "staging">(
    "production",
  );
  const [useStagingConnectBaseUrl, setUseStagingConnectBaseUrl] =
    useState(false);
  const [isConnectUrlTooltipOpen, setIsConnectUrlTooltipOpen] = useState(false);
  const [useStagingDevPortalUrl, setUseStagingDevPortalUrl] = useState(false);
  const [isDevPortalUrlTooltipOpen, setIsDevPortalUrlTooltipOpen] =
    useState(false);
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
  const [useInviteCode, setUseInviteCode] = useState(false);

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
  const overrideDevPortalBaseUrl =
    environment === "staging" && useStagingDevPortalUrl
      ? STAGING_DEVPORTAL_BASE_URL
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
      setUseStagingDevPortalUrl(false);
      setIsDevPortalUrlTooltipOpen(false);
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

  // Auto-verify integrity bundle when idkit result arrives and bundle is present
  useEffect(() => {
    if (!widgetIdkitResult?.integrity_bundle) return;

    setIntegrityBundleResult(null);
    setIntegrityBundleError(null);

    verifyIntegrityBundle(widgetIdkitResult, environment)
      .then(setIntegrityBundleResult)
      .catch((err) =>
        setIntegrityBundleError(
          err instanceof Error ? err.message : "Unknown error",
        ),
      );
  }, [widgetIdkitResult, environment]);

  const startWidgetFlow = async () => {
    setWidgetError(null);
    setWidgetVerifyResult(null);
    setWidgetIdkitResult(null);
    setIntegrityBundleResult(null);
    setIntegrityBundleError(null);

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
        <div className="config-row">
          <label htmlFor="cfgUseInviteCode">Use invite code</label>
          <input
            type="checkbox"
            id="cfgUseInviteCode"
            checked={useInviteCode}
            onChange={(e) => setUseInviteCode(e.target.checked)}
          />
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

        {environment === "staging" && (
          <div className="config-row">
            <label htmlFor="cfgOverrideDevPortalBaseUrl">
              DevPortal URL override
            </label>
            <div
              className="tooltip"
              onMouseEnter={() => setIsDevPortalUrlTooltipOpen(true)}
              onMouseLeave={() => setIsDevPortalUrlTooltipOpen(false)}
            >
              <button
                type="button"
                className="tooltip-trigger"
                aria-label="Explain DevPortal URL override"
                aria-describedby={
                  isDevPortalUrlTooltipOpen
                    ? "devportal-url-override-tooltip"
                    : undefined
                }
                aria-expanded={isDevPortalUrlTooltipOpen}
                onFocus={() => setIsDevPortalUrlTooltipOpen(true)}
                onBlur={() => setIsDevPortalUrlTooltipOpen(false)}
                onClick={() => setIsDevPortalUrlTooltipOpen(true)}
              >
                ?
              </button>
              {isDevPortalUrlTooltipOpen && (
                <span
                  id="devportal-url-override-tooltip"
                  role="tooltip"
                  className="tooltip-content"
                >
                  {DEVPORTAL_URL_OVERRIDE_TOOLTIP}
                </span>
              )}
            </div>
            <input
              type="checkbox"
              id="cfgOverrideDevPortalBaseUrl"
              checked={useStagingDevPortalUrl}
              onChange={(e) => setUseStagingDevPortalUrl(e.target.checked)}
            />
            <span className="config-note">{STAGING_DEVPORTAL_BASE_URL}</span>
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
                <option value="mnc">MNC</option>
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

      {widgetRpContext &&
        (useInviteCode ? (
          <IDKitInviteCodeRequestWidget
            open={widgetOpen}
            onOpenChange={setWidgetOpen}
            app_id={APP_ID}
            action={action || "test-action"}
            rp_context={widgetRpContext}
            allow_legacy_proofs={true}
            {...widgetConstraintsOrPreset}
            onSuccess={(result) => {}}
            handleVerify={async (result) => {
              setWidgetIdkitResult(result);
              const verified = await verifyProof(
                result,
                overrideDevPortalBaseUrl,
              );
              setWidgetVerifyResult(verified);
            }}
            onError={(errorCode) => {
              setWidgetError(`Verification failed: ${errorCode}`);
            }}
            environment={environment}
            override_connect_base_url={overrideConnectBaseUrl}
            return_to={effectiveReturnTo}
          />
        ) : (
          <IDKitRequestWidget
            open={widgetOpen}
            onOpenChange={setWidgetOpen}
            app_id={APP_ID}
            action={action || "test-action"}
            rp_context={widgetRpContext}
            allow_legacy_proofs={true}
            {...widgetConstraintsOrPreset}
            onSuccess={(result) => {}}
            handleVerify={async (result) => {
              setWidgetIdkitResult(result);
              const verified = await verifyProof(
                result,
                overrideDevPortalBaseUrl,
              );
              setWidgetVerifyResult(verified);
            }}
            onError={(errorCode) => {
              setWidgetError(`Verification failed: ${errorCode}`);
            }}
            environment={environment}
            override_connect_base_url={overrideConnectBaseUrl}
            return_to={effectiveReturnTo}
          />
        ))}

      {widgetIdkitResult && (
        <>
          <h3>IDKit result</h3>
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

      {widgetIdkitResult?.integrity_bundle && (
        <>
          <h3>Integrity Bundle</h3>
          <IntegrityBundlePanel
            bundle={widgetIdkitResult.integrity_bundle}
            result={integrityBundleResult}
            error={integrityBundleError}
            environment={environment}
            protocolVersion={widgetIdkitResult.protocol_version}
            signatureFormat={
              widgetIdkitResult.integrity_bundle.signature_format
            }
          />
        </>
      )}
    </>
  );
}

function IntegrityBundlePanel({
  bundle,
  result,
  error,
  environment,
  protocolVersion,
  signatureFormat,
}: {
  bundle: IntegrityBundle;
  result: IntegrityBundleVerifyResult | null;
  error: string | null;
  environment: string;
  protocolVersion?: string;
  signatureFormat?: string;
}): ReactElement {
  if (error) {
    return (
      <section>
        <p style={{ color: "var(--color-error, #ef4444)" }}>
          Failed to verify: {error}
        </p>
      </section>
    );
  }

  if (!result) {
    return (
      <section>
        <p>Verifying…</p>
      </section>
    );
  }

  const attestationHost =
    environment === "production"
      ? "attestation.worldcoin.org"
      : "attestation.worldcoin.dev";

  return (
    <section>
      {/* Overall verdict */}
      <div
        style={{
          fontWeight: "bold",
          padding: "8px",
          borderRadius: "4px",
          marginBottom: "12px",
          backgroundColor: result.valid ? "#22c55e" : "#ef4444",
          color: "white",
        }}
      >
        {result.valid ? "Integrity Bundle Valid" : "Integrity Bundle Invalid"}
      </div>

      {/* Bundle metadata */}
      <table
        style={{ borderCollapse: "collapse", width: "100%", margin: "8px 0" }}
      >
        <tbody>
          <MetaRow label="Version" value={String(bundle.version)} />
          <MetaRow label="Signature format" value={bundle.signature_format} />
          <MetaRow
            label="Timestamp"
            value={`${bundle.timestamp} (${new Date(bundle.timestamp * 1000).toISOString()})`}
          />
        </tbody>
      </table>

      {/* Step 1: JWT */}
      <ResultCard valid={result.jwtValid}>
        <strong>
          Step 1 — JWT Verification: {result.jwtValid ? "✓ Valid" : "✗ Invalid"}
        </strong>
        {result.jwtError && (
          <div>
            <em>Error:</em> {result.jwtError}
          </div>
        )}
        {(() => {
          const claims =
            result.jwtClaims ??
            (result.rawJwtClaims
              ? {
                  issuer: result.rawJwtClaims.iss as string | undefined,
                  audience: Array.isArray(result.rawJwtClaims.aud)
                    ? (result.rawJwtClaims.aud as string[])
                    : result.rawJwtClaims.aud
                      ? [result.rawJwtClaims.aud as string]
                      : [],
                  expiresAt: result.rawJwtClaims.exp as number | undefined,
                }
              : null);
          if (!claims) return null;
          return (
            <>
              <div>
                <em>Issuer:</em> {claims.issuer ?? "—"}
                {!result.jwtValid && result.expectedIss && (
                  <span style={{ opacity: 0.8 }}>
                    {" "}
                    (expected: {result.expectedIss})
                  </span>
                )}
              </div>
              <div>
                <em>Audience:</em> {claims.audience?.join(", ") || "—"}
              </div>
              {claims.expiresAt != null && (
                <div>
                  <em>Expires:</em> {claims.expiresAt} (
                  {new Date(claims.expiresAt * 1000).toISOString()})
                </div>
              )}
              {result.rawJwtClaims?.platform && (
                <div>
                  <em>Platform:</em> {String(result.rawJwtClaims.platform)}
                </div>
              )}
              {result.rawJwtClaims?.app_version && (
                <div>
                  <em>App version:</em>{" "}
                  {String(result.rawJwtClaims.app_version)}
                </div>
              )}
            </>
          );
        })()}
        <div>
          <em>JWKS source:</em> {attestationHost}/.well-known/jwks.json
        </div>
      </ResultCard>

      {/* Steps 2–5: decode + kid + signature */}
      {result.jwtValid && (
        <ResultCard valid={result.assertionValid ?? false}>
          <strong>
            Steps 2–5 — Signature decode + kid + verify:{" "}
            {result.assertionValid ? "✓ Valid" : "✗ Invalid"}
          </strong>
          <ul style={{ margin: "6px 0 0 16px", padding: 0, listStyle: "none" }}>
            <StepItem ok={result.assertionValid}>
              {signatureFormat === "android_keystore"
                ? "Step 2: hex-decode bundle.signature → raw DER ECDSA bytes"
                : "Step 2: hex-decode bundle.signature → CBOR-decode → DER ECDSA sig + authenticatorData"}
              {result.step2 && (
                <StepOutput>
                  <Out
                    label="sig"
                    value={`${result.step2.signatureBytes}B: ${result.step2.signatureHex}`}
                  />
                  {result.step2.authenticatorDataHex && (
                    <Out
                      label="authData"
                      value={`${result.step2.authenticatorDataBytes}B: ${result.step2.authenticatorDataHex}`}
                    />
                  )}
                </StepOutput>
              )}
            </StepItem>
            <StepItem ok={result.assertionValid}>
              {protocolVersion === "4.0"
                ? 'Step 4a: clientDataHash = SHA256("worldcoin/proof-integrity/v4" ‖ nonce[32 BE])'
                : 'Step 4a: clientDataHash = SHA256("worldcoin/proof-integrity/v3" ‖ count ‖ len-prefixed proofs)'}
              {result.step4 && (
                <StepOutput>
                  <Out
                    label="clientDataHash"
                    value={result.step4.clientDataHash}
                  />
                </StepOutput>
              )}
            </StepItem>
            <StepItem ok={result.assertionValid}>
              Step 4b: integrityDigest = SHA256(timestamp[8 BE] ‖
              clientDataHash)
              {result.step4 && (
                <StepOutput>
                  <Out
                    label="integrityDigest"
                    value={result.step4.integrityDigest}
                  />
                </StepOutput>
              )}
            </StepItem>
            {signatureFormat === "android_keystore" ? (
              <StepItem ok={result.assertionValid}>
                Step 5: verify ECDSA-P256 sig over SHA256(integrityDigest)
              </StepItem>
            ) : (
              <>
                <StepItem ok={result.assertionValid}>
                  Step 5a: sigNonce = SHA256(authenticatorData ‖
                  integrityDigest)
                  {result.step5?.sigNonce && (
                    <StepOutput>
                      <Out label="sigNonce" value={result.step5.sigNonce} />
                    </StepOutput>
                  )}
                </StepItem>
                <StepItem ok={result.assertionValid}>
                  Step 5b: verify ECDSA-P256 sig over SHA256(sigNonce)
                </StepItem>
              </>
            )}
          </ul>
          {result.assertionError && (
            <div>
              <em>Error:</em> {result.assertionError}
            </div>
          )}
        </ResultCard>
      )}

      {/* Raw JSON */}
      <details style={{ marginTop: "8px" }}>
        <summary>Raw JSON</summary>
        <pre>{JSON.stringify(result, null, 2)}</pre>
      </details>
    </section>
  );
}

function ResultCard({
  valid,
  children,
}: {
  valid: boolean;
  children: React.ReactNode;
}): ReactElement {
  return (
    <div
      style={{
        padding: "12px",
        borderRadius: "6px",
        margin: "8px 0",
        backgroundColor: valid ? "#22c55e" : "#ef4444",
        color: "white",
      }}
    >
      {children}
    </div>
  );
}

function MetaRow({
  label,
  value,
}: {
  label: string;
  value: string;
}): ReactElement {
  return (
    <tr>
      <td style={{ padding: "4px 8px", opacity: 0.7, whiteSpace: "nowrap" }}>
        {label}
      </td>
      <td style={{ padding: "4px 8px", fontFamily: "monospace" }}>{value}</td>
    </tr>
  );
}

function StepItem({
  ok,
  children,
}: {
  ok?: boolean;
  children: React.ReactNode;
}): ReactElement {
  return (
    <li style={{ margin: "4px 0" }}>
      <span style={{ marginRight: 6 }}>
        {ok ? "✓" : ok === false ? "✗" : "?"}
      </span>
      {children}
    </li>
  );
}

function StepOutput({ children }: { children: React.ReactNode }): ReactElement {
  return (
    <div
      style={{ marginLeft: 18, marginTop: 2, fontSize: "0.85em", opacity: 0.9 }}
    >
      {children}
    </div>
  );
}

function Out({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div>
      <span style={{ opacity: 0.75 }}>{label}: </span>
      <span style={{ fontFamily: "monospace", wordBreak: "break-all" }}>
        {value}
      </span>
    </div>
  );
}
