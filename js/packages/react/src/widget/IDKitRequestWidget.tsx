import { useEffect, useRef, useState, type ReactElement } from "react";
import { IDKitErrorCodes, type IDKitResult } from "@worldcoin/idkit-core";
import type { IDKitRequestWidgetProps } from "../types";
import { useIDKitRequest } from "../hooks/useIDKitRequest";
import { IDKitModal } from "./IDKitModal";
import { WorldIDState } from "../components/States/WorldIDState";
import { SuccessState } from "../components/States/SuccessState";
import { ErrorState } from "../components/States/ErrorState";
import { HostAppVerificationState } from "../components/States/HostAppVerificationState";
import { setLocalizationConfig } from "../lang";

type VisualStage = "worldid" | "host_verification" | "success" | "error";

function getVisualStage(
  isSuccess: boolean,
  isError: boolean,
  isHostVerifying: boolean,
): VisualStage {
  if (isError) return "error";
  if (isHostVerifying) return "host_verification";
  if (isSuccess) return "success";
  return "worldid";
}

export function IDKitRequestWidget({
  open,
  onOpenChange,
  handleVerify,
  onSuccess,
  onError,
  autoClose = true,
  language,
  ...config
}: IDKitRequestWidgetProps): ReactElement | null {
  if (typeof onSuccess !== "function") {
    throw new Error("IDKitRequestWidget requires an onSuccess callback.");
  }

  const flow = useIDKitRequest(config);
  const { open: openFlow, reset: resetFlow } = flow;

  const [hostVerifyResult, setHostVerifyResult] = useState<
    "passed" | "failed" | null
  >(null);
  const lastResultRef = useRef<IDKitResult | null>(null);
  const lastErrorCodeRef = useRef<IDKitErrorCodes | null>(null);

  // Set language config
  useEffect(() => {
    if (language) {
      setLocalizationConfig({ language });
    }
  }, [language]);

  useEffect(() => {
    if (open) {
      setHostVerifyResult(null);
      openFlow();
      return;
    }

    setHostVerifyResult(null);
    lastResultRef.current = null;
    lastErrorCodeRef.current = null;
    resetFlow();
  }, [open, openFlow, resetFlow]);

  const isSuccess =
    flow.isSuccess && (!handleVerify || hostVerifyResult === "passed");
  const isError = flow.isError || hostVerifyResult === "failed";
  const isHostVerifying =
    flow.isSuccess && Boolean(handleVerify) && hostVerifyResult === null;
  const effectiveErrorCode =
    flow.errorCode ??
    (hostVerifyResult === "failed" ? IDKitErrorCodes.FailedByHostApp : null);

  useEffect(() => {
    if (!isSuccess || !flow.result || flow.result === lastResultRef.current) {
      return;
    }

    lastResultRef.current = flow.result;
    void Promise.resolve(onSuccess(flow.result)).catch(() => {
      // Swallow host callback errors to keep widget flow stable.
    });
  }, [flow.result, isSuccess, onSuccess]);

  useEffect(() => {
    if (
      !effectiveErrorCode ||
      effectiveErrorCode === lastErrorCodeRef.current
    ) {
      return;
    }

    lastErrorCodeRef.current = effectiveErrorCode;
    void Promise.resolve(onError?.(effectiveErrorCode)).catch(() => {
      // Swallow host callback errors to keep widget flow stable.
    });
  }, [effectiveErrorCode, onError]);

  // In World App context there's no UI to render HostAppVerificationState,
  // so invoke handleVerify programmatically when the proof arrives.
  useEffect(() => {
    if (
      !flow.isInWorldApp ||
      !isHostVerifying ||
      !flow.result ||
      !handleVerify
    ) {
      return;
    }

    void Promise.resolve(handleVerify(flow.result))
      .then(() => setHostVerifyResult("passed"))
      .catch(() => setHostVerifyResult("failed"));
  }, [flow.isInWorldApp, isHostVerifying, flow.result, handleVerify]);

  // Auto-close on success: immediate in World App (no visible UI), delayed in bridge flow
  useEffect(() => {
    if (isSuccess) {
      if (flow.isInWorldApp) {
        onOpenChange(false);
      } else if (autoClose) {
        const timer = setTimeout(() => onOpenChange(false), 2500);
        return () => clearTimeout(timer);
      }
    }
  }, [isSuccess, autoClose, onOpenChange, flow.isInWorldApp]);

  // In World App context, the host app handles all UI — render nothing.
  if (flow.isInWorldApp) {
    return null;
  }

  const stage = getVisualStage(isSuccess, isError, isHostVerifying);
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
      {stage === "host_verification" && (
        <HostAppVerificationState
          onVerify={() => handleVerify!(flow.result!)}
          onPass={() => setHostVerifyResult("passed")}
          onFail={() => setHostVerifyResult("failed")}
        />
      )}
      {stage === "success" && <SuccessState />}
      {stage === "error" && (
        <ErrorState
          errorCode={effectiveErrorCode}
          onRetry={() => {
            setHostVerifyResult(null);
            lastResultRef.current = null;
            lastErrorCodeRef.current = null;
            resetFlow();
            openFlow();
          }}
        />
      )}
    </IDKitModal>
  );
}
