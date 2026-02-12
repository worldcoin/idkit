import type {
  IDKitRequestConfig,
  IDKitResult,
  Preset,
} from "@worldcoin/idkit-core";
import type { IDKitHookResult, PollingConfig } from "./common";

export type IDKitRequestHookConfig = IDKitRequestConfig &
  PollingConfig & {
    // TODO: Reintroduce `constraints` once core JS re-exposes
    // IDKitBuilder.constraints().
    preset: Preset;
  };

export type UseIDKitRequestHookResult = IDKitHookResult<IDKitResult>;
