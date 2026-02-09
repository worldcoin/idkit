import type { ConstraintNode, Preset } from "@worldcoin/idkit-core";

export type IDKitFlowStatus =
  | "idle"
  | "preparing"
  | "awaiting_connection"
  | "awaiting_confirmation"
  | "confirmed"
  | "failed";

export type PollingConfig = {
  pollInterval?: number;
  timeout?: number;
};

export type ConstraintOrPreset =
  | {
      preset: Preset;
      constraints?: never;
    }
  | {
      constraints: ConstraintNode;
      preset?: never;
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
