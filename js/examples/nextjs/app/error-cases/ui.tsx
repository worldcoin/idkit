"use client";

import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  CredentialRequest,
  IDKitErrorCodes,
  IDKitRequestWidget,
  setDebug,
  type IDKitResult,
  type RpContext,
} from "@worldcoin/idkit";

setDebug(true);

type TestCaseId =
  | "valid_success"
  | "invalid_rp_signature"
  | "duplicate_nonce"
  | "nullifier_replayed"
  | "invalid_rp_id_format"
  | "unknown_rp"
  | "inactive_rp"
  | "timestamp_too_old"
  | "timestamp_too_far_in_future"
  | "invalid_timestamp"
  | "rp_signature_expired";

type ExpectedOutcome = "success" | IDKitErrorCodes;
type RunPhase = "run" | "prime";
type ResultStatus = "idle" | "running" | "ready" | "pass" | "fail" | "skipped";

type TestCaseDefinition = {
  id: TestCaseId;
  title: string;
  expected: ExpectedOutcome;
  description: string;
};

type TestCaseResult = {
  status: ResultStatus;
  message: string;
  expected?: ExpectedOutcome;
  actual?: string;
  note?: string;
};

type TestCaseResponse =
  | {
      configured: true;
      caseId: TestCaseId;
      action: string;
      rpContext: RpContext;
      note?: string;
    }
  | {
      configured: false;
      error: string;
    };

type ActiveRun = {
  caseId: TestCaseId;
  phase: RunPhase;
  expected: ExpectedOutcome;
  finalExpected?: IDKitErrorCodes;
  action: string;
  rpContext: RpContext;
  signal: string;
};

const APP_ID = process.env.NEXT_PUBLIC_APP_ID as `app_${string}` | undefined;
const RP_ID = process.env.NEXT_PUBLIC_RP_ID;
const STAGING_CONNECT_BASE_URL = "https://staging.world.org/verify";

const TEST_CASES: TestCaseDefinition[] = [
  {
    id: "valid_success",
    title: "Valid request",
    expected: "success",
    description: "Baseline proof request that should generate and verify.",
  },
  {
    id: "invalid_rp_signature",
    title: "Invalid RP signature",
    expected: IDKitErrorCodes.InvalidRpSignature,
    description:
      "Flips one byte in the RP signature while keeping the payload parseable.",
  },
  {
    id: "duplicate_nonce",
    title: "Duplicate nonce",
    expected: IDKitErrorCodes.DuplicateNonce,
    description:
      "Consumes a signed nonce once, then signs a fresh action with that nonce.",
  },
  {
    id: "nullifier_replayed",
    title: "Nullifier replayed",
    expected: IDKitErrorCodes.NullifierReplayed,
    description:
      "Verifies once for a stable action, then requests another proof for it.",
  },
  {
    id: "invalid_rp_id_format",
    title: "Invalid RP ID format",
    expected: IDKitErrorCodes.InvalidRpIdFormat,
    description: "Uses an RP ID that cannot be parsed by the SDK.",
  },
  {
    id: "unknown_rp",
    title: "Unknown RP",
    expected: IDKitErrorCodes.UnknownRp,
    description: "Uses an RP ID that should not exist in the RP registry.",
  },
  {
    id: "inactive_rp",
    title: "Inactive RP",
    expected: IDKitErrorCodes.InactiveRp,
    description:
      "Requires an RP ID that exists in the registry but is inactive.",
  },
  {
    id: "timestamp_too_old",
    title: "Timestamp too old",
    expected: IDKitErrorCodes.TimestampTooOld,
    description:
      "Signs a request created outside the accepted freshness window.",
  },
  {
    id: "timestamp_too_far_in_future",
    title: "Timestamp too far in future",
    expected: IDKitErrorCodes.TimestampTooFarInFuture,
    description:
      "Signs a request with a created_at timestamp ahead of the freshness window.",
  },
  {
    id: "invalid_timestamp",
    title: "Invalid timestamp",
    expected: IDKitErrorCodes.InvalidTimestamp,
    description:
      "Uses a timestamp value intended to fail parser-level timestamp validation.",
  },
  {
    id: "rp_signature_expired",
    title: "RP signature expired",
    expected: IDKitErrorCodes.RpSignatureExpired,
    description:
      "Signs a request whose expires_at value is already in the past.",
  },
];

