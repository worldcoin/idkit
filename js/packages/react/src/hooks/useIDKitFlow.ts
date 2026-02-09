import { useCallback, useEffect, useRef, useState } from "react";
import type { IDKitFlowResult, IDKitFlowStatus } from "../types";
import { normalizeError } from "../core/errors";

type FlowCallbacks = {
  signal?: AbortSignal;
  onStatusChange?: (status: IDKitFlowStatus) => void;
  onConnectorURI?: (connectorURI: string) => void;
};

type FlowRunner<TConfig, TResult> = (
  config: TConfig,
  options: FlowCallbacks,
) => Promise<TResult>;

type InternalState<TResult> = {
  isOpen: boolean;
  status: IDKitFlowStatus;
  connectorURI: string | null;
  result: TResult | null;
  error: Error | null;
};

function createInitialState<TResult>(): InternalState<TResult> {
  return {
    isOpen: false,
    status: "idle",
    connectorURI: null,
    result: null,
    error: null,
  };
}

export function useIDKitFlow<TConfig, TResult>(
  config: TConfig,
  runner: FlowRunner<TConfig, TResult>,
): IDKitFlowResult<TResult> {
  const [state, setState] = useState<InternalState<TResult>>(
    createInitialState,
  );

  const configRef = useRef(config);
  const abortRef = useRef<AbortController | null>(null);

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

    setState(prev => {
      if (prev.isOpen) {
        return prev;
      }

      return {
        isOpen: true,
        status: "preparing",
        connectorURI: null,
        result: null,
        error: null,
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
    let isActive = true;

    void runner(configRef.current, {
      signal: controller.signal,
      onConnectorURI: connectorURI => {
        if (!isActive) {
          return;
        }

        setState(prev => ({ ...prev, connectorURI }));
      },
      onStatusChange: status => {
        if (!isActive) {
          return;
        }

        setState(prev => ({ ...prev, status }));
      },
    })
      .then(result => {
        if (!isActive || controller.signal.aborted) {
          return;
        }

        setState(prev => ({
          ...prev,
          status: "confirmed",
          result,
          error: null,
        }));
      })
      .catch(error => {
        if (!isActive || controller.signal.aborted) {
          return;
        }

        setState(prev => ({
          ...prev,
          status: "failed",
          error: normalizeError(error),
        }));
      });

    return () => {
      isActive = false;
      controller.abort();
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    };
  }, [runner, state.isOpen]);

  return {
    open,
    reset,
    status: state.status,
    connectorURI: state.connectorURI,
    result: state.result,
    error: state.error,
    isOpen: state.isOpen,
    setOpen,
  };
}
