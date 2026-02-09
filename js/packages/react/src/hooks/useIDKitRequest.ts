import { runRequestFlow } from "../core/engine";
import type { IDKitRequestFlowConfig, UseIDKitRequestResult } from "../types";
import { useIDKitFlow } from "./useIDKitFlow";

export function useIDKitRequest(
  config: IDKitRequestFlowConfig,
): UseIDKitRequestResult {
  return useIDKitFlow(config, runRequestFlow);
}
