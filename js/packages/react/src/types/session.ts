import type {
  Preset,
  ConstraintNode,
  IDKitResultSession,
  IDKitSessionConfig,
} from "@worldcoin/idkit-core";
import type { IDKitHookResult, PollingConfig } from "./common";

export type IDKitSessionHookConfig = IDKitSessionConfig &
  PollingConfig & {
    existing_session_id?: string;
  } & (
    | { preset: Preset; constraints?: never }
    | { constraints: ConstraintNode; preset?: never }
  );

export type UseIDKitSessionHookResult = IDKitHookResult<IDKitResultSession>;
