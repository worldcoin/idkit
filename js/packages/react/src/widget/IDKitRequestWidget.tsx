import type { ReactElement } from "react";
import type { IDKitRequestWidgetProps } from "../types";
import { useIDKitRequest } from "../hooks/useIDKitRequest";
import { IDKitWidgetBase } from "./IDKitWidgetBase";

export function IDKitRequestWidget({
  open,
  onOpenChange,
  handleVerify,
  onSuccess,
  onError,
  autoClose,
  language,
  ...config
}: IDKitRequestWidgetProps): ReactElement | null {
  if (typeof onSuccess !== "function") {
    throw new Error("IDKitRequestWidget requires an onSuccess callback.");
  }

  const flow = useIDKitRequest(config);

  return (
    <IDKitWidgetBase
      flow={flow}
      open={open}
      onOpenChange={onOpenChange}
      handleVerify={handleVerify}
      onSuccess={onSuccess}
      onError={onError}
      autoClose={autoClose}
      language={language}
      showSimulatorCallout={config.environment === "staging"}
    />
  );
}
