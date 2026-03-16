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
  isAwaitingUserConnection: boolean;
  isAwaitingUserConfirmation: boolean;
  isSuccess: boolean;
  isError: boolean;
  connectorURI: string | null;
  result: TResult | null;
  errorCode: IDKitErrorCodes | null;
  isOpen: boolean;
  /** Use `isInWorldApp` to determine if the widget is running inside the World App (mini app context). */
  isInWorldApp: boolean;
};
