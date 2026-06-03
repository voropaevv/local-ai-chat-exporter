import { describe, expect, test, vi } from "vitest";

import { handlePopupBatchExportRequest } from "../../../extension/background/batch";
import type { RuntimeResponse, ScanSummary } from "../../../src/core/messages";

const failedScanResponse: RuntimeResponse<ScanSummary> = {
  error: {
    code: "no_messages_found",
    message: "No messages were found on this page."
  },
  ok: false
};

describe("batch export background flow", () => {
  test("does not return a downloadable ZIP when all selected tabs fail", async () => {
    vi.stubGlobal("chrome", {
      permissions: {
        contains: vi.fn((_permissions, callback: (granted: boolean) => void) => callback(true)),
        request: vi.fn((_permissions, callback: (granted: boolean) => void) => callback(true))
      },
      scripting: {
        executeScript: vi.fn(async () => [])
      },
      tabs: {
        query: vi.fn(async () => [
          {
            id: 10,
            title: "Broken chat",
            url: "https://chatgpt.com/c/broken"
          }
        ]),
        sendMessage: vi.fn(async () => failedScanResponse)
      }
    });

    const response = await handlePopupBatchExportRequest({
      options: { formats: ["md", "json"] },
      tabIds: [10],
      type: "local-ai-chat-exporter/export-open-chat-tabs"
    });

    expect(response.zipFile).toBeUndefined();
    expect(response.zipFilename).toBeUndefined();
    expect(response.results).toEqual([
      {
        error: "No messages were found on this page.",
        platform: "chatgpt",
        status: "failed",
        tabId: 10,
        title: "Broken chat",
        url: "https://chatgpt.com/c/broken",
        warnings: []
      }
    ]);
  });
});
