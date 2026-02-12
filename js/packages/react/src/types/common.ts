import type { IDKitErrorCodes, Preset } from "@worldcoin/idkit-core";

export type IDKitHookStatus =
  | "idle"
  | "waiting_for_connection"
  | "awaiting_confirmation"
  | "confirmed"
  | "failed";

export type PollingConfig = {
  pollInterval?: number;
  timeout?: number;
};

export type FlowConfig = PollingConfig & { preset: Preset };

export type IDKitHookResult<TResult> = {
  open: () => void;
  reset: () => void;
  status: IDKitHookStatus;
  connectorURI: string | null;
  result: TResult | null;
  errorCode: IDKitErrorCodes | null;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
};
