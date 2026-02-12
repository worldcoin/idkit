import {
  IDKit,
  IDKitErrorCodes,
  type IDKitResultSession,
} from "@worldcoin/idkit-core";
import type {
  IDKitSessionHookConfig,
  UseIDKitSessionHookResult,
} from "../types";
import { useIDKitFlow } from "./useIDKitFlow";

function assertSessionId(sessionId: string | undefined): string | undefined {
  if (sessionId === undefined) {
    return undefined;
  }

  if (sessionId.trim().length === 0) {
    throw IDKitErrorCodes.MalformedRequest;
  }

  return sessionId;
}

export function useIDKitSession(
  config: IDKitSessionHookConfig,
): UseIDKitSessionHookResult {
  return useIDKitFlow<IDKitResultSession>(() => {
    const existingSessionId = assertSessionId(config.existing_session_id);
    const builder = existingSessionId
      ? IDKit.proveSession(existingSessionId, {
          app_id: config.app_id,
          rp_context: config.rp_context,
          action_description: config.action_description,
          bridge_url: config.bridge_url,
          override_connect_base_url: config.override_connect_base_url,
          environment: config.environment,
        })
      : IDKit.createSession({
          app_id: config.app_id,
          rp_context: config.rp_context,
          action_description: config.action_description,
          bridge_url: config.bridge_url,
          override_connect_base_url: config.override_connect_base_url,
          environment: config.environment,
        });
    return builder.preset(config.preset);
  }, config);
}
