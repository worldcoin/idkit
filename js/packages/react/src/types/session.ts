import type {
  ConstraintNode,
  IDKitResultSession,
  IDKitSessionConfig,
} from "@worldcoin/idkit-core";
import type { IDKitHookResult, PollingConfig } from "./common";

export type IDKitSessionHookConfig = IDKitSessionConfig &
  PollingConfig & {
    constraints: ConstraintNode;
    existing_session_id?: string;
  };

export type UseIDKitSessionHookResult = IDKitHookResult<IDKitResultSession>;
