import type { IDKitRequestHookConfig } from "./request";
import type { IDKitSessionHookConfig } from "./session";
import type { IDKitHookStatus } from "./common";
import type {
  IDKitErrorCodes,
  IDKitResult,
  IDKitResultSession,
} from "@worldcoin/idkit-core";
import type { SupportedLanguage } from "../lang/types";

type MaybePromise<T> = Promise<T> | T;

type WidgetSharedProps<TResult> = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (result: TResult) => MaybePromise<void>;
  onError?: (errorCode: IDKitErrorCodes) => MaybePromise<void>;
  onStatusChange?: (status: IDKitHookStatus) => void;
  shadowRoot?: boolean;
  autoClose?: boolean;
  language?: SupportedLanguage;
};

export type IDKitRequestWidgetProps = IDKitRequestHookConfig &
  WidgetSharedProps<IDKitResult>;

export type IDKitSessionWidgetProps = IDKitSessionHookConfig &
  WidgetSharedProps<IDKitResultSession>;
