import type {
  Preset,
  IDKitResultSession,
  IDKitSessionConfig,
} from "@worldcoin/idkit-core";
import type { IDKitFlowResult, PollingConfig } from "./common";

export type IDKitSessionFlowConfig = IDKitSessionConfig &
  PollingConfig & {
    // TODO: Reintroduce `constraints` once core JS re-exposes
    // IDKitBuilder.constraints().
    preset: Preset;
    existing_session_id?: string;
  };

export type UseIDKitSessionResult = IDKitFlowResult<IDKitResultSession>;
