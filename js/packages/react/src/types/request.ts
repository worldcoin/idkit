import type {
  IDKitRequestConfig,
  IDKitResult,
  Preset,
  ConstraintNode,
} from "@worldcoin/idkit-core";
import type {
  IDKitHookResult,
  IDKitInviteCodeHookResult,
  PollingConfig,
} from "./common";

export type IDKitRequestHookConfig = IDKitRequestConfig &
  PollingConfig &
  (
    | { preset: Preset; constraints?: never }
    | { constraints: ConstraintNode; preset?: never }
  );

export type UseIDKitRequestHookResult = IDKitHookResult<IDKitResult>;

export type IDKitInviteCodeRequestHookConfig = IDKitRequestConfig &
  PollingConfig &
  (
    | { preset: Preset; constraints?: never }
    | { constraints: ConstraintNode; preset?: never }
  );

export type UseIDKitInviteCodeRequestHookResult =
  IDKitInviteCodeHookResult<IDKitResult>;
