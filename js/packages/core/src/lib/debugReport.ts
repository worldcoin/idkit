import packageJson from "../../package.json";
import type { IDKitDebugReport } from "../types/result";
import { isDebug } from "./debug";

export type DebugReportWithoutVersion = Omit<IDKitDebugReport, "package_version">;

export function withPackageVersion(
  report: DebugReportWithoutVersion,
): IDKitDebugReport {
  return {
    ...report,
    package_version: packageJson.version,
  };
}

export function buildDebugReport(
  report: DebugReportWithoutVersion,
): IDKitDebugReport | undefined {
  if (!isDebug()) {
    return undefined;
  }

  return withPackageVersion(report);
}
