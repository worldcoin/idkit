import { IDKit, type IDKitResult } from "@worldcoin/idkit-core";
import type {
  IDKitRequestHookConfig,
  UseIDKitRequestHookResult,
} from "../types";
import { useIDKitFlow } from "./useIDKitFlow";

export function useIDKitRequest(
  config: IDKitRequestHookConfig,
): UseIDKitRequestHookResult {
  return useIDKitFlow<IDKitResult>(
    () =>
      IDKit.request({
        app_id: config.app_id,
        action: config.action,
        rp_context: config.rp_context,
        action_description: config.action_description,
        bridge_url: config.bridge_url,
        allow_legacy_proofs: config.allow_legacy_proofs,
        override_connect_base_url: config.override_connect_base_url,
        environment: config.environment,
      }).preset(config.preset),
    config,
  );
}
