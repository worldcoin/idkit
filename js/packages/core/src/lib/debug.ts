import packageJson from "../../package.json";
import type { IDKitDebugReport } from "../types/result";

let _debug = false;

export function isDebug(): boolean {
  if (_debug) return true;
  return typeof window !== "undefined" && Boolean((window as any).IDKIT_DEBUG);
}

export function setDebug(enabled: boolean): void {
  _debug = enabled;
}

export type DebugReportWithoutVersion = Omit<
  IDKitDebugReport,
  "version" | "package_version"
>;

export function buildDebugReport(
  report: DebugReportWithoutVersion,
): IDKitDebugReport {
  return {
    ...report,
    version: 1,
    package_version: packageJson.version,
  };
}
