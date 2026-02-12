import type { IDKitErrorCodes, Preset } from "@worldcoin/idkit-core";

export type PollingConfig = {
  polling?: {
    interval?: number;
    timeout?: number;
  };
};

export type FlowConfig = PollingConfig & { preset: Preset };

export type IDKitHookResult<TResult> = {
  open: () => void;
  reset: () => void;
  isPending: boolean;
  isSuccess: boolean;
  isError: boolean;
  connectorURI: string | null;
  result: TResult | null;
  errorCode: IDKitErrorCodes | null;
  isOpen: boolean;
};
