import { describe, expect, test, vi } from "vitest";

import { handlePopupBatchExportRequest } from "../../../extension/background/batch";
import {
  CONTENT_EXPORT_MESSAGE,
  CONTENT_SCAN_MESSAGE,
  type ContentExportSuccess,
  type RuntimeResponse,
  type ScanSummary
} from "../../../src/core/messages";

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
    const exportResponse: RuntimeResponse<ContentExportSuccess> = {
      ok: true,
      value: {
        downloaded: [],
        exportedMessageCount: 2,
        files: [
          {
            bytes: "<!doctype html><title>Chat</title>",
            encoding: "utf-8",
            filename: "chat.html",
            format: "html",
            mimeType: "text/html;charset=utf-8"
          },
          {
            bytes: "Chat text",
            encoding: "utf-8",
            filename: "chat.txt",
            format: "txt",
            mimeType: "text/plain;charset=utf-8"
          }
        ],
        messageCount: 2,
        warnings: []
      }
    };
    const sendMessage = vi.fn(async (_tabId: number, request: { readonly type: string }) => {
      if (request.type === CONTENT_SCAN_MESSAGE) {
        return {
          ok: true,
          value: makeScanSummary()
        } satisfies RuntimeResponse<ScanSummary>;
      }

      return exportResponse;
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
      type: "logthread/export-open-chat-tabs"
    });

    const exportRequest = sendMessage.mock.calls.find(
      ([, request]) => (request as { readonly type: string }).type === CONTENT_EXPORT_MESSAGE
    )?.[1] as { readonly options: { readonly formats: readonly string[] } } | undefined;

    expect(requestPermission).not.toHaveBeenCalled();
    expect(exportRequest?.options.formats).toEqual(["html", "txt"]);
    expect(response.zipFile?.format).toBe("zip");
    expect(response.zipFilename).toMatch(/ai-chat-export-\d{4}-\d{2}-\d{2}\.zip/u);
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
        type: "logthread/export-open-chat-tabs"
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
      type: "logthread/export-open-chat-tabs"
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

  test("does not return a downloadable ZIP when selected tabs produce no files", async () => {
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
            title: "Empty files chat",
            url: "https://chatgpt.com/c/empty"
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
            value: {
              downloaded: [],
              exportedMessageCount: 2,
              files: [],
              messageCount: 2,
              warnings: []
            }
          } satisfies RuntimeResponse<ContentExportSuccess>;
        })
      }
    });

    const response = await handlePopupBatchExportRequest({
      options: { formats: ["png"] },
      tabIds: [10],
      type: "logthread/export-open-chat-tabs"
    });

    expect(response.zipFile).toBeUndefined();
    expect(response.zipFilename).toBeUndefined();
    expect(response.results).toMatchObject([
      {
        files: [],
        platform: "chatgpt",
        status: "success",
        tabId: 10,
        title: "Empty files chat",
        url: "https://chatgpt.com/c/empty"
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
    previewMessages: [],
    selectedMessageCount: 0,
    sourceUrl: "https://chatgpt.com/c/html",
    title: "HTML chat"
  };
}