const FINAL_EXPECTED: Partial<Record<TestCaseId, IDKitErrorCodes>> = {
  duplicate_nonce: IDKitErrorCodes.DuplicateNonce,
  nullifier_replayed: IDKitErrorCodes.NullifierReplayed,
};

function createChromeAppDeeplink(url: string): string {
  const parsed = new URL(url);
  return parsed.protocol === "https:" ? "googlechromes://" : "googlechrome://";
}

function resultClass(status: ResultStatus): string {
  return `test-case-status ${status}`;
}

function makeAction(caseId: TestCaseId, actionPrefix: string): string {
  const base = actionPrefix.trim() || "idkit-test-case";
  if (caseId === "nullifier_replayed") {
    return `${base}-${caseId}`;
  }
  return `${base}-${caseId}-${Date.now()}`;
}

function makeSignal(caseId: TestCaseId, action: string): string {
  if (caseId === "nullifier_replayed") {
    return `${action}-signal`;
  }

  return `${caseId}-${Date.now()}`;
}

async function fetchTestCaseContext(
  caseId: TestCaseId,
  action: string,
  nonce?: string,
): Promise<TestCaseResponse> {
  const response = await fetch("/api/error-cases/rp-context", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ caseId, action, nonce }),
  });
  const payload = (await response.json()) as
    | TestCaseResponse
    | { error?: string };

  if (response.status === 422 && "configured" in payload) {
    return payload as TestCaseResponse;
  }

  if (!response.ok) {
    throw new Error(
      "error" in payload && payload.error
        ? payload.error
        : "Failed to create test-case RP context",
    );
  }

  return payload as TestCaseResponse;
}

async function verifyProof(
  payload: IDKitResult,
  rpContext: RpContext,
): Promise<unknown> {
  const response = await fetch("/api/verify-proof", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rp_id: rpContext.rp_id, devPortalPayload: payload }),
  });

  const json = await response.json();
  if (!response.ok) {
    throw new Error(json.error ?? "Verification failed");
  }

  return json;
}

