import { describe, expect, test, vi } from "vitest";

import {
  CONTENT_GET_CACHED_CONVERSATION_MESSAGE,
  CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE,
  CONTENT_EXPORT_MESSAGE,
  CONTENT_SCAN_MESSAGE,
  type ScanSummary
} from "../../../src/core/messages";
import type { ConversationExport } from "../../../src/core/schema";
import type { RenderedFile } from "../../../src/renderers";
import { createContentRequestHandler } from "../../../extension/content/request-handler";

function makeConversation(sourceUrl = "https://chatgpt.com/c/cached"): ConversationExport {
  const messages = [
    {
      id: "msg-1",
      index: 0,
      role: "user" as const,
      authorLabel: "User",
      text: "First prompt",
      codeBlocks: [],
      images: [],
      metadata: {}
    },
    {
      id: "msg-2",
      index: 1,
      role: "assistant" as const,
      authorLabel: "ChatGPT",
      text: "Final answer",
      codeBlocks: [],
      images: [],
      metadata: {}
    }
  ];

  return {
    schemaVersion: "1.0",
    platform: "chatgpt",
    platformLabel: "ChatGPT",
    sourceUrl,
    title: "Cached chat",
    exportedAt: "2026-06-01T08:00:00.000Z",
    messageCount: messages.length,
    completeness: {
      status: "complete",
      warnings: [],
      messageCount: messages.length,
      reachedTop: true,
      reachedBottom: true,
      scrollSteps: 1,
      duplicateCount: 0,
      platformWarnings: []
    },
    messages
  };
}

function createHandler(overrides: Partial<Parameters<typeof createContentRequestHandler>[0]> = {}) {
  const copyRenderedFileToClipboard = vi.fn().mockResolvedValue(undefined);
  const scanCurrentConversationExport = vi.fn().mockResolvedValue(makeConversation());
  const renderedConversations: ConversationExport[] = [];
  const handler = createContentRequestHandler({
    copyRenderedFileToClipboard,
    downloadRenderedFiles: vi.fn().mockResolvedValue({ downloaded: [] }),
    getCurrentUrl: () => "https://chatgpt.com/c/cached",
    renderConversationFiles: vi.fn((conversation: ConversationExport) => {
      renderedConversations.push(conversation);
      return [
        {
          bytes: "exported",
          encoding: "utf-8",
          filename: "chat.md",
          format: "md",
          mimeType: "text/markdown"
        }
      ] satisfies readonly RenderedFile[];
    }),
    scanCurrentConversationExport,
    ...overrides
  });

  return {
    copyRenderedFileToClipboard,
    handler,
    renderedConversations,
    scanCurrentConversationExport
  };
}

