import type {
  IDKitInviteCodeRequestHookConfig,
  IDKitRequestHookConfig,
} from "./request";
import type { IDKitSessionHookConfig } from "./session";
import type {
  IDKitDebugReport,
  IDKitErrorCodes,
  IDKitResult,
  IDKitResultSession,
} from "@worldcoin/idkit-core";
import type { SupportedLanguage } from "../lang/types";

type MaybePromise<T> = Promise<T> | T;

type WidgetSharedProps<TResult> = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  handleVerify?: (result: TResult) => MaybePromise<void>;
  onSuccess: (result: TResult) => MaybePromise<void>;
  onError?: (
    errorCode: IDKitErrorCodes,
    debugReport?: IDKitDebugReport,
  ) => MaybePromise<void>;
  autoClose?: boolean;
  language?: SupportedLanguage;
};

export type IDKitRequestWidgetProps = IDKitRequestHookConfig &
  WidgetSharedProps<IDKitResult>;

export type IDKitInviteCodeRequestWidgetProps =
  IDKitInviteCodeRequestHookConfig & WidgetSharedProps<IDKitResult>;

export type IDKitSessionWidgetProps = IDKitSessionHookConfig &
  WidgetSharedProps<IDKitResultSession>;
