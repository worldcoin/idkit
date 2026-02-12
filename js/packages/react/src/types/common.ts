import type { IDKitErrorCodes, Preset } from "@worldcoin/idkit-core";

export type FlowConfig = {
  polling?: {
    interval?: number;
    timeout?: number;
  };
} & {
  // TODO: Reintroduce `constraints` once core JS re-exposes
  // IDKitBuilder.constraints().
  preset: Preset;
};

export type IDKitHookResult<TResult> = {
  open: () => void;
  reset: () => void;
  isAwaitingUserConnection: boolean;
  isAwaitingUserConfirmation: boolean;
  isSuccess: boolean;
  isError: boolean;
  connectorURI: string | null;
  result: TResult | null;
  errorCode: IDKitErrorCodes | null;
  isOpen: boolean;
};
