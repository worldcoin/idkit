export { useIDKitRequest } from "./hooks/useIDKitRequest";
export { useIDKitSession } from "./hooks/useIDKitSession";

export type { IDKitHookResult, PollingConfig } from "./types/common";
export type {
  IDKitRequestHookConfig,
  UseIDKitRequestHookResult,
} from "./types/request";
export type {
  IDKitSessionHookConfig,
  UseIDKitSessionHookResult,
} from "./types/session";

export {
  IDKit,
  CredentialRequest,
  any,
  all,
  orbLegacy,
  documentLegacy,
  secureDocumentLegacy,
  IDKitErrorCodes,
} from "@worldcoin/idkit-core";

export type {
  RpContext,
  Preset,
  ConstraintNode,
  IDKitResult,
  IDKitResultSession,
  IDKitRequestConfig,
  IDKitSessionConfig,
  CredentialType,
  CredentialRequestType,
  ResponseItemV3,
  ResponseItemV4,
  ResponseItemSession,
  IDKitErrorCode,
} from "@worldcoin/idkit-core";
