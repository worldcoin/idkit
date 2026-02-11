import type {
  IDKitRequestConfig,
  IDKitResult,
  Preset,
} from "@worldcoin/idkit-core";
import type { IDKitFlowResult, PollingConfig } from "./common";

export type IDKitRequestFlowConfig = IDKitRequestConfig &
  PollingConfig & {
    // TODO: Reintroduce `constraints` once core JS re-exposes
    // IDKitBuilder.constraints().
    preset: Preset;
  };

export type UseIDKitRequestResult = IDKitFlowResult<IDKitResult>;
