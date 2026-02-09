import { useEffect, useRef, type ReactElement } from "react";
import type { IDKitSessionWidgetProps } from "../types";
import { useIDKitSession } from "../hooks/useIDKitSession";
import { normalizeError } from "../core/errors";
import { IDKitModal } from "./IDKitModal";
import { WorldIDState } from "../components/States/WorldIDState";
import { SuccessState } from "../components/States/SuccessState";
import { ErrorState } from "../components/States/ErrorState";
import { setLocalizationConfig } from "../lang";
import type { IDKitFlowStatus } from "../types/common";

type VisualStage = "worldid" | "success" | "error";

function getVisualStage(status: IDKitFlowStatus): VisualStage {
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
  const error = flow.error;

  const lastResultRef = useRef<unknown>(null);
  const lastErrorRef = useRef<unknown>(null);

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
    void Promise.resolve(onSuccess?.(result)).catch(callbackError => {
      const normalized = normalizeError(callbackError);
      lastErrorRef.current = normalized;
      void onError?.(normalized);
    });
  }, [onSuccess, result]);

  useEffect(() => {
    if (!error || error === lastErrorRef.current) {
      return;
    }

    lastErrorRef.current = error;
    void Promise.resolve(onError?.(error)).catch(() => {
      // Swallow host callback errors to keep widget flow stable.
    });
  }, [error, onError]);

  // Auto-close on success
  useEffect(() => {
    if (status === "confirmed" && autoClose) {
      const timer = setTimeout(() => onOpenChange(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [status, autoClose, onOpenChange]);

  const stage = getVisualStage(status);

  return (
    <IDKitModal
      open={open}
      onOpenChange={onOpenChange}
      shadowRoot={shadowRoot}
    >
      {stage === "worldid" && (
        <WorldIDState
          connectorURI={connectorURI}
          isAwaitingConfirmation={status === "awaiting_confirmation"}
        />
      )}
      {stage === "success" && <SuccessState />}
      {stage === "error" && (
        <ErrorState
          error={error}
          onRetry={() => {
            resetFlow();
            openFlow();
          }}
        />
      )}
    </IDKitModal>
  );
}
