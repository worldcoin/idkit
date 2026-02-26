import { useEffect, useRef, useState, type ReactElement } from "react";
import {
  IDKitErrorCodes,
  type IDKitResultSession,
} from "@worldcoin/idkit-core";
import type { IDKitSessionWidgetProps } from "../types";
import { useIDKitSession } from "../hooks/useIDKitSession";
import { IDKitModal } from "./IDKitModal";
import { WorldIDState } from "../components/States/WorldIDState";
import { SuccessState } from "../components/States/SuccessState";
import { ErrorState } from "../components/States/ErrorState";
import { HostAppVerificationState } from "../components/States/HostAppVerificationState";
import { setLocalizationConfig } from "../lang";

type HostVerificationState = "idle" | "pending" | "passed" | "failed";
type VisualStage = "worldid" | "host_verification" | "success" | "error";

function getVisualStage({
  isFlowSuccess,
  isFlowError,
  hasHandleVerify,
  hostVerificationState,
}: {
  isFlowSuccess: boolean;
  isFlowError: boolean;
  hasHandleVerify: boolean;
  hostVerificationState: HostVerificationState;
}): VisualStage {
  if (isFlowError || hostVerificationState === "failed") {
    return "error";
  }

  if (isFlowSuccess && !hasHandleVerify) {
    return "success";
  }

  if (isFlowSuccess) {
    if (hostVerificationState === "passed") {
      return "success";
    }

    return "host_verification";
  }

  return "worldid";
}

export function IDKitSessionWidget({
  open,
  onOpenChange,
  handleVerify,
  onSuccess,
  onError,
  autoClose = true,
  language,
  ...config
}: IDKitSessionWidgetProps): ReactElement | null {
  if (typeof onSuccess !== "function") {
    throw new Error("IDKitSessionWidget requires an onSuccess callback.");
  }

  const flow = useIDKitSession(config);
  const { open: openFlow, reset: resetFlow } = flow;

  const [hostVerificationState, setHostVerificationState] =
    useState<HostVerificationState>("idle");
  const handleVerifyRef = useRef(handleVerify);
  const verifyRunIdRef = useRef(0);
  const lastVerifiedResultRef = useRef<IDKitResultSession | null>(null);
  const lastResultRef = useRef<IDKitResultSession | null>(null);
  const lastErrorCodeRef = useRef<IDKitErrorCodes | null>(null);

  useEffect(() => {
    handleVerifyRef.current = handleVerify;
  }, [handleVerify]);

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

    verifyRunIdRef.current += 1;
    setHostVerificationState("idle");
    lastVerifiedResultRef.current = null;
    lastResultRef.current = null;
    lastErrorCodeRef.current = null;
    resetFlow();
  }, [open, openFlow, resetFlow]);

  useEffect(() => {
    if (!flow.result || flow.result === lastVerifiedResultRef.current) {
      return;
    }

    lastVerifiedResultRef.current = flow.result;
    const verifyCallback = handleVerifyRef.current;

    if (!verifyCallback) {
      setHostVerificationState("passed");
      return;
    }

    const runId = ++verifyRunIdRef.current;
    setHostVerificationState("pending");

    void Promise.resolve(verifyCallback(flow.result))
      .then(() => {
        if (runId !== verifyRunIdRef.current) {
          return;
        }

        setHostVerificationState("passed");
      })
      .catch(() => {
        if (runId !== verifyRunIdRef.current) {
          return;
        }

        setHostVerificationState("failed");
      });
  }, [flow.result]);

  const effectiveErrorCode =
    flow.errorCode ??
    (hostVerificationState === "failed"
      ? IDKitErrorCodes.FailedByHostApp
      : null);
  const isEffectiveSuccess =
    flow.isSuccess && (!handleVerify || hostVerificationState === "passed");

  useEffect(() => {
    if (
      !isEffectiveSuccess ||
      !flow.result ||
      flow.result === lastResultRef.current
    ) {
      return;
    }

    lastResultRef.current = flow.result;
    void Promise.resolve(onSuccess(flow.result)).catch(() => {
      // Swallow host callback errors to keep widget flow stable.
    });
  }, [flow.result, isEffectiveSuccess, onSuccess]);

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

  // Auto-close on success
  useEffect(() => {
    if (isEffectiveSuccess && autoClose) {
      const timer = setTimeout(() => onOpenChange(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [isEffectiveSuccess, autoClose, onOpenChange]);

  const stage = getVisualStage({
    isFlowSuccess: flow.isSuccess,
    isFlowError: flow.isError,
    hasHandleVerify: Boolean(handleVerify),
    hostVerificationState,
  });
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
      {stage === "host_verification" && <HostAppVerificationState />}
      {stage === "success" && <SuccessState />}
      {stage === "error" && (
        <ErrorState
          errorCode={effectiveErrorCode}
          onRetry={() => {
            verifyRunIdRef.current += 1;
            setHostVerificationState("idle");
            lastVerifiedResultRef.current = null;
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
