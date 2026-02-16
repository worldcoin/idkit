import { useEffect, useRef, type ReactElement } from "react";
import type { IDKitErrorCodes } from "@worldcoin/idkit-core";
import type { IDKitRequestWidgetProps } from "../types";
import { useIDKitRequest } from "../hooks/useIDKitRequest";
import { IDKitModal } from "./IDKitModal";
import { WorldIDState } from "../components/States/WorldIDState";
import { SuccessState } from "../components/States/SuccessState";
import { ErrorState } from "../components/States/ErrorState";
import { setLocalizationConfig } from "../lang";

type VisualStage = "worldid" | "success" | "error";

function getVisualStage(isSuccess: boolean, isError: boolean): VisualStage {
  if (isSuccess) {
    return "success";
  }

  if (isError) {
    return "error";
  }

  return "worldid";
}

export function IDKitRequestWidget({
  open,
  onOpenChange,
  onSuccess,
  onError,
  autoClose = true,
  language,
  ...config
}: IDKitRequestWidgetProps): ReactElement | null {
  const flow = useIDKitRequest(config);
  const { open: openFlow, reset: resetFlow } = flow;

  const lastResultRef = useRef<unknown>(null);
  const lastErrorCodeRef = useRef<IDKitErrorCodes | null>(null);

  // Set language config
  useEffect(() => {
    if (language) {
      setLocalizationConfig({ language });
    }
  }, [language]);

  useEffect(() => {
    if (open) {
      openFlow();
      return;
    }

    resetFlow();
  }, [open, openFlow, resetFlow]);

  useEffect(() => {
    if (!flow.result || flow.result === lastResultRef.current) {
      return;
    }

    lastResultRef.current = flow.result;
    void Promise.resolve(onSuccess?.(flow.result)).catch(() => {
      // Swallow host callback errors to keep widget flow stable.
    });
  }, [onSuccess, flow.result]);

  useEffect(() => {
    if (!flow.errorCode || flow.errorCode === lastErrorCodeRef.current) {
      return;
    }

    lastErrorCodeRef.current = flow.errorCode;
    void Promise.resolve(onError?.(flow.errorCode)).catch(() => {
      // Swallow host callback errors to keep widget flow stable.
    });
  }, [flow.errorCode, onError]);

  // Auto-close on success
  useEffect(() => {
    if (flow.isSuccess && autoClose) {
      const timer = setTimeout(() => onOpenChange(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [flow.isSuccess, autoClose, onOpenChange]);

  const stage = getVisualStage(flow.isSuccess, flow.isError);
  const showSimulatorCallout = config.environment === "staging";

  return (
    <IDKitModal open={open} onOpenChange={onOpenChange}>
      {stage === "worldid" && (
        <WorldIDState
          connectorURI={flow.connectorURI}
          isAwaitingUserConfirmation={flow.isAwaitingUserConfirmation}
          showSimulatorCallout={showSimulatorCallout}
        />
      )}
      {stage === "success" && <SuccessState />}
      {stage === "error" && (
        <ErrorState
          errorCode={flow.errorCode}
          onRetry={() => {
            resetFlow();
            openFlow();
          }}
        />
      )}
    </IDKitModal>
  );
}
