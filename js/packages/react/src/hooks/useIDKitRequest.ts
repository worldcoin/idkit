import { useCallback, useEffect, useRef, useState } from "react";
import {
  IDKit,
  IDKitErrorCodes,
  type IDKitResult,
} from "@worldcoin/idkit-core";
import type {
  IDKitRequestHookConfig,
  UseIDKitRequestHookResult,
} from "../types";
import {
  createInitialHookState,
  delay,
  ensureNotAborted,
  toErrorCode,
  type HookState,
} from "./common";

type RequestHookState = HookState<IDKitResult>;

function createInitialState(): RequestHookState {
  return createInitialHookState();
}

export function useIDKitRequest(
  config: IDKitRequestHookConfig,
): UseIDKitRequestHookResult {
  const [state, setState] = useState<RequestHookState>(createInitialState);
  const configRef = useRef(config);
  const abortRef = useRef<AbortController | null>(null);

  // Keep the latest config without restarting an active verification run.
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(createInitialState);
  }, []);

  const setOpen = useCallback((open: boolean) => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setState(createInitialState);
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
        const currentConfig = configRef.current;
        await IDKit.init();
        ensureNotAborted(controller.signal);

        const request = await IDKit.request({
          app_id: currentConfig.app_id,
          action: currentConfig.action,
          rp_context: currentConfig.rp_context,
          action_description: currentConfig.action_description,
          bridge_url: currentConfig.bridge_url,
          allow_legacy_proofs: currentConfig.allow_legacy_proofs,
          override_connect_base_url: currentConfig.override_connect_base_url,
          environment: currentConfig.environment,
        }).preset(currentConfig.preset);
        ensureNotAborted(controller.signal);

        setState((prev) => {
          if (prev.connectorURI === request.connectorURI) {
            return prev;
          }
          return { ...prev, connectorURI: request.connectorURI };
        });

        const pollInterval = currentConfig.pollInterval ?? 1000;
        const timeout = currentConfig.timeout ?? 300000;
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
              result: confirmedResult,
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
