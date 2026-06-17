import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { IDKitErrorCodes, type IDKitDebugReport } from "@worldcoin/idkit-core";
import type { IDKitInviteCodeHookResult } from "../types";
import { IDKitModal } from "./IDKitModal";
import { InviteCodeState } from "../components/States/InviteCodeState";
import { SuccessState } from "../components/States/SuccessState";
import { ErrorState } from "../components/States/ErrorState";
import { HostAppVerificationState } from "../components/States/HostAppVerificationState";
import { setLocalizationConfig } from "../lang";
import type { SupportedLanguage } from "../lang/types";

type VisualStage = "invite_code" | "host_verification" | "success" | "error";

function getVisualStage(
  isSuccess: boolean,
  isError: boolean,
  isHostVerifying: boolean,
): VisualStage {
  if (isError) return "error";
  if (isHostVerifying) return "host_verification";
  if (isSuccess) return "success";
  return "invite_code";
}

type MaybePromise<T> = Promise<T> | T;

type HostVerifyRun<TResult> = {
  result: TResult;
  gen: number;
};

export type IDKitInviteCodeWidgetBaseProps<TResult> = {
  flow: IDKitInviteCodeHookResult<TResult>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  handleVerify?: (result: TResult) => MaybePromise<void>;
  onSuccess: (result: TResult) => MaybePromise<void>;
  onError?: (
    errorCode: IDKitErrorCodes,
    debugReport?: IDKitDebugReport,
  ) => MaybePromise<void>;
  autoClose?: boolean;
  language?: SupportedLanguage;
};

export function IDKitInviteCodeWidgetBase<TResult>({
  flow,
  open,
  onOpenChange,
  handleVerify,
  onSuccess,
  onError,
  autoClose = true,
  language,
}: IDKitInviteCodeWidgetBaseProps<TResult>): ReactElement | null {
  const { open: openFlow, reset: resetFlow } = flow;

  const [hostVerifyResult, setHostVerifyResult] = useState<
    "passed" | "failed" | null
  >(null);
  const lastResultRef = useRef<TResult | null>(null);
  const lastErrorCodeRef = useRef<IDKitErrorCodes | null>(null);
  const handleVerifyRef = useRef(handleVerify);
  const hostVerifyRunRef = useRef<HostVerifyRun<TResult> | null>(null);
  // Generation counter: changed on start/cancel to ignore stale handleVerify
  // completions after close, retry, or a newer proof.
  const verifyGenRef = useRef(0);

  handleVerifyRef.current = handleVerify;

  const cancelHostVerifyRun = useCallback(() => {
    hostVerifyRunRef.current = null;
    verifyGenRef.current++;
  }, []);

  const startHostVerify = useCallback((result: TResult) => {
    const currentHandleVerify = handleVerifyRef.current;

    if (!currentHandleVerify || hostVerifyRunRef.current?.result === result) {
      return;
    }

    const gen = ++verifyGenRef.current;
    const run = { result, gen };
    hostVerifyRunRef.current = run;

    return Promise.resolve(currentHandleVerify(result))
      .then(() => {
        if (hostVerifyRunRef.current === run && verifyGenRef.current === gen) {
          hostVerifyRunRef.current = null;
          setHostVerifyResult("passed");
        }
      })
      .catch(() => {
        if (hostVerifyRunRef.current === run && verifyGenRef.current === gen) {
          hostVerifyRunRef.current = null;
          setHostVerifyResult("failed");
        }
      });
  }, []);

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
    cancelHostVerifyRun();
    resetFlow();
  }, [open, openFlow, resetFlow, cancelHostVerifyRun]);

  const isSuccess =
    flow.isSuccess && (!handleVerify || hostVerifyResult === "passed");
  const isError = flow.isError || hostVerifyResult === "failed";
  const isHostVerifying =
    flow.isSuccess && Boolean(handleVerify) && hostVerifyResult === null;
  const effectiveErrorCode =
    flow.errorCode ??
    (hostVerifyResult === "failed" ? IDKitErrorCodes.FailedByHostApp : null);
  const effectiveDebugReport = flow.errorCode ? flow.debugReport : undefined;

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
    const errorResult = effectiveDebugReport
      ? onError?.(effectiveErrorCode, effectiveDebugReport)
      : onError?.(effectiveErrorCode);
    void Promise.resolve(errorResult).catch(() => {
      // Swallow host callback errors to keep widget flow stable.
    });
  }, [effectiveErrorCode, effectiveDebugReport, onError]);

  // In World App context there's no UI to render HostAppVerificationState,
  // so invoke handleVerify programmatically when the proof arrives.
  useEffect(() => {
    if (!open || !flow.isInWorldApp || !isHostVerifying || !flow.result) {
      return;
    }

    void startHostVerify(flow.result);
  }, [open, flow.isInWorldApp, isHostVerifying, flow.result, startHostVerify]);

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
      {stage === "invite_code" && (
        <InviteCodeState
          connectorURI={flow.connectorURI}
          codeExpiresAt={flow.codeExpiresAt}
          isAwaitingUserConfirmation={flow.isAwaitingUserConfirmation}
        />
      )}
      {stage === "host_verification" && (
        <HostAppVerificationState
          onVerify={() => startHostVerify(flow.result!)}
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
            cancelHostVerifyRun();
            resetFlow();
            openFlow();
          }}
        />
      )}
    </IDKitModal>
  );
}
