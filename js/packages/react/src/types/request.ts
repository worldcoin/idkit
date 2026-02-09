import type { IDKitRequestConfig, IDKitResult } from "@worldcoin/idkit-core";
import type {
  ConstraintOrPreset,
  IDKitFlowResult,
  PollingConfig,
} from "./common";

export type IDKitRequestFlowConfig = IDKitRequestConfig &
  ConstraintOrPreset &
  PollingConfig;

export type UseIDKitRequestResult = IDKitFlowResult<IDKitResult>;
