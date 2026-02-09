import { runSessionFlow } from "../core/engine";
import type { IDKitSessionFlowConfig, UseIDKitSessionResult } from "../types";
import { useIDKitFlow } from "./useIDKitFlow";

export function useIDKitSession(
  config: IDKitSessionFlowConfig,
): UseIDKitSessionResult {
  return useIDKitFlow(config, runSessionFlow);
}
