"use client";

import { useEffect, useMemo, useState, type ReactElement } from "react";
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";
import {
  CredentialRequest,
  documentLegacy,
  deviceLegacy,
  identityCheck,
  selfieCheckLegacy,
  IDKitInviteCodeRequestWidget,
  IDKitRequestWidget,
  IDKitSessionWidget,
  orbLegacy,
  passport as passportPreset,
  mnc as mncPreset,
  proofOfHuman,
  secureDocumentLegacy,
  setDebug,
  type ConstraintNode,
  type DocumentType,
  type IdentityAttribute,
  type IDKitResult,
  type IDKitResultSession,
  type Preset,
  type RpContext,
} from "@worldcoin/idkit";

setDebug(true);
countries.registerLocale(enLocale);

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

type FlowMode = "request" | "create_session" | "session";

type V4CredentialType =
  | "proof_of_human"
  | "selfie"
  | "passport"
  | "mnc"
  | "identity_check";
type SessionCredentialType = Exclude<V4CredentialType, "identity_check">;

type IdentityAttributesConfig = {
  document_type: { enabled: boolean; value: DocumentType };
  document_number: { enabled: boolean; value: string };
  issuing_country: { enabled: boolean; value: string };
  full_name: { enabled: boolean; value: string };
  minimum_age: { enabled: boolean; value: string };
  nationality: { enabled: boolean; value: string };
};

const DEFAULT_IDENTITY_ATTRIBUTES: IdentityAttributesConfig = {
  document_type: { enabled: true, value: "passport" },
  document_number: { enabled: false, value: "" },
  issuing_country: { enabled: false, value: "" },
  full_name: { enabled: false, value: "" },
  minimum_age: { enabled: false, value: "" },
  nationality: { enabled: false, value: "" },
};

const SESSION_ID_PATTERN = /^session_[0-9a-fA-F]{128}$/;

const FLOW_MODE_TO_NAME: Record<FlowMode, string> = {
  request: "Request",
  create_session: "Create Session",
  session: "Session",
};

const V4_CREDENTIAL_TO_NAME: Record<V4CredentialType, string> = {
  proof_of_human: "Proof of Human",
  selfie: "Selfie",
  passport: "Passport",
  mnc: "My Number Card",
  identity_check: "Identity Check",
};

const PRESET_KIND_TO_NAME: Record<PresetKind, string> = {
  orb: "Proof Of Human (Orb)",
  secure_document: "Secure Document",
  document: "Document",
  device: "Device",
  selfie: "Selfie Check",
};

function isValidAlpha3(code: string): boolean {
  return code.length === 3 && countries.isValid(code.toUpperCase());
}

function normalizeAlpha3(value: string): string {
  return value.trim().toUpperCase();
}

function buildIdentityAttributes(
  config: IdentityAttributesConfig,
): IdentityAttribute[] {
  const attributes: IdentityAttribute[] = [];

  if (config.document_type.enabled) {
    attributes.push({
      type: "document_type",
      value: config.document_type.value,
    });
  }

  const documentNumber = config.document_number.value.trim();
  if (config.document_number.enabled && documentNumber.length > 0) {
    attributes.push({ type: "document_number", value: documentNumber });
  }

  const issuingCountry = normalizeAlpha3(config.issuing_country.value);
  if (config.issuing_country.enabled && issuingCountry.length > 0) {
    attributes.push({ type: "issuing_country", value: issuingCountry });
  }

  const fullName = config.full_name.value.trim();
  if (config.full_name.enabled && fullName.length > 0) {
    attributes.push({ type: "full_name", value: fullName });
  }

  const minimumAge = Number(config.minimum_age.value);
  if (
    config.minimum_age.enabled &&
    Number.isInteger(minimumAge) &&
    minimumAge > 0
  ) {
    attributes.push({ type: "minimum_age", value: minimumAge });
  }

  const nationality = normalizeAlpha3(config.nationality.value);
  if (config.nationality.enabled && nationality.length > 0) {
    attributes.push({ type: "nationality", value: nationality });
  }

  return attributes;
}

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

