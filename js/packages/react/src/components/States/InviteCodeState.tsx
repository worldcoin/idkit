import { useEffect, useMemo, useState, type ReactElement } from "react";
import { __ } from "../../lang";
import { WorldcoinIcon } from "../Icons/WorldIcon";
import { LoadingIcon } from "../Icons/LoadingIcon";
import { QRCode } from "../../widget/QRCode";

type InviteCodeStateProps = {
  connectorURI: string | null;
  codeExpiresAt: number | null;
  isAwaitingUserConfirmation: boolean;
};

function extractInviteCode(uri: string): string | null {
  try {
    const url = new URL(uri);
    return url.searchParams.get("c");
  } catch {
    return null;
  }
}

function useNowInSeconds(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function InviteCodeState({
  connectorURI,
  codeExpiresAt,
  isAwaitingUserConfirmation,
}: InviteCodeStateProps): ReactElement {
  const now = useNowInSeconds();
  const secondsRemaining =
    codeExpiresAt !== null ? Math.max(0, codeExpiresAt - now) : null;
  const inviteCode = useMemo(
    () => (connectorURI ? extractInviteCode(connectorURI) : null),
    [connectorURI],
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <div className="idkit-worldid-icon">
        <WorldcoinIcon />
      </div>

      <h2 className="idkit-heading">{__("Connect your World ID")}</h2>

      <p className="idkit-subtext">
        {__("Scan with your phone to continue verifying")}
      </p>

      <div className="idkit-qr-container">
        {isAwaitingUserConfirmation && (
          <div className="idkit-qr-overlay">
            <div className="idkit-spinner">
              <LoadingIcon />
            </div>
            <div className="idkit-connecting-text">
              <p>{__("Connecting...")}</p>
              <p>{__("Please continue in app")}</p>
            </div>
          </div>
        )}

        <div
          className={`idkit-qr-blur ${isAwaitingUserConfirmation ? "blurred" : ""}`}
        >
          <div className="idkit-qr-wrapper">
            <div className="idkit-qr-inner">
              {connectorURI ? <QRCode data={connectorURI} /> : null}
            </div>
          </div>
        </div>
      </div>

      {inviteCode && (
        <div
          style={{
            marginTop: 16,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: "var(--idkit-text-secondary)",
            }}
          >
            {__("Or enter this code in World App")}
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <code
              style={{
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                fontSize: 24,
                fontWeight: 600,
                letterSpacing: "0.1em",
                padding: "8px 16px",
                borderRadius: 8,
                background: "var(--idkit-surface-muted, rgba(0,0,0,0.04))",
                color: "var(--idkit-text-primary)",
                userSelect: "all",
              }}
            >
              {inviteCode}
            </code>
            <button
              type="button"
              onClick={() => {
                if (typeof navigator !== "undefined" && navigator.clipboard) {
                  void navigator.clipboard.writeText(inviteCode);
                }
              }}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid var(--idkit-border, rgba(0,0,0,0.1))",
                background: "var(--idkit-surface, transparent)",
                color: "var(--idkit-text-primary)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {__("Copy")}
            </button>
          </div>
        </div>
      )}

      {secondsRemaining !== null && (
        <div
          style={{
            marginTop: 12,
            fontSize: 14,
            color: "var(--idkit-text-secondary)",
          }}
        >
          {__("Expires in")} {secondsRemaining}s
        </div>
      )}
    </div>
  );
}
