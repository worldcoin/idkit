import { useEffect, useState, type ReactElement } from "react";
import { __ } from "../../lang";
import { WorldcoinIcon } from "../Icons/WorldIcon";
import { LoadingIcon } from "../Icons/LoadingIcon";

type InviteCodeStateProps = {
  code: string | null;
  codeExpiresAt: number | null;
  isAwaitingUserConfirmation: boolean;
};

function formatCodeForDisplay(code: string): string {
  // Canonical form is 6-char Crockford Base32 (no separator).
  // For display, format as "ABC-DEF" when length is exactly 6.
  if (code.length === 6) {
    return `${code.slice(0, 3)}-${code.slice(3)}`;
  }
  return code;
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
  code,
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
      {/* World logo */}
      <div className="idkit-worldid-icon">
        <WorldcoinIcon />
      </div>

      {/* Heading */}
      <h2 className="idkit-heading">{__("Connect your World ID")}</h2>

      {/* Instruction */}
      <p className="idkit-subtext">
        {__("Open World App on your phone and enter this code")}
      </p>

      {/* Code display container — mirrors qr-container layout for the spinner overlay */}
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
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: "24px 16px",
            }}
          >
            <div
              aria-label={
                code ? `Invite code ${formatCodeForDisplay(code)}` : undefined
              }
              style={{
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                fontSize: 36,
                fontWeight: 600,
                letterSpacing: "0.15em",
                color: "var(--idkit-text-primary)",
                userSelect: "all",
              }}
            >
              {code ? formatCodeForDisplay(code) : "------"}
            </div>
            {secondsRemaining !== null && (
              <div
                style={{
                  fontSize: 14,
                  color: "var(--idkit-text-secondary)",
                }}
              >
                {__("Expires in")} {secondsRemaining}s
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
