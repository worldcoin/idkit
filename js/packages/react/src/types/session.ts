import type {
  Preset,
  IDKitResultSession,
  IDKitSessionConfig,
} from "@worldcoin/idkit-core";
import type { IDKitHookResult, FlowConfig } from "./common";

export type IDKitSessionHookConfig = IDKitSessionConfig & FlowConfig;

export type UseIDKitSessionHookResult = IDKitHookResult<IDKitResultSession>;
