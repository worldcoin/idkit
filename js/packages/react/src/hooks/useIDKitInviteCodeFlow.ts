import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IDKitErrorCodes,
  isInWorldApp as isInWorldAppCheck,
  isDebug,
  type IDKitInviteCodeRequest,
} from "@worldcoin/idkit-core";
import type { FlowConfig, IDKitInviteCodeHookResult } from "../types";
import { delay, ensureNotAborted, toErrorCode } from "./common";
import {
  createInitialInviteCodeHookState,
  type InviteCodeHookState,
} from "./inviteCodeCommon";

export function useIDKitInviteCodeFlow<TResult>(
  createFlowHandle: () => Promise<IDKitInviteCodeRequest>,
  config: FlowConfig,
): IDKitInviteCodeHookResult<TResult> {
  const isInWorldApp = useMemo(() => isInWorldAppCheck(), []);

  const [state, setState] = useState<InviteCodeHookState<TResult>>(
    createInitialInviteCodeHookState,
  );
  const [runId, setRunId] = useState(0);
  // Mutable handle so event handlers (reset) can cancel the active polling loop.
  const abortRef = useRef<AbortController | null>(null);
  // Refs keep the effect stable (deps: [state.isOpen]) while always reading the latest values.
  const createFlowHandleRef = useRef(createFlowHandle);
  const configRef = useRef(config);

  // Updated every render so the effect reads fresh closures/config without re-triggering.
  createFlowHandleRef.current = createFlowHandle;
  configRef.current = config;

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(createInitialInviteCodeHookState);
    setRunId((id) => id + 1);
  }, []);

  const open = useCallback(() => {
    setState((prev) => {
      if (prev.isOpen) {
        return prev;
      }

      return {
        isOpen: true,
        status: "waiting_for_connection",
        code: null,
        codeExpiresAt: null,
        result: null,
        errorCode: null,
      };
    });
  }, []);

  useEffect(() => {
    if (!state.isOpen) {
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    const setFailed = (errorCode: IDKitErrorCodes) => {
      setState((prev) => {
        if (prev.status === "failed" && prev.errorCode === errorCode) {
          return prev;
        }

        return {
          ...prev,
          status: "failed",
          errorCode,
        };
      });
    };

    void (async () => {
      try {
        if (isDebug())
          console.debug("[IDKit] Creating invite-code flow handle…");
        const request = await createFlowHandleRef.current();
        ensureNotAborted(controller.signal);
        if (isDebug())
          console.debug("[IDKit] Invite-code flow created", {
            code: request.code,
            expiresAt: request.expiresAt,
            requestId: request.requestId,
          });

        const code = request.code;
        const codeExpiresAt = request.expiresAt;
        setState((prev) => {
          if (prev.code === code && prev.codeExpiresAt === codeExpiresAt) {
            return prev;
          }
          return { ...prev, code, codeExpiresAt };
        });

        const pollInterval = configRef.current.polling?.interval ?? 1000;
        const timeout = configRef.current.polling?.timeout ?? 900_000;
        const startedAt = Date.now();

        while (true) {
          ensureNotAborted(controller.signal);

          if (Date.now() - startedAt > timeout) {
            setFailed(IDKitErrorCodes.Timeout);
            return;
          }

          const nextStatus = await request.pollOnce();
          ensureNotAborted(controller.signal);

          if (nextStatus.type === "confirmed") {
            const confirmedResult = nextStatus.result;
            if (!confirmedResult) {
              setFailed(IDKitErrorCodes.UnexpectedResponse);
              return;
            }

            setState((prev) => ({
              ...prev,
              status: "confirmed",
              result: confirmedResult as TResult,
              errorCode: null,
            }));
            return;
          }

          if (nextStatus.type === "failed") {
            if (isDebug())
              console.warn(
                "[IDKit] Invite-code poll returned failed",
                nextStatus,
              );
            setFailed(nextStatus.error ?? IDKitErrorCodes.GenericError);
            return;
          }

          setState((prev) => {
            if (prev.status === nextStatus.type) {
              return prev;
            }
            return { ...prev, status: nextStatus.type };
          });

          await delay(pollInterval, controller.signal);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          if (isDebug()) console.debug("[IDKit] Invite-code flow aborted");
          return;
        }

        if (isDebug()) console.error("[IDKit] Invite-code flow error:", error);
        setFailed(toErrorCode(error));
      }
    })();

    return () => {
      controller.abort();
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    };
  }, [state.isOpen, runId, isInWorldApp]);

  return {
    open,
    reset,
    isAwaitingUserConnection: state.status === "waiting_for_connection",
    isAwaitingUserConfirmation: state.status === "awaiting_confirmation",
    isSuccess: state.status === "confirmed",
    isError: state.status === "failed",
    code: state.code,
    codeExpiresAt: state.codeExpiresAt,
    result: state.result,
    errorCode: state.errorCode,
    isOpen: state.isOpen,
    isInWorldApp,
  };
}
