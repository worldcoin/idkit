export type IDKitFlowStatus =
  | "idle"
  | "preparing"
  | "waiting_for_connection"
  | "awaiting_confirmation"
  | "confirmed"
  | "failed";

export type PollingConfig = {
  pollInterval?: number;
  timeout?: number;
};

export type IDKitFlowResult<TResult> = {
  open: () => void;
  reset: () => void;
  status: IDKitFlowStatus;
  connectorURI: string | null;
  result: TResult | null;
  error: Error | null;
  isOpen: boolean;
  setOpen: (open: boolean) => void;
};
