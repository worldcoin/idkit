import type { IDKitFlowStatus } from "../types";

export type CorePollStatusType =
  | "waiting_for_connection"
  | "awaiting_confirmation"
  | "confirmed"
  | "failed";

export function mapCorePollStatus(status: CorePollStatusType): IDKitFlowStatus {
  switch (status) {
    case "waiting_for_connection":
      return "awaiting_connection";
    case "awaiting_confirmation":
      return "awaiting_confirmation";
    case "confirmed":
      return "confirmed";
    case "failed":
      return "failed";
    default: {
      const exhaustive: never = status;
      throw new Error(`Unsupported status: ${String(exhaustive)}`);
    }
  }
}
