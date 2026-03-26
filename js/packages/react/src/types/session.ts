import type {
  ConstraintNode,
  IDKitResultSession,
  IDKitSessionConfig,
} from "@worldcoin/idkit-core";
import type { IDKitHookResult, PollingConfig } from "./common";

export type IDKitSessionHookConfig = IDKitSessionConfig &
  PollingConfig & {
    constraints: ConstraintNode;
    existing_session_id?: `session_${string}`;
  };

export type UseIDKitSessionHookResult = IDKitHookResult<IDKitResultSession>;
