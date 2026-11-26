import type {
  IDKitInviteCodeRequestHookConfig,
  IDKitRequestHookConfig,
} from "./request";
import type { IDKitSessionHookConfig } from "./session";
import type {
  IDKitDebugReport,
  IDKitErrorCodes,
  ErrorReason,
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
    reason?: ErrorReason,
  ) => MaybePromise<void>;
  autoClose?: boolean;
  language?: SupportedLanguage;
};

type ConnectorLinkProps = {
  /**
   * Show the connector URL as a link below the desktop QR code, so the
   * authenticator can be opened in the same browser. Defaults to false.
   */
  showConnectorLink?: boolean;
};

export type IDKitRequestWidgetProps = IDKitRequestHookConfig &
  WidgetSharedProps<IDKitResult> &
  ConnectorLinkProps;

export type IDKitInviteCodeRequestWidgetProps =
  IDKitInviteCodeRequestHookConfig & WidgetSharedProps<IDKitResult>;

export type IDKitSessionWidgetProps = IDKitSessionHookConfig &
  WidgetSharedProps<IDKitResultSession> &
  ConnectorLinkProps;
