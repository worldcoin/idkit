import type { ReactElement } from "react";
import { __ } from "../../lang";
import { ErrorIcon } from "../Icons/ErrorIcon";
import { WarningIcon } from "../Icons/WarningIcon";

type ErrorStateProps = {
  error: Error | null;
  onRetry: () => void;
};

function getErrorTitle(error: Error | null): string {
  if (!error) return __("Something went wrong");
  const msg = error.message.toLowerCase();

  if (msg.includes("rejected") || msg.includes("cancelled")) {
    return __("Verification Declined");
  }
  return __("Something went wrong");
}

function getErrorMessage(error: Error | null): string {
  if (!error) return __("We couldn't complete your request. Please try again.");
  return error.message;
}

function isRejection(error: Error | null): boolean {
  if (!error) return false;
  const msg = error.message.toLowerCase();
  return msg.includes("rejected") || msg.includes("cancelled");
}

export function ErrorState({ error, onRetry }: ErrorStateProps): ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
      <div className="idkit-error-icon">
        {isRejection(error) ? <WarningIcon /> : <ErrorIcon />}
      </div>
      <p className="idkit-error-title">{getErrorTitle(error)}</p>
      <p className="idkit-error-message">{getErrorMessage(error)}</p>
      <button type="button" className="idkit-retry-btn" onClick={onRetry}>
        {__("Try Again")}
      </button>
    </div>
  );
}
