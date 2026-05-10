import type { IDKitErrorCodes } from "@worldcoin/idkit-core";

type IDKitHookStatus =
  | "idle"
  | "waiting_for_connection"
  | "awaiting_confirmation"
  | "confirmed"
  | "failed";

export type InviteCodeHookState<TResult> = {
  isOpen: boolean;
  status: IDKitHookStatus;
  connectorURI: string | null;
  codeExpiresAt: number | null;
  result: TResult | null;
  errorCode: IDKitErrorCodes | null;
};

export function createInitialInviteCodeHookState<
  TResult,
>(): InviteCodeHookState<TResult> {
  return {
    isOpen: false,
    status: "idle",
    connectorURI: null,
    codeExpiresAt: null,
    result: null,
    errorCode: null,
  };
}
