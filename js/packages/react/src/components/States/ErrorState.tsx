import type { ReactElement } from "react";
import { __ } from "../../lang";
import { IDKitErrorCodes } from "@worldcoin/idkit-core";
import { ErrorIcon } from "../Icons/ErrorIcon";
import { WarningIcon } from "../Icons/WarningIcon";

type ErrorStateProps = {
  errorCode: IDKitErrorCodes | null;
  onRetry: () => void;
  onClose: () => void;
};

type ErrorVariant =
  | "already_verified"
  | "cancelled"
  | "configuration_error"
  | "connection"
  | "host_verification"
  | "generic";

const errorCodeVariants: Partial<Record<IDKitErrorCodes, ErrorVariant>> = {
  [IDKitErrorCodes.UserRejected]: "cancelled",
  [IDKitErrorCodes.VerificationRejected]: "cancelled",
  [IDKitErrorCodes.Cancelled]: "cancelled",
  [IDKitErrorCodes.ConnectionFailed]: "connection",
  [IDKitErrorCodes.FailedByHostApp]: "host_verification",
  [IDKitErrorCodes.InvalidRpSignature]: "configuration_error",
  [IDKitErrorCodes.NullifierReplayed]: "already_verified",
  [IDKitErrorCodes.DuplicateNonce]: "configuration_error",
  [IDKitErrorCodes.UnknownRp]: "configuration_error",
  [IDKitErrorCodes.InactiveRp]: "configuration_error",
  [IDKitErrorCodes.TimestampTooOld]: "configuration_error",
  [IDKitErrorCodes.TimestampTooFarInFuture]: "configuration_error",
  [IDKitErrorCodes.InvalidTimestamp]: "configuration_error",
  [IDKitErrorCodes.RpSignatureExpired]: "configuration_error",
  [IDKitErrorCodes.InvalidRpIdFormat]: "configuration_error",
};

const variantConfig = {
  already_verified: {
    title: "Already verified" as const,
    message: "You've already verified for this action." as const,
    Icon: WarningIcon,
    actionLabel: "Close" as const,
    action: "close" as const,
  },
  cancelled: {
    title: "Request cancelled" as const,
    message: "You've cancelled the request in World App." as const,
    Icon: WarningIcon,
    actionLabel: "Try Again" as const,
    action: "retry" as const,
  },
  configuration_error: {
    title: "Verification unavailable" as const,
    message:
      "This verification request couldn't be completed. Please contact the website owner." as const,
    Icon: ErrorIcon,
    actionLabel: "Close" as const,
    action: "close" as const,
  },
  connection: {
    title: "Connection lost" as const,
    message: "Please check your connection and try again." as const,
    Icon: ErrorIcon, // placeholder — swap for WifiOffIcon later
    actionLabel: "Try Again" as const,
    action: "retry" as const,
  },
  host_verification: {
    title: "Verification declined" as const,
    message:
      "Failed to verify your credential proof. Please contact the website owner." as const,
    Icon: ErrorIcon,
    actionLabel: "Try Again" as const,
    action: "retry" as const,
  },
  generic: {
    title: "Something went wrong" as const,
    message: "We couldn't complete your request. Please try again." as const,
    Icon: ErrorIcon,
    actionLabel: "Try Again" as const,
    action: "retry" as const,
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
  onClose,
  onRetry,
}: ErrorStateProps): ReactElement {
  const variant = getVariant(errorCode);
  const { title, message, Icon, action, actionLabel } = variantConfig[variant];
  const handleAction = action === "close" ? onClose : onRetry;

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
      <button type="button" className="idkit-retry-btn" onClick={handleAction}>
        {__(actionLabel)}
      </button>
    </div>
  );
}
