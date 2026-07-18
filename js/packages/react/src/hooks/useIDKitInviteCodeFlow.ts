import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IDKitErrorCodes,
  isInWorldApp as isInWorldAppCheck,
  isDebug,
  type IDKitDebugReport,
  type IDKitInviteCodeRequest,
} from "@worldcoin/idkit-core";
import type { FlowConfig, IDKitInviteCodeHookResult } from "../types";
import {
  delay,
  ensureNotAborted,
  pollOnceWithRetry,
  toErrorCode,
} from "./common";
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
  // Live request handle so getDebugReport() can read the latest report on demand.
  const requestRef = useRef<IDKitInviteCodeRequest | null>(null);
  // Snapshot captured the instant a failure is recorded. It deliberately
  // outlives reset()/close (which only null `requestRef`) and is cleared when a
  // new attempt starts, so the host can always read the report for the error
  // currently being surfaced — even across the reset/re-render the widget does
  // around its onError callback.
  const debugReportRef = useRef<IDKitDebugReport | undefined>(undefined);
  // Refs keep the effect stable (deps: [state.isOpen]) while always reading the latest values.
  const createFlowHandleRef = useRef(createFlowHandle);
  const configRef = useRef(config);

  // Updated every render so the effect reads fresh closures/config without re-triggering.
  createFlowHandleRef.current = createFlowHandle;
  configRef.current = config;

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    requestRef.current = null;
    // NOTE: `debugReportRef` is intentionally NOT cleared here. The host may
    // read the report after reset (the widget resets/re-renders around its
    // onError callback). The snapshot is cleared when a new attempt starts.
    setState(createInitialInviteCodeHookState);
    setRunId((id) => id + 1);
  }, []);

  const getDebugReport = useCallback(
    (): IDKitDebugReport | undefined =>
      debugReportRef.current ?? requestRef.current?.getDebugReport(),
    [],
  );

  const open = useCallback(() => {
    setState((prev) => {
      if (prev.isOpen) {
        return prev;
      }

      return {
        isOpen: true,
        status: "waiting_for_connection",
        connectorURI: null,
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

    // A new attempt is starting; drop any snapshot left by a previous run.
    debugReportRef.current = undefined;

    const controller = new AbortController();
    abortRef.current = controller;

    const setFailed = (errorCode: IDKitErrorCodes) => {
      // Capture the report now, while `requestRef` is still populated — a later
      // reset/close must not be able to wipe it before the host reads it.
      // Guarded so debug-report capture can never destabilize error handling.
      try {
        debugReportRef.current = requestRef.current?.getDebugReport();
      } catch {
        debugReportRef.current = undefined;
      }
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
        requestRef.current = request;
        ensureNotAborted(controller.signal);
        if (isDebug())
          console.debug("[IDKit] Invite-code flow created", {
            connectorURI: request.connectorURI,
            expiresAt: request.expiresAt,
            requestId: request.requestId,
          });

        const connectorURI = request.connectorURI;
        const codeExpiresAt = request.expiresAt;
        setState((prev) => {
          if (
            prev.connectorURI === connectorURI &&
            prev.codeExpiresAt === codeExpiresAt
          ) {
            return prev;
          }
          return { ...prev, connectorURI, codeExpiresAt };
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

          const nextStatus = await pollOnceWithRetry(() => request.pollOnce(), {
            interval: pollInterval,
            signal: controller.signal,
            startedAt,
            timeout,
          });
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
    connectorURI: state.connectorURI,
    codeExpiresAt: state.codeExpiresAt,
    result: state.result,
    errorCode: state.errorCode,
    getDebugReport,
    isOpen: state.isOpen,
    isInWorldApp,
  };
}
