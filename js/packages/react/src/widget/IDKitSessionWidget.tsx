import type { ReactElement } from "react";
import type { IDKitSessionWidgetProps } from "../types";
import { useIDKitSession } from "../hooks/useIDKitSession";
import { IDKitWidgetBase } from "./IDKitWidgetBase";

export function IDKitSessionWidget({
  open,
  onOpenChange,
  handleVerify,
  onSuccess,
  onError,
  autoClose,
  language,
  ...config
}: IDKitSessionWidgetProps): ReactElement | null {
  if (typeof onSuccess !== "function") {
    throw new Error("IDKitSessionWidget requires an onSuccess callback.");
  }

  const flow = useIDKitSession(config);

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
