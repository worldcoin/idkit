import { useEffect, useRef, useState, type ReactElement } from "react";
import { IDKitErrorCodes } from "@worldcoin/idkit-core";
import type { IDKitHookResult } from "../types";
import { IDKitModal } from "./IDKitModal";
import { WorldIDState } from "../components/States/WorldIDState";
import { SuccessState } from "../components/States/SuccessState";
import { ErrorState } from "../components/States/ErrorState";
import { HostAppVerificationState } from "../components/States/HostAppVerificationState";
import { setLocalizationConfig } from "../lang";
import type { SupportedLanguage } from "../lang/types";

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

type MaybePromise<T> = Promise<T> | T;

export type IDKitWidgetBaseProps<TResult> = {
  flow: IDKitHookResult<TResult>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  handleVerify?: (result: TResult) => MaybePromise<void>;
  onSuccess: (result: TResult) => MaybePromise<void>;
  onError?: (errorCode: IDKitErrorCodes) => MaybePromise<void>;
  autoClose?: boolean;
  language?: SupportedLanguage;
  showSimulatorCallout: boolean;
};

export function IDKitWidgetBase<TResult>({
  flow,
  open,
  onOpenChange,
  handleVerify,
  onSuccess,
  onError,
  autoClose = true,
  language,
  showSimulatorCallout,
}: IDKitWidgetBaseProps<TResult>): ReactElement | null {
  const { open: openFlow, reset: resetFlow } = flow;

  const [hostVerifyResult, setHostVerifyResult] = useState<
    "passed" | "failed" | null
  >(null);
  const lastResultRef = useRef<TResult | null>(null);
  const lastErrorCodeRef = useRef<IDKitErrorCodes | null>(null);
  // Generation counter: incremented on close/retry to invalidate stale
  // handleVerify resolutions and prevent cross-run state leaks.
  const verifyGenRef = useRef(0);

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
    verifyGenRef.current++;
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

    const gen = ++verifyGenRef.current;

    void Promise.resolve(handleVerify(flow.result))
      .then(() => {
        if (verifyGenRef.current === gen) setHostVerifyResult("passed");
      })
      .catch(() => {
        if (verifyGenRef.current === gen) setHostVerifyResult("failed");
      });
  }, [flow.isInWorldApp, isHostVerifying, flow.result, handleVerify]);

  // In World App there's no visible UI, so auto-close immediately on success or error.
  // In bridge flow, only auto-close on success after the 2.5s delay (errors show retry UI).
  useEffect(() => {
    if (flow.isInWorldApp && (isSuccess || isError)) {
      onOpenChange(false);
    } else if (isSuccess && autoClose) {
      const timer = setTimeout(() => onOpenChange(false), 2500);
      return () => clearTimeout(timer);
    }
  }, [isSuccess, isError, autoClose, onOpenChange, flow.isInWorldApp]);

  // In World App context, the host app handles all UI — render nothing.
  if (flow.isInWorldApp) {
    return null;
  }

  const stage = getVisualStage(isSuccess, isError, isHostVerifying);

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
          onVerify={() => {
            const gen = ++verifyGenRef.current;
            return Promise.resolve(handleVerify!(flow.result!)).then(
              () => {
                if (verifyGenRef.current === gen) setHostVerifyResult("passed");
              },
              () => {
                if (verifyGenRef.current === gen) setHostVerifyResult("failed");
              },
            );
          }}
        />
      )}
      {stage === "success" && <SuccessState />}
      {stage === "error" && (
        <ErrorState
          errorCode={effectiveErrorCode}
          onClose={() => onOpenChange(false)}
          onRetry={() => {
            setHostVerifyResult(null);
            lastResultRef.current = null;
            lastErrorCodeRef.current = null;
            verifyGenRef.current++;
            resetFlow();
            openFlow();
          }}
        />
      )}
    </IDKitModal>
  );
}
