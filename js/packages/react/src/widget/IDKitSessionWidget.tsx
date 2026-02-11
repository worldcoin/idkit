import { useEffect, useRef, type ReactElement } from "react";
import type { IDKitErrorCodes } from "@worldcoin/idkit-core";
import type { IDKitSessionWidgetProps } from "../types";
import { useIDKitSession } from "../hooks/useIDKitSession";
import { IDKitModal } from "./IDKitModal";
import { WorldIDState } from "../components/States/WorldIDState";
import { SuccessState } from "../components/States/SuccessState";
import { ErrorState } from "../components/States/ErrorState";
import { setLocalizationConfig } from "../lang";
import type { IDKitHookStatus } from "../types/common";

type VisualStage = "worldid" | "success" | "error";

function getVisualStage(status: IDKitHookStatus): VisualStage {
  switch (status) {
    case "confirmed":
      return "success";
    case "failed":
      return "error";
    default:
      return "worldid";
  }
}

export function IDKitSessionWidget({
  open,
  onOpenChange,
  onSuccess,
  onError,
  onStatusChange,
  shadowRoot = true,
  autoClose = true,
  language,
  ...config
}: IDKitSessionWidgetProps): ReactElement | null {
  const flow = useIDKitSession(config);
  const openFlow = flow.open;
  const resetFlow = flow.reset;
  const status = flow.status;
  const connectorURI = flow.connectorURI;
  const result = flow.result;
  const errorCode = flow.errorCode;

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
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  useEffect(() => {
    if (!result || result === lastResultRef.current) {
      return;
    }

    lastResultRef.current = result;
    void Promise.resolve(onSuccess?.(result)).catch(() => {
      // Swallow host callback errors to keep widget flow stable.
    });
  }, [onSuccess, result]);

  useEffect(() => {
    if (!errorCode || errorCode === lastErrorCodeRef.current) {
      return;
    }

    lastErrorCodeRef.current = errorCode;
    void Promise.resolve(onError?.(errorCode)).catch(() => {
      // Swallow host callback errors to keep widget flow stable.
    });
  }, [errorCode, onError]);

  // Auto-close on success
  useEffect(() => {
    if (status === "confirmed" && autoClose) {
      const timer = setTimeout(() => onOpenChange(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [status, autoClose, onOpenChange]);

  const stage = getVisualStage(status);

  return (
    <IDKitModal open={open} onOpenChange={onOpenChange} shadowRoot={shadowRoot}>
      {stage === "worldid" && (
        <WorldIDState
          connectorURI={connectorURI}
          isAwaitingConfirmation={status === "awaiting_confirmation"}
        />
      )}
      {stage === "success" && <SuccessState />}
      {stage === "error" && (
        <ErrorState
          errorCode={errorCode}
          onRetry={() => {
            resetFlow();
            openFlow();
          }}
        />
      )}
    </IDKitModal>
  );
}
