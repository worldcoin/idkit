"use client";

import { useEffect, useMemo, useState, type ReactElement } from "react";
import {
  documentLegacy,
  IDKitRequestWidget,
  orbLegacy,
  secureDocumentLegacy,
  type IDKitResult,
  type RpContext,
} from "@worldcoin/idkit";

const APP_ID = process.env.NEXT_PUBLIC_APP_ID as `app_${string}` | undefined;
const RP_ID = process.env.NEXT_PUBLIC_RP_ID;
const ACTION = "test-action";

type PresetKind = "orb" | "secure_document" | "document";

function createPreset(kind: PresetKind, signal: string) {
  switch (kind) {
    case "orb":
      return orbLegacy({ signal });
    case "secure_document":
      return secureDocumentLegacy({ signal });
    case "document":
      return documentLegacy({ signal });
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

  const widgetPreset = useMemo(
    () => createPreset(widgetPresetKind, widgetSignal),
    [widgetPresetKind, widgetSignal],
  );

  useEffect(() => {
    document.documentElement.setAttribute(
      "data-theme",
      isLightTheme ? "light" : "dark",
    );
  }, [isLightTheme]);

  const startWidgetFlow = async (presetKind: PresetKind) => {
    setWidgetError(null);
    setWidgetVerifyResult(null);

    try {
      const rpContext = await fetchRpContext(ACTION);
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
      <section>
        <h2>Start IDKit request</h2>
        <p className="status">
          Widget manages state + UI in a shadow root and runs the request flow.
        </p>
        <div className="stack">
          <button onClick={() => startWidgetFlow("orb")}>
            Verify with Orb
          </button>
          <button onClick={() => startWidgetFlow("secure_document")}>
            Verify with Secure Document
          </button>
          <button onClick={() => startWidgetFlow("document")}>
            Verify with Document
          </button>
        </div>
        {widgetError ? <p className="status">Error: {widgetError}</p> : null}

        {widgetRpContext ? (
          <IDKitRequestWidget
            open={widgetOpen}
            onOpenChange={setWidgetOpen}
            app_id={APP_ID}
            action={ACTION}
            rp_context={widgetRpContext}
            allow_legacy_proofs={true}
            preset={widgetPreset}
            onSuccess={async (result) => {
              const verified = await verifyProof(result);
              setWidgetVerifyResult(verified);
            }}
            onError={(error) => {
              setWidgetError(error.message);
            }}
            environment="staging"
            override_connect_base_url="https://staging.world.org/verify"
          />
        ) : null}

        {widgetVerifyResult ? (
          <>
            <h3>Verification response</h3>
            <pre>{JSON.stringify(widgetVerifyResult, null, 2)}</pre>
          </>
        ) : null}
      </section>
    </>
  );
}