describe("content request handler scan cache", () => {
  test("scan request calls the scanner once and caches the full conversation", async () => {
    const { handler, scanCurrentConversationExport } = createHandler();

    const summary = await handler({ type: CONTENT_SCAN_MESSAGE });

    expect(summary).toMatchObject({
      messageCount: 2,
      platformLabel: "ChatGPT",
      sourceUrl: "https://chatgpt.com/c/cached"
    });
    expect(scanCurrentConversationExport).toHaveBeenCalledTimes(1);
  });

  test("cache summary request rehydrates popup state without rescanning", async () => {
    const { handler, scanCurrentConversationExport } = createHandler();

    await handler({ type: CONTENT_SCAN_MESSAGE });
    const cacheSummary = await handler({ type: CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE });

    expect(scanCurrentConversationExport).toHaveBeenCalledTimes(1);
    expect(cacheSummary).toMatchObject({
      hasCache: true,
      scan: {
        messageCount: 2,
        platformLabel: "ChatGPT",
        sourceUrl: "https://chatgpt.com/c/cached"
      }
    });
    expect(cacheSummary).toHaveProperty("scanId");
  });

  test("cached conversation request returns the full cached snapshot without rescanning", async () => {
    const { handler, scanCurrentConversationExport } = createHandler();

    const scan = (await handler({ type: CONTENT_SCAN_MESSAGE })) as ScanSummary;
    const cached = await handler({
      scanId: scan.scanId,
      type: CONTENT_GET_CACHED_CONVERSATION_MESSAGE
    });

    expect(scanCurrentConversationExport).toHaveBeenCalledTimes(1);
    expect(cached).toMatchObject({
      conversation: {
        messageCount: 2,
        messages: [{ text: "First prompt" }, { text: "Final answer" }]
      },
      hasConversation: true
    });
  });

  test("cache lookup reports missing cache without scanning", async () => {
    const { handler, scanCurrentConversationExport } = createHandler();

    await expect(handler({ type: CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE })).resolves.toEqual({
      hasCache: false
    });
    await expect(handler({ type: CONTENT_GET_CACHED_CONVERSATION_MESSAGE })).resolves.toEqual({
      hasConversation: false
    });
    expect(scanCurrentConversationExport).not.toHaveBeenCalled();
  });

  test("export after scan renders from the cached snapshot without rescanning", async () => {
    const {
      copyRenderedFileToClipboard,
      handler,
      renderedConversations,
      scanCurrentConversationExport
    } = createHandler();

    await handler({ type: CONTENT_SCAN_MESSAGE });
    await handler({
      copyToClipboard: false,
      delivery: "return_files",
      download: false,
      options: { formats: ["md"] },
      type: CONTENT_EXPORT_MESSAGE
    });

    expect(scanCurrentConversationExport).toHaveBeenCalledTimes(1);
    expect(copyRenderedFileToClipboard).not.toHaveBeenCalled();
    expect(renderedConversations).toHaveLength(1);
    expect(renderedConversations[0].sourceUrl).toBe("https://chatgpt.com/c/cached");
  });

  test("export without a cached scan returns a clear error", async () => {
    const { handler, scanCurrentConversationExport } = createHandler();

    await expect(
      handler({
        copyToClipboard: false,
        delivery: "return_files",
        download: false,
        options: { formats: ["md"] },
        type: CONTENT_EXPORT_MESSAGE
      })
    ).rejects.toMatchObject({
      code: "scan_required",
      message: "Prepare the conversation before exporting."
    });
    expect(scanCurrentConversationExport).not.toHaveBeenCalled();
  });

  test("export rejects a stale cached scan when the page URL changes", async () => {
    let currentUrl = "https://chatgpt.com/c/cached";
    const { handler } = createHandler({
      getCurrentUrl: () => currentUrl
    });

    await handler({ type: CONTENT_SCAN_MESSAGE });
    currentUrl = "https://chatgpt.com/c/changed";

    await expect(
      handler({
        copyToClipboard: false,
        delivery: "return_files",
        download: false,
        options: { formats: ["md"] },
        type: CONTENT_EXPORT_MESSAGE
      })
    ).rejects.toMatchObject({
      code: "scan_stale",
      message: "The conversation changed. Refresh it before exporting."
    });
  });

  test("cache lookup treats URL changes as stale and does not expose the snapshot", async () => {
    let currentUrl = "https://chatgpt.com/c/cached";
    const { handler, scanCurrentConversationExport } = createHandler({
      getCurrentUrl: () => currentUrl
    });

    const scan = (await handler({ type: CONTENT_SCAN_MESSAGE })) as ScanSummary;
    currentUrl = "https://chatgpt.com/c/changed";

    await expect(handler({ type: CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE })).resolves.toEqual({
      hasCache: false,
      reason: "stale"
    });
    await expect(
      handler({
        scanId: scan.scanId,
        type: CONTENT_GET_CACHED_CONVERSATION_MESSAGE
      })
    ).resolves.toEqual({
      hasConversation: false,
      reason: "stale"
    });
    expect(scanCurrentConversationExport).toHaveBeenCalledTimes(1);
  });

  test("invalidates a cached scan when the observed conversation changes on the same URL", async () => {
    let markConversationChanged: (() => void) | undefined;
    const stopObserving = vi.fn();
    const { handler, scanCurrentConversationExport } = createHandler({
      observeConversationChanges: (onChange) => {
        markConversationChanged = onChange;
        return stopObserving;
      }
    });

    await handler({ type: CONTENT_SCAN_MESSAGE });
    markConversationChanged?.();

    await expect(handler({ type: CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE })).resolves.toEqual({
      hasCache: false,
      reason: "stale"
    });
    await expect(
      handler({
        copyToClipboard: false,
        delivery: "return_files",
        download: false,
        options: { formats: ["md"] },
        type: CONTENT_EXPORT_MESSAGE
      })
    ).rejects.toMatchObject({
      code: "scan_stale",
      message: "The conversation changed. Refresh it before exporting."
    });
    expect(scanCurrentConversationExport).toHaveBeenCalledTimes(1);
  });

  test("replaces the conversation observer after a rescan", async () => {
    const stopFirstObserver = vi.fn();
    const stopSecondObserver = vi.fn();
    const observeConversationChanges = vi
      .fn()
      .mockReturnValueOnce(stopFirstObserver)
      .mockReturnValueOnce(stopSecondObserver);
    const { handler } = createHandler({ observeConversationChanges });

    await handler({ type: CONTENT_SCAN_MESSAGE });
    await handler({ type: CONTENT_SCAN_MESSAGE });

    expect(observeConversationChanges).toHaveBeenCalledTimes(2);
    expect(stopFirstObserver).toHaveBeenCalledTimes(1);
    expect(stopSecondObserver).not.toHaveBeenCalled();
  });

  test("does not reuse the previous snapshot when a refresh fails", async () => {
    const scanCurrentConversationExport = vi
      .fn()
      .mockResolvedValueOnce(makeConversation())
      .mockRejectedValueOnce(new Error("Refresh failed"));
    const { handler } = createHandler({ scanCurrentConversationExport });

    await handler({ type: CONTENT_SCAN_MESSAGE });
    await expect(handler({ type: CONTENT_SCAN_MESSAGE })).rejects.toThrow("Refresh failed");
    await expect(handler({ type: CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE })).resolves.toEqual({
      hasCache: false,
      reason: "stale"
    });
  });

  test.each([
    ["user_only", 1],
    ["assistant_only", 1],
    ["range", 1]
  ] as const)("reports exported message count for %s scope", async (scope, expectedCount) => {
    const { handler } = createHandler();

    await handler({ type: CONTENT_SCAN_MESSAGE });
    const response = await handler({
      copyToClipboard: false,
      delivery: "return_files",
      download: false,
      options:
        scope === "range"
          ? { formats: ["md"], range: { endIndex: 0, startIndex: 0 }, scope }
          : { formats: ["md"], scope },
      type: CONTENT_EXPORT_MESSAGE
    });

    expect(response).toMatchObject({
      exportedMessageCount: expectedCount,
      messageCount: expectedCount
    });
  });
});
