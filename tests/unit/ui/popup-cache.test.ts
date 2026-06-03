import { describe, expect, test } from "vitest";

import type { ScanCacheSummaryResult } from "../../../src/core/messages";
import { getCachedScanSummary } from "../../../src/ui/popup-cache";

const cachedSummary: ScanCacheSummaryResult = {
  hasCache: true,
  scan: {
    completeness: {
      status: "complete",
      warnings: [],
      messageCount: 2,
      reachedTop: true,
      reachedBottom: true,
      scrollSteps: 1,
      duplicateCount: 0,
      platformWarnings: []
    },
    messageCount: 2,
    platformLabel: "ChatGPT",
    previewMessages: [],
    scanId: "scan-1",
    selectedMessageCount: 0,
    sourceUrl: "https://chatgpt.com/c/cached"
  },
  scanId: "scan-1"
};

describe("popup scan cache hydration", () => {
  test("uses cached scan summary when popup is reopened", () => {
    expect(getCachedScanSummary(cachedSummary)).toEqual(cachedSummary.scan);
  });

  test("leaves popup unscanned when no cache exists", () => {
    expect(getCachedScanSummary({ hasCache: false })).toBeUndefined();
  });
});
