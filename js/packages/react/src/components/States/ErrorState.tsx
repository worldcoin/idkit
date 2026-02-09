import type { ReactElement } from "react";
import { __ } from "../../lang";
import { AppErrorCodes } from "@worldcoin/idkit-core";
import { IDKitFlowError } from "../../core/errors";
import { ErrorIcon } from "../Icons/ErrorIcon";
import { WarningIcon } from "../Icons/WarningIcon";

type ErrorStateProps = {
  error: Error | null;
  onRetry: () => void;
};

type ErrorVariant = "cancelled" | "connection" | "generic";

const errorCodeVariants: Partial<Record<AppErrorCodes, ErrorVariant>> = {
  [AppErrorCodes.VerificationRejected]: "cancelled",
  [AppErrorCodes.FailedByHostApp]: "cancelled",
  [AppErrorCodes.ConnectionFailed]: "connection",
};

const variantConfig = {
  cancelled: {
    title: "Request cancelled" as const,
    message: "You've cancelled the request in World App." as const,
    Icon: WarningIcon,
  },
  connection: {
    title: "Connection lost" as const,
    message: "Please check your connection and try again." as const,
    Icon: ErrorIcon, // placeholder — swap for WifiOffIcon later
  },
  generic: {
    title: "Something went wrong" as const,
    message: "We couldn't complete your request. Please try again." as const,
    Icon: ErrorIcon,
  },
};

function getVariant(error: Error | null): ErrorVariant {
  if (error instanceof IDKitFlowError && error.code) {
    return errorCodeVariants[error.code as AppErrorCodes] ?? "generic";
  }
  return "generic";
}

export function ErrorState({ error, onRetry }: ErrorStateProps): ReactElement {
  const variant = getVariant(error);
  const { title, message, Icon } = variantConfig[variant];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
      }}
    >
      <div className="idkit-error-icon">
        <Icon />
      </div>
      <p className="idkit-error-title">{__(title)}</p>
      <p className="idkit-error-message">{__(message)}</p>
      <button type="button" className="idkit-retry-btn" onClick={onRetry}>
        {__("Try Again")}
      </button>
    </div>
  );
}
