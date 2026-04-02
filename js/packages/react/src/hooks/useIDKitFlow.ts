import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IDKitErrorCodes,
  isInWorldApp as isInWorldAppCheck,
  isDebug,
  type IDKitRequest,
} from "@worldcoin/idkit-core";
import type { FlowConfig, IDKitHookResult } from "../types";
import {
  createInitialHookState,
  delay,
  ensureNotAborted,
  toErrorCode,
  type HookState,
} from "./common";

export function useIDKitFlow<TResult>(
  createFlowHandle: () => Promise<IDKitRequest>,
  config: FlowConfig,
): IDKitHookResult<TResult> {
  const isInWorldApp = useMemo(() => isInWorldAppCheck(), []);

  const [state, setState] = useState<HookState<TResult>>(
    createInitialHookState,
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
    setState(createInitialHookState);
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
        connectorURI: null,
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
        if (isDebug()) console.debug("[IDKit] Creating flow handle…");
        const request = await createFlowHandleRef.current();
        ensureNotAborted(controller.signal);
        if (isDebug())
          console.debug("[IDKit] Flow created", {
            connectorURI: request.connectorURI,
            requestId: request.requestId,
          });

        const connectorURI = isInWorldApp ? null : request.connectorURI;
        setState((prev) => {
          if (prev.connectorURI === connectorURI) {
            return prev;
          }
          return { ...prev, connectorURI };
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
              console.warn("[IDKit] Poll returned failed", nextStatus);
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
          if (isDebug()) console.debug("[IDKit] Flow aborted");
          return;
        }

        if (isDebug()) console.error("[IDKit] Flow error:", error);
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
    result: state.result,
    errorCode: state.errorCode,
    isOpen: state.isOpen,
    isInWorldApp,
  };
}
