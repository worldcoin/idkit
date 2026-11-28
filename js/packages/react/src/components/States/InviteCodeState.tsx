import { useEffect, useState, type ReactElement } from "react";
import { __ } from "../../lang";
import { useMedia } from "../../hooks/useMedia";
import { HumanBadgeIcon } from "../Icons/HumanBadgeIcon";
import { WorldIDBadgeIcon } from "../Icons/WorldIDBadgeIcon";
import { QRPlaceholderIcon } from "../Icons/QRPlaceholderIcon";
import { LoadingIcon } from "../Icons/LoadingIcon";
import { CopyIcon } from "../Icons/CopyIcon";
import { CheckIcon } from "../Icons/CheckIcon";
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
  const media = useMedia();
  const now = useNowInSeconds();
  const inviteCode = connectorURI
    ? new URL(connectorURI).searchParams.get("c")
    : null;
  const secondsRemaining =
    codeExpiresAt !== null ? Math.max(0, codeExpiresAt - now) : null;
  const [copied, setCopied] = useState<{ code: string } | null>(null);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(null), 3000);
    return () => clearTimeout(timeout);
  }, [copied]);

  return (
    <div
      className={`idkit-invite-code-state${media === "desktop" ? " idkit-worldid-state" : ""}`}
    >
      {media === "desktop" && (
        <div className="idkit-worldid-icon idkit-worldid-icon--large">
          <WorldIDBadgeIcon />
        </div>
      )}

      <div className="idkit-invite-code-content">
        <div className="idkit-invite-code-intro">
          <div className="idkit-instructions">
            <h2 className={media === "mobile" ? "headline-h3" : "headline-h2"}>
              {__("Connect your World ID")}
            </h2>
            <p className="body-b1">
              {media === "mobile"
                ? __(
                    "You will be redirected to the app, please return to this page once you're done",
                  )
                : __("Scan with your phone to continue verifying")}
            </p>
          </div>

          {/* Desktop: QR code */}
          <div className="idkit-desktop-only">
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
                    {connectorURI ? (
                      <QRCode data={connectorURI} />
                    ) : (
                      <div className="idkit-qr-placeholder">
                        <QRPlaceholderIcon />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {(media === "mobile" || connectorURI) && (
          <div className="idkit-invite-code-actions">
            {/* Mobile: deep-link button */}
            <div className="idkit-mobile-only">
              <a
                href={connectorURI ?? undefined}
                className="idkit-deeplink-btn"
              >
                <HumanBadgeIcon />
                <span>{__("Open World ID App")}</span>
              </a>
            </div>
            {connectorURI && (
              <a
                href={connectorURI}
                target="_blank"
                rel="noopener noreferrer"
                className="idkit-connector-btn"
              >
                {__("Open Connector URL")}
              </a>
            )}
          </div>
        )}

        {(inviteCode || secondsRemaining !== null) && (
          <div className="idkit-invite-code-details">
            {inviteCode && (
              <div className="idkit-invite-code-entry">
                <p
                  style={{
                    margin: 0,
                    fontSize: 14,
                    color: "var(--idkit-foreground-secondary)",
                  }}
                >
                  {__("Or enter this code in World ID App")}
                </p>
                <div className="idkit-invite-code-field">
                  <input
                    className="body-b2"
                    value={inviteCode}
                    readOnly
                    aria-label={__("Or enter this code in World ID App")}
                  />
                  <button
                    type="button"
                    className="idkit-invite-code-copy"
                    aria-label={__("Copy")}
                    title={__("Copy")}
                    onClick={async () => {
                      if (
                        typeof navigator === "undefined" ||
                        !navigator.clipboard
                      ) {
                        return;
                      }
                      try {
                        await navigator.clipboard.writeText(inviteCode);
                        setCopied({ code: inviteCode });
                      } catch {
                        setCopied(null);
                      }
                    }}
                  >
                    {copied?.code === inviteCode ? (
                      <CheckIcon width={20} height={20} aria-hidden="true" />
                    ) : (
                      <CopyIcon aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {secondsRemaining !== null && (
              <div className="idkit-invite-code-expiry">
                {__("Expires in")} {secondsRemaining}s
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
