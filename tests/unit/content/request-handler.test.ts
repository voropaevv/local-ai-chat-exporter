import { describe, expect, test, vi } from "vitest";

import {
  CONTENT_EXPORT_MESSAGE,
  CONTENT_SCAN_MESSAGE,
  CONTENT_START_SELECTION_MESSAGE
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
  const scanCurrentConversationExport = vi.fn().mockResolvedValue(makeConversation());
  const renderedConversations: ConversationExport[] = [];
  const handler = createContentRequestHandler({
    copyRenderedFileToClipboard: vi.fn().mockResolvedValue(undefined),
    createSelectionOverlay: vi.fn(() => ({
      cleanup: vi.fn(),
      getSelection: () => ({ fingerprints: [], ids: ["msg-2"] }),
      show: vi.fn()
    })),
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

  test("export after scan renders from the cached snapshot without rescanning", async () => {
    const { handler, renderedConversations, scanCurrentConversationExport } = createHandler();

    await handler({ type: CONTENT_SCAN_MESSAGE });
    await handler({
      copyToClipboard: false,
      delivery: "return_files",
      download: false,
      options: { formats: ["md"] },
      type: CONTENT_EXPORT_MESSAGE
    });

    expect(scanCurrentConversationExport).toHaveBeenCalledTimes(1);
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
      message: "Scan the conversation before exporting."
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
      message: "The conversation changed. Rescan before exporting."
    });
  });

  test("selection export applies current selection to the cached conversation", async () => {
    const { handler, renderedConversations, scanCurrentConversationExport } = createHandler();

    await handler({ type: CONTENT_SCAN_MESSAGE });
    await handler({ type: CONTENT_START_SELECTION_MESSAGE });
    await handler({
      copyToClipboard: false,
      delivery: "return_files",
      download: false,
      options: { formats: ["md"], scope: "selected" },
      type: CONTENT_EXPORT_MESSAGE
    });

    expect(scanCurrentConversationExport).toHaveBeenCalledTimes(1);
    expect(renderedConversations[0].messages).toHaveLength(1);
    expect(renderedConversations[0].messages[0]).toMatchObject({
      id: "msg-2",
      index: 0,
      metadata: { selected: true }
    });
  });
});