async function fetchRpContext(
  signatureType: FlowMode,
  action?: string,
): Promise<RpContext> {
  const body: { signature_type: FlowMode; action?: string } = {
    signature_type: signatureType,
  };

  if (signatureType === "request" && action) {
    body.action = action;
  }

  const response = await fetch("/api/rp-signature", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
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
  const [useStagingDevPortalUrl, setUseStagingDevPortalUrl] = useState(false);
  const [isDevPortalUrlTooltipOpen, setIsDevPortalUrlTooltipOpen] =
    useState(false);
  const [worldIdVersion, setWorldIdVersion] = useState<"3.0" | "4.0">("4.0");
  const [v4CredentialType, setV4CredentialType] =
    useState<V4CredentialType>("proof_of_human");
  const [identityAttributes, setIdentityAttributes] =
    useState<IdentityAttributesConfig>(DEFAULT_IDENTITY_ATTRIBUTES);
  const [presetKind, setPresetKind] = useState<PresetKind>("orb");
  const [genesisEnabled, setGenesisEnabled] = useState(false);
  const [genesisDate, setGenesisDate] = useState("");
  const [isGenesisTooltipOpen, setIsGenesisTooltipOpen] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [widgetSessionResult, setWidgetSessionResult] =
    useState<IDKitResultSession | null>(null);
  const [useReturnTo, setUseReturnTo] = useState(false);
  const [returnTo, setReturnTo] = useState("");
  const [isReturnToTooltipOpen, setIsReturnToTooltipOpen] = useState(false);
  const [requireUserPresence, setRequireUserPresence] = useState(false);
  const [useInviteCode, setUseInviteCode] = useState(false);
  const [flowMode, setFlowMode] = useState<FlowMode>("request");
  const [wasIdentityCheck, setWasIdentityCheck] = useState(false);
  const isV4PresetCredential =
    v4CredentialType !== "mnc" && v4CredentialType !== "identity_check";
  const isSessionFlow = flowMode !== "request";
  const isCreateSessionFlow = flowMode === "create_session";
  const isProveSessionFlow = flowMode === "session";
  const sessionCredentialType: SessionCredentialType =
    v4CredentialType === "identity_check" ? "proof_of_human" : v4CredentialType;

  const genesisIssuedAtMin =
    genesisEnabled && genesisDate
      ? Math.floor(new Date(genesisDate).getTime() / 1000)
      : undefined;

  const identityAttributesPayload = useMemo(
    () => buildIdentityAttributes(identityAttributes),
    [identityAttributes],
  );

  const isIdentityCheck =
    !isSessionFlow &&
    worldIdVersion === "4.0" &&
    v4CredentialType === "identity_check";
  const canStartWidgetFlow =
    !isIdentityCheck || identityAttributesPayload.length > 0;
  const isMncGenesisConstraintsRequest =
    !isSessionFlow &&
    worldIdVersion === "4.0" &&
    v4CredentialType === "mnc" &&
    genesisIssuedAtMin != null;
  // MNC + genesis uses constraints(). Keep this branch v4-only to avoid a legacy
  // fallback being interpreted as device-level when the request is document-scoped.
  const shouldAllowLegacyProofs = !isMncGenesisConstraintsRequest;

  const requestConstraintsOrPreset:
    | { constraints: ConstraintNode }
    | { preset: Preset } = useMemo(() => {
    if (worldIdVersion !== "4.0") {
      return { preset: createPreset(presetKind, widgetSignal) };
    }
    if (v4CredentialType === "proof_of_human") {
      return { preset: proofOfHuman({ signal: widgetSignal }) };
    }
    if (v4CredentialType === "passport") {
      return { preset: passportPreset({ signal: widgetSignal }) };
    }
    if (v4CredentialType === "mnc") {
      if (genesisIssuedAtMin == null) {
        return { preset: mncPreset({ signal: widgetSignal }) };
      }
      return {
        constraints: CredentialRequest("mnc", {
          signal: widgetSignal,
          genesis_issued_at_min: genesisIssuedAtMin,
        }),
      };
    }
    if (v4CredentialType === "identity_check") {
      return {
        preset: identityCheck({
          attributes: identityAttributesPayload,
        }),
      };
    }
    return {
      constraints: CredentialRequest(v4CredentialType, {
        genesis_issued_at_min: genesisIssuedAtMin,
      }),
    };
  }, [
    worldIdVersion,
    presetKind,
    v4CredentialType,
    genesisIssuedAtMin,
    identityAttributesPayload,
    widgetSignal,
  ]);

  const sessionConstraints = useMemo(
    () =>
      CredentialRequest(sessionCredentialType, {
        genesis_issued_at_min: genesisIssuedAtMin,
      }),
    [sessionCredentialType, genesisIssuedAtMin],
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
    if (worldIdVersion !== "4.0" || isV4PresetCredential) {
      setGenesisEnabled(false);
      setGenesisDate("");
      setIdentityAttributes(DEFAULT_IDENTITY_ATTRIBUTES);
    }
  }, [isV4PresetCredential, worldIdVersion]);

  useEffect(() => {
    if (v4CredentialType === "identity_check") {
      setGenesisEnabled(false);
      setGenesisDate("");
    }

    if (flowMode !== "request") {
      setWorldIdVersion("4.0");
      setUseInviteCode(false);
      if (v4CredentialType === "identity_check") {
        setV4CredentialType("proof_of_human");
      }
    }

    if (flowMode !== "session") {
      setSessionId("");
    }
  }, [flowMode, v4CredentialType]);

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
    setWidgetSessionResult(null);
    setWasIdentityCheck(isIdentityCheck);

    if (!canStartWidgetFlow) {
      setWidgetError("Select at least one identity attribute.");
      return;
    }

    const trimmedSessionId = sessionId.trim();

    if (isProveSessionFlow && !SESSION_ID_PATTERN.test(trimmedSessionId)) {
      setWidgetError(
        "Session ID must be in the format session_<128 hex characters>.",
      );
      return;
    }

    try {
      const rpContext = await fetchRpContext(
        flowMode,
        isSessionFlow ? undefined : action || "test-action",
      );
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
          <label htmlFor="cfgFlowMode">Flow</label>
          <select
            id="cfgFlowMode"
            value={flowMode}
            onChange={(e) => setFlowMode(e.target.value as FlowMode)}
          >
            <option value="request">{FLOW_MODE_TO_NAME.request}</option>
            <option value="create_session">
              {FLOW_MODE_TO_NAME.create_session}
            </option>
            <option value="session">{FLOW_MODE_TO_NAME.session}</option>
          </select>
        </div>
        <div className="config-row">
          <label htmlFor="cfgAppId">App ID</label>
          <input type="text" id="cfgAppId" value={APP_ID} readOnly />
        </div>
        <div className="config-row">
          <label htmlFor="cfgRpId">RP ID</label>
          <input type="text" id="cfgRpId" value={RP_ID} readOnly />
        </div>
        {!isSessionFlow && (
          <div className="config-row">
            <label htmlFor="cfgAction">Action</label>
            <input
              type="text"
              id="cfgAction"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
          </div>
        )}
        {isProveSessionFlow && (
          <div className="config-row">
            <label htmlFor="cfgSessionId">Session ID</label>
            <input
              type="text"
              id="cfgSessionId"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="session_..."
            />
          </div>
        )}
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
        {!isSessionFlow && (
          <div className="config-row">
            <label htmlFor="cfgUseInviteCode">Use invite code</label>
            <input
              type="checkbox"
              id="cfgUseInviteCode"
              checked={useInviteCode}
              onChange={(e) => setUseInviteCode(e.target.checked)}
            />
          </div>
        )}
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
            disabled={isSessionFlow}
          >
            <option value="3.0">3.0</option>
            <option value="4.0">4.0</option>
          </select>
        </div>

        {!isSessionFlow && worldIdVersion === "3.0" && (
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
                <option value="proof_of_human">Proof Of Human</option>
                <option value="selfie">Selfie</option>
                <option value="passport">Passport</option>
                <option value="mnc">My Number Card</option>
                {!isSessionFlow && (
                  <option value="identity_check">Identity Check</option>
                )}
              </select>
            </div>
            {v4CredentialType !== "identity_check" && (
              <>
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
                    disabled={isV4PresetCredential}
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
            {!isSessionFlow && v4CredentialType === "identity_check" && (
              <>
                <div className="config-row">
                  <label htmlFor="cfgIdentityDocumentType">Document type</label>
                  <input
                    type="checkbox"
                    id="cfgIdentityDocumentType"
                    checked={identityAttributes.document_type.enabled}
                    onChange={(e) =>
                      setIdentityAttributes((current) => ({
                        ...current,
                        document_type: {
                          ...current.document_type,
                          enabled: e.target.checked,
                        },
                      }))
                    }
                  />
                  {identityAttributes.document_type.enabled && (
                    <select
                      aria-label="Document type value"
                      value={identityAttributes.document_type.value}
                      onChange={(e) =>
                        setIdentityAttributes((current) => ({
                          ...current,
                          document_type: {
                            ...current.document_type,
                            value: e.target.value as DocumentType,
                          },
                        }))
                      }
                    >
                      <option value="passport">Passport</option>
                      <option value="eid">eID</option>
                      <option value="mnc">MNC</option>
                    </select>
                  )}
                </div>
                <div className="config-row">
                  <label htmlFor="cfgIdentityDocumentNumber">
                    Document number
                  </label>
                  <input
                    type="checkbox"
                    id="cfgIdentityDocumentNumber"
                    checked={identityAttributes.document_number.enabled}
                    onChange={(e) =>
                      setIdentityAttributes((current) => ({
                        ...current,
                        document_number: {
                          ...current.document_number,
                          enabled: e.target.checked,
                        },
                      }))
                    }
                  />
                  {identityAttributes.document_number.enabled && (
                    <input
                      type="text"
                      aria-label="Document number value"
                      value={identityAttributes.document_number.value}
                      onChange={(e) =>
                        setIdentityAttributes((current) => ({
                          ...current,
                          document_number: {
                            ...current.document_number,
                            value: e.target.value,
                          },
                        }))
                      }
                      placeholder="A1234567"
                    />
                  )}
                </div>
                <div className="config-row">
                  <label htmlFor="cfgIdentityIssuingCountry">
                    Issuing country
                  </label>
                  <input
                    type="checkbox"
                    id="cfgIdentityIssuingCountry"
                    checked={identityAttributes.issuing_country.enabled}
                    onChange={(e) =>
                      setIdentityAttributes((current) => ({
                        ...current,
                        issuing_country: {
                          ...current.issuing_country,
                          enabled: e.target.checked,
                        },
                      }))
                    }
                  />
                  {identityAttributes.issuing_country.enabled && (
                    <>
                      <input
                        type="text"
                        aria-label="Issuing country value"
                        value={identityAttributes.issuing_country.value}
                        onChange={(e) =>
                          setIdentityAttributes((current) => ({
                            ...current,
                            issuing_country: {
                              ...current.issuing_country,
                              value: normalizeAlpha3(e.target.value),
                            },
                          }))
                        }
                        maxLength={3}
                        placeholder="JPN"
                      />
                      {identityAttributes.issuing_country.value &&
                        (isValidAlpha3(
                          identityAttributes.issuing_country.value,
                        ) ? (
                          <span
                            className="config-note"
                            style={{ flex: "none" }}
                          >
                            {countries.getName(
                              identityAttributes.issuing_country.value,
                              "en",
                            )}
                          </span>
                        ) : (
                          <span
                            className="config-note"
                            style={{ flex: "none", color: "#ef4444" }}
                          >
                            ISO 3166-1 alpha-3
                          </span>
                        ))}
                    </>
                  )}
                </div>
                <div className="config-row">
                  <label htmlFor="cfgIdentityFullName">Full name</label>
                  <input
                    type="checkbox"
                    id="cfgIdentityFullName"
                    checked={identityAttributes.full_name.enabled}
                    onChange={(e) =>
                      setIdentityAttributes((current) => ({
                        ...current,
                        full_name: {
                          ...current.full_name,
                          enabled: e.target.checked,
                        },
                      }))
                    }
                  />
                  {identityAttributes.full_name.enabled && (
                    <input
                      type="text"
                      aria-label="Full name value"
                      value={identityAttributes.full_name.value}
                      onChange={(e) =>
                        setIdentityAttributes((current) => ({
                          ...current,
                          full_name: {
                            ...current.full_name,
                            value: e.target.value,
                          },
                        }))
                      }
                      placeholder="Jane Doe"
                    />
                  )}
                </div>
                <div className="config-row">
                  <label htmlFor="cfgIdentityMinimumAge">Minimum age</label>
                  <input
                    type="checkbox"
                    id="cfgIdentityMinimumAge"
                    checked={identityAttributes.minimum_age.enabled}
                    onChange={(e) =>
                      setIdentityAttributes((current) => ({
                        ...current,
                        minimum_age: {
                          ...current.minimum_age,
                          enabled: e.target.checked,
                        },
                      }))
                    }
                  />
                  {identityAttributes.minimum_age.enabled && (
                    <input
                      type="number"
                      aria-label="Minimum age value"
                      value={identityAttributes.minimum_age.value}
                      onChange={(e) =>
                        setIdentityAttributes((current) => ({
                          ...current,
                          minimum_age: {
                            ...current.minimum_age,
                            value: e.target.value,
                          },
                        }))
                      }
                      min={1}
                      max={255}
                      placeholder="18"
                    />
                  )}
                </div>
                <div className="config-row">
                  <label htmlFor="cfgIdentityNationality">Nationality</label>
                  <input
                    type="checkbox"
                    id="cfgIdentityNationality"
                    checked={identityAttributes.nationality.enabled}
                    onChange={(e) =>
                      setIdentityAttributes((current) => ({
                        ...current,
                        nationality: {
                          ...current.nationality,
                          enabled: e.target.checked,
                        },
                      }))
                    }
                  />
                  {identityAttributes.nationality.enabled && (
                    <>
                      <input
                        type="text"
                        aria-label="Nationality value"
                        value={identityAttributes.nationality.value}
                        onChange={(e) =>
                          setIdentityAttributes((current) => ({
                            ...current,
                            nationality: {
                              ...current.nationality,
                              value: normalizeAlpha3(e.target.value),
                            },
                          }))
                        }
                        maxLength={3}
                        placeholder="JPN"
                      />
                      {identityAttributes.nationality.value &&
                        (isValidAlpha3(identityAttributes.nationality.value) ? (
                          <span
                            className="config-note"
                            style={{ flex: "none" }}
                          >
                            {countries.getName(
                              identityAttributes.nationality.value,
                              "en",
                            )}
                          </span>
                        ) : (
                          <span
                            className="config-note"
                            style={{ flex: "none", color: "#ef4444" }}
                          >
                            ISO 3166-1 alpha-3
                          </span>
                        ))}
                    </>
                  )}
                </div>
              </>
            )}
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
        {!isSessionFlow && worldIdVersion === "3.0" && (
          <>
            <button onClick={startWidgetFlow}>
              Verify with {PRESET_KIND_TO_NAME[presetKind]}
            </button>
          </>
        )}

        {!isSessionFlow && worldIdVersion === "4.0" && (
          <button onClick={startWidgetFlow} disabled={!canStartWidgetFlow}>
            Verify with {V4_CREDENTIAL_TO_NAME[v4CredentialType]}
          </button>
        )}

        {isCreateSessionFlow && (
          <button onClick={startWidgetFlow}>
            Create Session with {V4_CREDENTIAL_TO_NAME[sessionCredentialType]}
          </button>
        )}

        {isProveSessionFlow && (
          <button onClick={startWidgetFlow}>
            Prove Session with {V4_CREDENTIAL_TO_NAME[sessionCredentialType]}
          </button>
        )}
      </div>
      {isIdentityCheck && identityAttributesPayload.length === 0 && (
        <p className="status">Select at least one identity attribute.</p>
      )}
      {widgetError && <p className="status">Error: {widgetError}</p>}

      {widgetRpContext &&
        !isSessionFlow &&
        (useInviteCode ? (
          <IDKitInviteCodeRequestWidget
            open={widgetOpen}
            onOpenChange={setWidgetOpen}
            app_id={APP_ID}
            action={action || "test-action"}
            rp_context={widgetRpContext}
            allow_legacy_proofs={shouldAllowLegacyProofs}
            require_user_presence={requireUserPresence}
            {...requestConstraintsOrPreset}
            onSuccess={() => {}}
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
            allow_legacy_proofs={shouldAllowLegacyProofs}
            require_user_presence={requireUserPresence}
            {...requestConstraintsOrPreset}
            onSuccess={() => {}}
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

      {widgetRpContext && isSessionFlow && (
        <IDKitSessionWidget
          open={widgetOpen}
          onOpenChange={setWidgetOpen}
          app_id={APP_ID}
          rp_context={widgetRpContext}
          constraints={sessionConstraints}
          {...(isProveSessionFlow
            ? {
                existing_session_id: sessionId.trim() as `session_${string}`,
              }
            : {})}
          onSuccess={() => {}}
          handleVerify={async (result) => {
            setWidgetSessionResult(result);
            const verified = await verifyProof(
              result as unknown as IDKitResult,
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
      )}

      {widgetIdkitResult && (
        <>
          <h3>IDKit response</h3>
          {widgetIdkitResult.protocol_version === "4.0" &&
            !("session_id" in widgetIdkitResult) &&
            (wasIdentityCheck ||
              widgetIdkitResult.identity_attested !== undefined) && (
              <p
                style={{
                  color:
                    widgetIdkitResult.identity_attested === true
                      ? "#22c55e"
                      : "#ef4444",
                  fontWeight: "bold",
                  margin: "8px 0",
                }}
              >
                Identity Attested:{" "}
                {widgetIdkitResult.identity_attested === true
                  ? "✓ Yes"
                  : widgetIdkitResult.identity_attested === false
                    ? "✗ No"
                    : "✗ Missing"}
              </p>
            )}
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {JSON.stringify(widgetIdkitResult, null, 2)}
          </pre>
        </>
      )}

      {widgetSessionResult && (
        <>
          <h3>Session response</h3>
          <p>
            <strong>Session ID:</strong>{" "}
            <code style={{ wordBreak: "break-all" }}>
              {widgetSessionResult.session_id}
            </code>
          </p>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {JSON.stringify(widgetSessionResult, null, 2)}
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
