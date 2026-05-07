import { useEffect, useState, type ReactElement } from "react";
import { __ } from "../../lang";
import { WorldcoinIcon } from "../Icons/WorldIcon";
import { LoadingIcon } from "../Icons/LoadingIcon";
import { QRCode } from "../../widget/QRCode";

type InviteCodeStateProps = {
  connectorURI: string | null;
  codeExpiresAt: number | null;
  isAwaitingUserConfirmation: boolean;
};

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

      {connectorURI && (
        <div
          style={{
            marginTop: 16,
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            maxWidth: 360,
          }}
        >
          <code
            style={{
              flex: 1,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
              fontSize: 12,
              padding: "8px 10px",
              borderRadius: 6,
              background: "var(--idkit-surface-muted, rgba(0,0,0,0.04))",
              color: "var(--idkit-text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              userSelect: "all",
            }}
            title={connectorURI}
          >
            {connectorURI}
          </code>
          <button
            type="button"
            onClick={() => {
              if (typeof navigator !== "undefined" && navigator.clipboard) {
                void navigator.clipboard.writeText(connectorURI);
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
