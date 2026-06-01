import type { ScanCacheSummaryResult, ScanSummary } from "../core/messages";

export function getCachedScanSummary(
  cacheSummary: ScanCacheSummaryResult
): ScanSummary | undefined {
  return cacheSummary.hasCache ? cacheSummary.scan : undefined;
}
