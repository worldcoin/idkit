import type {
  IDKitDebugReport,
  IDKitErrorCodes,
  Preset,
  ConstraintNode,
} from "@worldcoin/idkit-core";

export type PollingConfig = {
  polling?: {
    interval?: number;
    timeout?: number;
  };
};

export type FlowConfig = PollingConfig &
  (
    | { preset: Preset; constraints?: never }
    | { constraints: ConstraintNode; preset?: never }
  );

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
  /** Reads the debug report for the active request, when debug mode is on. */
  getDebugReport: () => IDKitDebugReport | undefined;
  isOpen: boolean;
  /** Use `isInWorldApp` to determine if the widget is running inside the World App (mini app context). */
  isInWorldApp: boolean;
};

export type IDKitInviteCodeHookResult<TResult> = {
  open: () => void;
  reset: () => void;
  isAwaitingUserConnection: boolean;
  isAwaitingUserConfirmation: boolean;
  isSuccess: boolean;
  isError: boolean;
  /** URL to display to the user (same shape as URL/QR mode's `connectorURI`, with `&c=<code>&a=<app_id>` appended for the `world.org/verify` landing page). */
  connectorURI: string | null;
  /** Unix-seconds expiry of the unredeemed code. */
  codeExpiresAt: number | null;
  result: TResult | null;
  errorCode: IDKitErrorCodes | null;
  /** Reads the debug report for the active request, when debug mode is on. */
  getDebugReport: () => IDKitDebugReport | undefined;
  isOpen: boolean;
  /** Use `isInWorldApp` to determine if the widget is running inside the World App (mini app context). */
  isInWorldApp: boolean;
};
