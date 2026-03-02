export { useIDKitRequest } from "./hooks/useIDKitRequest";
// TODO: Re-enable when World ID 4.0 is live
// export { useIDKitSession } from "./hooks/useIDKitSession";

export { IDKitRequestWidget } from "./widget/IDKitRequestWidget";
// TODO: Re-enable when World ID 4.0 is live
// export { IDKitSessionWidget } from "./widget/IDKitSessionWidget";
export type { IDKitHookResult, PollingConfig } from "./types/common";
export type {
  IDKitRequestHookConfig,
  UseIDKitRequestHookResult,
} from "./types/request";
// TODO: Re-enable when World ID 4.0 is live
// export type {
//   IDKitSessionHookConfig,
//   UseIDKitSessionHookResult,
// } from "./types/session";
export type {
  IDKitRequestWidgetProps,
  // TODO: Re-enable when World ID 4.0 is live
  // IDKitSessionWidgetProps,
} from "./types/widget";

export type { SupportedLanguage } from "./lang/types";

export {
  IDKit,
  // TODO: Re-enable when World ID 4.0 is live
  // CredentialRequest,
  // any,
  // all,
  // enumerate,
  orbLegacy,
  documentLegacy,
  secureDocumentLegacy,
  deviceLegacy,
  selfieCheckLegacy,
  IDKitErrorCodes,
  signRequest,
} from "@worldcoin/idkit-core";

export type {
  RpContext,
  Preset,
  ConstraintNode,
  IDKitResult,
  // TODO: Re-enable when World ID 4.0 is live
  // IDKitResultSession,
  IDKitRequestConfig,
  // TODO: Re-enable when World ID 4.0 is live
  // IDKitSessionConfig,
  CredentialType,
  // TODO: Re-enable when World ID 4.0 is live
  // CredentialRequestType,
  ResponseItemV3,
  ResponseItemV4,
  // TODO: Re-enable when World ID 4.0 is live
  // ResponseItemSession,
  IDKitErrorCode,
} from "@worldcoin/idkit-core";
