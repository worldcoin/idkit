import type { ReactElement } from "react";
import type { IDKitInviteCodeRequestWidgetProps } from "../types";
import { useIDKitInviteCodeRequest } from "../hooks/useIDKitInviteCodeRequest";
import { IDKitInviteCodeWidgetBase } from "./IDKitInviteCodeWidgetBase";

export function IDKitInviteCodeRequestWidget({
  open,
  onOpenChange,
  handleVerify,
  onSuccess,
  onError,
  autoClose,
  language,
  ...config
}: IDKitInviteCodeRequestWidgetProps): ReactElement | null {
  if (typeof onSuccess !== "function") {
    throw new Error(
      "IDKitInviteCodeRequestWidget requires an onSuccess callback.",
    );
  }

  const flow = useIDKitInviteCodeRequest(config);

  return (
    <IDKitInviteCodeWidgetBase
      flow={flow}
      open={open}
      onOpenChange={onOpenChange}
      handleVerify={handleVerify}
      onSuccess={onSuccess}
      onError={onError}
      autoClose={autoClose}
      language={language}
    />
  );
}