export function TestCasesClient(): ReactElement {
  const [isLightTheme, setIsLightTheme] = useState(false);
  const [environment, setEnvironment] = useState<"production" | "staging">(
    "production",
  );
  const [useStagingConnectBaseUrl, setUseStagingConnectBaseUrl] =
    useState(false);
  const [useReturnTo, setUseReturnTo] = useState(false);
  const [returnTo, setReturnTo] = useState("");
  const [actionPrefix, setActionPrefix] = useState("idkit-e2e");
  const [results, setResults] = useState<
    Partial<Record<TestCaseId, TestCaseResult>>
  >({});
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [duplicateNoncePrime, setDuplicateNoncePrime] = useState<{
    nonce: string;
  } | null>(null);
  const [nullifierReplayAction, setNullifierReplayAction] = useState<
    string | null
  >(null);
  const [lastProof, setLastProof] = useState<IDKitResult | null>(null);
  const [lastVerifyResult, setLastVerifyResult] = useState<unknown>(null);

  const overrideConnectBaseUrl =
    environment === "staging" && useStagingConnectBaseUrl
      ? STAGING_CONNECT_BASE_URL
      : undefined;
  const effectiveReturnTo = useReturnTo
    ? returnTo.trim() || undefined
    : undefined;

  const constraints = useMemo(
    () =>
      CredentialRequest("proof_of_human", {
        signal: activeRun?.signal,
      }),
    [activeRun?.signal],
  );

  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      isLightTheme ? "light" : "dark",
    );
  }, [isLightTheme]);

  useEffect(() => {
    if (environment !== "staging") {
      setUseStagingConnectBaseUrl(false);
    }
  }, [environment]);

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

  const setCaseResult = (caseId: TestCaseId, result: TestCaseResult) => {
    setResults((current) => ({ ...current, [caseId]: result }));
  };

  const startCase = async (testCase: TestCaseDefinition) => {
    if (!APP_ID || !RP_ID) {
      setCaseResult(testCase.id, {
        status: "fail",
        message: "Missing NEXT_PUBLIC_APP_ID or NEXT_PUBLIC_RP_ID",
      });
      return;
    }

    setLastProof(null);
    setLastVerifyResult(null);
    setWidgetOpen(false);

    try {
      const finalExpected = FINAL_EXPECTED[testCase.id];
      let phase: RunPhase = "run";
      let expected = testCase.expected;
      let action = makeAction(testCase.id, actionPrefix);
      let rpContext: RpContext | null = null;
      let nonce: string | undefined;
      let note: string | undefined;

      if (testCase.id === "duplicate_nonce" && duplicateNoncePrime) {
        nonce = duplicateNoncePrime.nonce;
        expected = IDKitErrorCodes.DuplicateNonce;
      } else if (testCase.id === "duplicate_nonce") {
        phase = "prime";
        expected = "success";
      }

      if (testCase.id === "nullifier_replayed" && nullifierReplayAction) {
        action = nullifierReplayAction;
        expected = IDKitErrorCodes.NullifierReplayed;
      } else if (testCase.id === "nullifier_replayed") {
        phase = "prime";
        expected = "success";
      }

      setCaseResult(testCase.id, {
        status: "running",
        message:
          phase === "prime"
            ? "Priming with a successful request first"
            : "Waiting for World App",
        expected: finalExpected ?? expected,
      });

      if (!rpContext) {
        const response = await fetchTestCaseContext(testCase.id, action, nonce);
        if (!response.configured) {
          setCaseResult(testCase.id, {
            status: "skipped",
            message: response.error,
            expected: testCase.expected,
          });
          return;
        }

        action = response.action;
        rpContext = response.rpContext;
        note = response.note;
      }

      setActiveRun({
        caseId: testCase.id,
        phase,
        expected,
        finalExpected,
        action,
        rpContext,
        signal: makeSignal(testCase.id, action),
      });
      setWidgetOpen(true);

      if (note) {
        setCaseResult(testCase.id, {
          status: "running",
          message: "Waiting for World App",
          expected: finalExpected ?? expected,
          note,
        });
      }
    } catch (error) {
      setCaseResult(testCase.id, {
        status: "fail",
        message: error instanceof Error ? error.message : "Unknown error",
        expected: testCase.expected,
      });
    }
  };

  const completeSuccess = (result: IDKitResult) => {
    if (!activeRun) {
      return;
    }

    setLastProof(result);
    setWidgetOpen(false);

    if (activeRun.expected !== "success") {
      setCaseResult(activeRun.caseId, {
        status: "fail",
        message: "Expected an error, but the request succeeded",
        expected: activeRun.expected,
        actual: "success",
      });
      setActiveRun(null);
      return;
    }

    if (activeRun.phase === "prime" && activeRun.caseId === "duplicate_nonce") {
      setDuplicateNoncePrime({
        nonce: activeRun.rpContext.nonce,
      });
      setCaseResult(activeRun.caseId, {
        status: "ready",
        message:
          "Nonce consumed. Run this case again to sign a fresh action with that nonce.",
        expected: activeRun.finalExpected,
        actual: "success",
      });
      setActiveRun(null);
      return;
    }

    if (
      activeRun.phase === "prime" &&
      activeRun.caseId === "nullifier_replayed"
    ) {
      setNullifierReplayAction(activeRun.action);
      setCaseResult(activeRun.caseId, {
        status: "ready",
        message:
          "Action verified once. Run this case again to expect nullifier_replayed.",
        expected: activeRun.finalExpected,
        actual: "success",
      });
      setActiveRun(null);
      return;
    }

    setCaseResult(activeRun.caseId, {
      status: "pass",
      message: "Received expected success",
      expected: "success",
      actual: "success",
    });
    setActiveRun(null);
  };

  const completeError = (errorCode: IDKitErrorCodes) => {
    if (!activeRun) {
      return;
    }

    setWidgetOpen(false);

    const expected =
      activeRun.phase === "prime" && activeRun.finalExpected
        ? activeRun.finalExpected
        : activeRun.expected;

    if (errorCode === expected) {
      setCaseResult(activeRun.caseId, {
        status: "pass",
        message: "Received expected error code",
        expected,
        actual: errorCode,
      });
      setActiveRun(null);
      return;
    }

    setCaseResult(activeRun.caseId, {
      status: "fail",
      message: "Received a different result than expected",
      expected,
      actual: errorCode,
    });
    setActiveRun(null);
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
            Set <code>NEXT_PUBLIC_APP_ID</code>, <code>NEXT_PUBLIC_RP_ID</code>,
            and <code>RP_SIGNING_KEY</code> in <code>.env.local</code>.
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
          <label htmlFor="testAppId">App ID</label>
          <input type="text" id="testAppId" value={APP_ID} readOnly />
        </div>
        <div className="config-row">
          <label htmlFor="testRpId">RP ID</label>
          <input type="text" id="testRpId" value={RP_ID} readOnly />
        </div>
        <div className="config-row">
          <label htmlFor="testActionPrefix">Action prefix</label>
          <input
            type="text"
            id="testActionPrefix"
            value={actionPrefix}
            onChange={(event) => {
              setActionPrefix(event.target.value);
              setDuplicateNoncePrime(null);
              setNullifierReplayAction(null);
            }}
          />
        </div>
        <div className="config-row">
          <label htmlFor="testEnv">Environment</label>
          <select
            id="testEnv"
            value={environment}
            onChange={(event) =>
              setEnvironment(event.target.value as "production" | "staging")
            }
          >
            <option value="production">Production</option>
            <option value="staging">Staging</option>
          </select>
        </div>
        {environment === "staging" && (
          <div className="config-row">
            <label htmlFor="testConnectOverride">Connect override</label>
            <input
              type="checkbox"
              id="testConnectOverride"
              checked={useStagingConnectBaseUrl}
              onChange={(event) =>
                setUseStagingConnectBaseUrl(event.target.checked)
              }
            />
            <span className="config-note">{STAGING_CONNECT_BASE_URL}</span>
          </div>
        )}
        <div className="config-row">
          <label htmlFor="testReturnToEnabled">Return to</label>
          <input
            type="checkbox"
            id="testReturnToEnabled"
            checked={useReturnTo}
            onChange={(event) => setUseReturnTo(event.target.checked)}
          />
          <input
            type="text"
            id="testReturnTo"
            value={returnTo}
            onChange={(event) => setReturnTo(event.target.value)}
            disabled={!useReturnTo}
          />
        </div>
      </section>

      <section className="error-cases">
        {TEST_CASES.map((testCase) => {
          const result = results[testCase.id] ?? {
            status: "idle",
            message: "Not run",
          };
          const isRunning =
            result.status === "running" || activeRun?.caseId === testCase.id;
          const buttonLabel =
            result.status === "ready"
              ? "Run Again"
              : isRunning
                ? "Running"
                : "Run";

          return (
            <article className="test-case-row" key={testCase.id}>
              <div className="test-case-copy">
                <h2>{testCase.title}</h2>
                <p>{testCase.description}</p>
                <code>{testCase.expected}</code>
              </div>
              <div className="test-case-actions">
                <button
                  type="button"
                  onClick={() => void startCase(testCase)}
                  disabled={isRunning}
                >
                  {buttonLabel}
                </button>
                <span className={resultClass(result.status)}>
                  {result.status}
                </span>
              </div>
              <div className="test-case-result">
                <span>{result.message}</span>
                {result.expected && (
                  <span>
                    Expected: <code>{result.expected}</code>
                  </span>
                )}
                {result.actual && (
                  <span>
                    Actual: <code>{result.actual}</code>
                  </span>
                )}
                {result.note && <span>{result.note}</span>}
              </div>
            </article>
          );
        })}
      </section>

      {activeRun && (
        <IDKitRequestWidget
          open={widgetOpen}
          onOpenChange={setWidgetOpen}
          app_id={APP_ID}
          action={activeRun.action}
          rp_context={activeRun.rpContext}
          allow_legacy_proofs={false}
          constraints={constraints}
          handleVerify={async (result) => {
            const verified = await verifyProof(result, activeRun.rpContext);
            setLastVerifyResult(verified);
          }}
          onSuccess={completeSuccess}
          onError={completeError}
          environment={environment}
          override_connect_base_url={overrideConnectBaseUrl}
          return_to={effectiveReturnTo}
        />
      )}

      {(lastProof || lastVerifyResult !== null) && (
        <section>
          {lastProof && (
            <>
              <h2>Last IDKit response</h2>
              <pre>{JSON.stringify(lastProof, null, 2)}</pre>
            </>
          )}
          {lastVerifyResult !== null && (
            <>
              <h2>Last verification response</h2>
              <pre>{JSON.stringify(lastVerifyResult, null, 2)}</pre>
            </>
          )}
        </section>
      )}
    </>
  );
}
