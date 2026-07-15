import { type IDKitResult } from "@worldcoin/idkit-core";
import { IDKit } from "../idkit";
import type {
  IDKitInviteCodeRequestHookConfig,
  UseIDKitInviteCodeRequestHookResult,
} from "../types";
import { useIDKitInviteCodeFlow } from "./useIDKitInviteCodeFlow";

export function useIDKitInviteCodeRequest(
  config: IDKitInviteCodeRequestHookConfig,
): UseIDKitInviteCodeRequestHookResult {
  return useIDKitInviteCodeFlow<IDKitResult>(() => {
    const builder = IDKit.requestWithInviteCode({
      app_id: config.app_id,
      action: config.action,
      rp_context: config.rp_context,
      action_description: config.action_description,
      bridge_url: config.bridge_url,
      return_to: config.return_to,
      allow_legacy_proofs: config.allow_legacy_proofs,
      require_user_presence: config.require_user_presence ?? false,
      override_connect_base_url: config.override_connect_base_url,
      environment: config.environment,
    });
    if ("constraints" in config && config.constraints) {
      return builder.constraints(config.constraints);
    }
    return builder.preset(config.preset!);
  }, config);
}
