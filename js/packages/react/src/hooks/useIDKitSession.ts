import { useCallback, useEffect, useRef, useState } from "react";
import {
  IDKit,
  IDKitErrorCodes,
  type IDKitResultSession,
} from "@worldcoin/idkit-core";
import type {
  IDKitSessionHookConfig,
  UseIDKitSessionHookResult,
} from "../types";
import {
  createInitialHookState,
  delay,
  ensureNotAborted,
  toErrorCode,
  type HookState,
} from "./common";

type SessionHookState = HookState<IDKitResultSession>;

function createInitialState(): SessionHookState {
  return createInitialHookState();
}

function assertSessionId(sessionId: string | undefined): string | undefined {
  if (sessionId === undefined) {
    return undefined;
  }

  if (sessionId.trim().length === 0) {
    throw IDKitErrorCodes.MalformedRequest;
  }

  return sessionId;
}

export function useIDKitSession(
  config: IDKitSessionHookConfig,
): UseIDKitSessionHookResult {
  const [state, setState] = useState<SessionHookState>(createInitialState);
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
        const existingSessionId = assertSessionId(
          currentConfig.existing_session_id,
        );

        await IDKit.init();
        ensureNotAborted(controller.signal);

        const builder = existingSessionId
          ? IDKit.proveSession(existingSessionId, {
              app_id: currentConfig.app_id,
              rp_context: currentConfig.rp_context,
              action_description: currentConfig.action_description,
              bridge_url: currentConfig.bridge_url,
              override_connect_base_url: currentConfig.override_connect_base_url,
              environment: currentConfig.environment,
            })
          : IDKit.createSession({
              app_id: currentConfig.app_id,
              rp_context: currentConfig.rp_context,
              action_description: currentConfig.action_description,
              bridge_url: currentConfig.bridge_url,
              override_connect_base_url: currentConfig.override_connect_base_url,
              environment: currentConfig.environment,
            });

        const request = await builder.preset(currentConfig.preset);
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
              result: confirmedResult as IDKitResultSession,
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
