import type { IDKitRequestFlowConfig } from "./request";
import type { IDKitSessionFlowConfig } from "./session";
import type { IDKitFlowStatus } from "./common";
import type { IDKitResult, IDKitResultSession } from "@worldcoin/idkit-core";
import type { SupportedLanguage } from "../lang/types";

type MaybePromise<T> = Promise<T> | T;

type WidgetSharedProps<TResult> = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (result: TResult) => MaybePromise<void>;
  onError?: (error: Error) => MaybePromise<void>;
  onStatusChange?: (status: IDKitFlowStatus) => void;
  shadowRoot?: boolean;
  autoClose?: boolean;
  language?: SupportedLanguage;
};

export type IDKitRequestWidgetProps = IDKitRequestFlowConfig &
  WidgetSharedProps<IDKitResult>;

export type IDKitSessionWidgetProps = IDKitSessionFlowConfig &
  WidgetSharedProps<IDKitResultSession>;
