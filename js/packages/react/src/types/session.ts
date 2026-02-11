import type {
  Preset,
  IDKitResultSession,
  IDKitSessionConfig,
} from "@worldcoin/idkit-core";
import type { IDKitHookResult, PollingConfig } from "./common";

export type IDKitSessionHookConfig = IDKitSessionConfig &
  PollingConfig & {
    // TODO: Reintroduce `constraints` once core JS re-exposes
    // IDKitBuilder.constraints().
    preset: Preset;
    existing_session_id?: string;
  };

export type UseIDKitSessionHookResult = IDKitHookResult<IDKitResultSession>;
