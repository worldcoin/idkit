import type { ReactElement } from "react";
import { __ } from "../../lang";
import { IDKitErrorCodes } from "@worldcoin/idkit-core";
import { ErrorIcon } from "../Icons/ErrorIcon";
import { WarningIcon } from "../Icons/WarningIcon";

type ErrorStateProps = {
  errorCode: IDKitErrorCodes | null;
  onRetry: () => void;
};

type ErrorVariant = "cancelled" | "connection" | "generic";

const errorCodeVariants: Partial<Record<IDKitErrorCodes, ErrorVariant>> = {
  [IDKitErrorCodes.UserRejected]: "cancelled",
  [IDKitErrorCodes.VerificationRejected]: "cancelled",
  [IDKitErrorCodes.FailedByHostApp]: "cancelled",
  [IDKitErrorCodes.Cancelled]: "cancelled",
  [IDKitErrorCodes.ConnectionFailed]: "connection",
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

function getVariant(errorCode: IDKitErrorCodes | null): ErrorVariant {
  if (!errorCode) {
    return "generic";
  }

  return errorCodeVariants[errorCode] ?? "generic";
}

export function ErrorState({
  errorCode,
  onRetry,
}: ErrorStateProps): ReactElement {
  const variant = getVariant(errorCode);
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
