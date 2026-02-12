import type {
  IDKitRequestConfig,
  IDKitResult,
  Preset,
} from "@worldcoin/idkit-core";
import type { IDKitHookResult, FlowConfig } from "./common";

export type IDKitRequestHookConfig = IDKitRequestConfig & FlowConfig;

export type UseIDKitRequestHookResult = IDKitHookResult<IDKitResult>;
