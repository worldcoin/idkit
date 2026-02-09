import type {
  IDKitResultSession,
  IDKitSessionConfig,
} from "@worldcoin/idkit-core";
import type {
  ConstraintOrPreset,
  IDKitFlowResult,
  PollingConfig,
} from "./common";

export type IDKitSessionFlowConfig = IDKitSessionConfig &
  ConstraintOrPreset &
  PollingConfig & {
    existing_session_id?: string;
  };

export type UseIDKitSessionResult = IDKitFlowResult<IDKitResultSession>;
