import { describe, expect, test, vi } from "vitest";

import { handlePopupBatchExportRequest } from "../../../extension/background/batch";
import {
  CONTENT_GET_CACHED_CONVERSATION_MESSAGE,
  CONTENT_SCAN_MESSAGE,
  type CachedConversationResult,
  type RuntimeResponse,
  type ScanSummary
} from "../../../src/core/messages";
import type { ConversationExport } from "../../../src/core/schema";

const failedScanResponse: RuntimeResponse<ScanSummary> = {
  error: {
    code: "no_messages_found",
    message: "No messages were found on this page."
  },
  ok: false
};

describe("batch export background flow", () => {
  test("uses only pre-approved permissions and preserves selected batch formats", async () => {
    const requestPermission = vi.fn(
      (_permissions: chrome.permissions.Permissions, callback: (granted: boolean) => void) =>
        callback(true)
    );
    const cachedResponse: RuntimeResponse<CachedConversationResult> = {
      ok: true,
      value: {
        conversation: makeConversation(),
        hasConversation: true,
        scanId: "scan-batch"
      }
    };
    const sendMessage = vi.fn(async (_tabId: number, request: { readonly type: string }) => {
      if (request.type === CONTENT_SCAN_MESSAGE) {
        return {
          ok: true,
          value: makeScanSummary()
        } satisfies RuntimeResponse<ScanSummary>;
      }

      return cachedResponse;
    });

    vi.stubGlobal("chrome", {
      permissions: {
        contains: vi.fn((_permissions, callback: (granted: boolean) => void) => callback(true)),
        request: requestPermission
      },
      scripting: {
        executeScript: vi.fn(async () => [])
      },
      tabs: {
        query: vi.fn(async () => [
          {
            id: 10,
            title: "HTML chat",
            url: "https://chatgpt.com/c/html"
          }
        ]),
        sendMessage
      }
    });

    const response = await handlePopupBatchExportRequest({
      options: { formats: ["html", "txt"] },
      tabIds: [10],
      type: "jelluvi/export-open-chat-tabs"
    });

    const cacheRequest = sendMessage.mock.calls.find(
      ([, request]) =>
        (request as { readonly type: string }).type === CONTENT_GET_CACHED_CONVERSATION_MESSAGE
    )?.[1] as { readonly scanId?: string } | undefined;

    expect(requestPermission).not.toHaveBeenCalled();
    expect(cacheRequest?.scanId).toBe("scan-batch");
    expect(response.results[0]).toMatchObject({
      files: [{ format: "html" }, { format: "txt" }],
      messageCount: 2,
      status: "success"
    });
    expect(response.zipFile?.format).toBe("zip");
    expect(response.zipFilename).toMatch(/jelluvi-\d{4}-\d{2}-\d{2}\.zip/u);
  });

  test("fails before scanning when selected tab host access was not pre-approved", async () => {
    const requestPermission = vi.fn(
      (_permissions: chrome.permissions.Permissions, callback: (granted: boolean) => void) =>
        callback(true)
    );
    const sendMessage = vi.fn();

    vi.stubGlobal("chrome", {
      permissions: {
        contains: vi.fn(
          (permissions: chrome.permissions.Permissions, callback: (granted: boolean) => void) =>
            callback(permissions.permissions?.includes("tabs") === true)
        ),
        request: requestPermission
      },
      scripting: {
        executeScript: vi.fn(async () => [])
      },
      tabs: {
        query: vi.fn(async () => [
          {
            id: 10,
            title: "Needs host access",
            url: "https://chatgpt.com/c/no-host"
          }
        ]),
        sendMessage
      }
    });

    await expect(
      handlePopupBatchExportRequest({
        options: { formats: ["md"] },
        tabIds: [10],
        type: "jelluvi/export-open-chat-tabs"
      })
    ).rejects.toMatchObject({
      code: "unsupported_platform",
      message: expect.stringContaining("Approve site access")
    });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

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
      type: "jelluvi/export-open-chat-tabs"
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

  test("does not return a downloadable ZIP when the post-scan snapshot is stale", async () => {
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
            title: "Stale chat",
            url: "https://chatgpt.com/c/stale"
          }
        ]),
        sendMessage: vi.fn(async (_tabId: number, request: { readonly type: string }) => {
          if (request.type === CONTENT_SCAN_MESSAGE) {
            return {
              ok: true,
              value: makeScanSummary()
            } satisfies RuntimeResponse<ScanSummary>;
          }

          return {
            ok: true,
            value: { hasConversation: false, reason: "stale" }
          } satisfies RuntimeResponse<CachedConversationResult>;
        })
      }
    });

    const response = await handlePopupBatchExportRequest({
      options: { formats: ["md"] },
      tabIds: [10],
      type: "jelluvi/export-open-chat-tabs"
    });

    expect(response.zipFile).toBeUndefined();
    expect(response.zipFilename).toBeUndefined();
    expect(response.results).toEqual([
      {
        error: "The conversation changed. Refresh it before exporting.",
        platform: "chatgpt",
        status: "failed",
        tabId: 10,
        title: "Stale chat",
        url: "https://chatgpt.com/c/stale",
        warnings: []
      }
    ]);
  });
});

function makeScanSummary(): ScanSummary {
  return {
    completeness: {
      duplicateCount: 0,
      messageCount: 2,
      platformWarnings: [],
      reachedBottom: true,
      reachedTop: true,
      scrollSteps: 1,
      status: "complete",
      warnings: []
    },
    messageCount: 2,
    platformLabel: "ChatGPT",
    scanId: "scan-batch",
    sourceUrl: "https://chatgpt.com/c/html"
  };
}

function makeConversation(): ConversationExport {
  return {
    schemaVersion: "1.0",
    platform: "chatgpt",
    platformLabel: "ChatGPT",
    sourceUrl: "https://chatgpt.com/c/html",
    title: "HTML chat",
    exportedAt: "2026-07-18T10:00:00.000Z",
    messageCount: 2,
    completeness: {
      duplicateCount: 0,
      messageCount: 2,
      platformWarnings: [],
      reachedBottom: true,
      reachedTop: true,
      scrollSteps: 1,
      status: "complete",
      warnings: []
    },
    messages: [
      {
        authorLabel: "User",
        codeBlocks: [],
        id: "user-1",
        images: [],
        index: 0,
        metadata: {},
        role: "user",
        text: "Create a local export."
      },
      {
        authorLabel: "ChatGPT",
        codeBlocks: [],
        id: "assistant-1",
        images: [],
        index: 1,
        metadata: {},
        role: "assistant",
        text: "The export is ready."
      }
    ]
  };
}
