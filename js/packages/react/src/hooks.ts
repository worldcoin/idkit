export { IDKit } from "./idkit";

export { useIDKitRequest } from "./hooks/useIDKitRequest";
export { useIDKitInviteCodeRequest } from "./hooks/useIDKitInviteCodeRequest";
export { useIDKitSession } from "./hooks/useIDKitSession";

export type {
  IDKitHookResult,
  IDKitInviteCodeHookResult,
  PollingConfig,
} from "./types/common";
export type {
  IDKitRequestHookConfig,
  UseIDKitRequestHookResult,
  IDKitInviteCodeRequestHookConfig,
  UseIDKitInviteCodeRequestHookResult,
} from "./types/request";
export type {
  IDKitSessionHookConfig,
  UseIDKitSessionHookResult,
} from "./types/session";

export type { SupportedLanguage } from "./lang/types";

export {
  Nullifier,
  getSessionCommitment,
  CredentialRequest,
  any,
  all,
  enumerate,
  orbLegacy,
  documentLegacy,
  secureDocumentLegacy,
  deviceLegacy,
  selfieCheckLegacy,
  selfieCheck,
  proofOfHuman,
  passport,
  identityCheck,
  mnc,
  IDKitErrorCodes,
  signRequest,
  isDebug,
  setDebug,
  configureIDKitRuntime,
} from "@worldcoin/idkit-core";

export type {
  IDKitRuntimeOptions,
  RequestOptions,
  RpContext,
  Preset,
  ConstraintNode,
  IDKitResult,
  IntegrityBundle,
  IntegritySignatureFormat,
  IDKitDebugReport,
  IDKitResultSession,
  IDKitRequestConfig,
  IDKitSessionConfig,
  CredentialType,
  CredentialRequestType,
  ResponseItemV3,
  ResponseItemV4,
  SelfieCheckResponseItemV4,
  ResponseItemSession,
  SelfieCheckResponseItemSession,
  IDKitErrorCode,
  ProofOfHumanPreset,
  PassportPreset,
  DocumentType,
  IdentityAttribute,
  IdentityCheckPreset,
  MncPreset,
  SelfieCheckPreset,
} from "@worldcoin/idkit-core";
