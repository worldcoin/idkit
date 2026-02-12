import { useCallback, useEffect, useRef, useState } from "react";
import { IDKit, IDKitErrorCodes, type IDKitRequest } from "@worldcoin/idkit-core";
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
  const [state, setState] = useState<HookState<TResult>>(createInitialHookState);
  // Mutable handle so event handlers (reset/setOpen) can cancel the active polling loop.
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
  }, []);

  const setOpen = useCallback((open: boolean) => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setState(createInitialHookState);
      return;
    }

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

  const open = useCallback(() => {
    setOpen(true);
  }, [setOpen]);

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
        await IDKit.init();
        ensureNotAborted(controller.signal);

        const request = await createFlowHandleRef.current();
        ensureNotAborted(controller.signal);

        setState((prev) => {
          if (prev.connectorURI === request.connectorURI) {
            return prev;
          }
          return { ...prev, connectorURI: request.connectorURI };
        });

        const pollInterval = configRef.current.pollInterval ?? 1000;
        const timeout = configRef.current.timeout ?? 300000;
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
          return;
        }

        setFailed(toErrorCode(error));
      }
    })();

    return () => {
      controller.abort();
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    };
  }, [state.isOpen]);

  return {
    open,
    reset,
    status: state.status,
    connectorURI: state.connectorURI,
    result: state.result,
    errorCode: state.errorCode,
    isOpen: state.isOpen,
    setOpen,
  };
}
