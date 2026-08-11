import { describe, expect, test, vi } from "vitest";

import {
  CONTENT_CANCEL_SCAN_MESSAGE,
  CONTENT_GET_CACHED_CONVERSATION_MESSAGE,
  CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE,
  CONTENT_SCAN_MESSAGE,
  type ScanSummary
} from "../../../src/core/messages";
import type { ConversationExport } from "../../../src/core/schema";
import {
  createContentRequestHandler,
  isContentRequest
} from "../../../extension/content/request-handler";

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
  const handler = createContentRequestHandler({
    getCurrentUrl: () => "https://chatgpt.com/c/cached",
    scanCurrentConversationExport,
    ...overrides
  });

  return {
    handler,
    scanCurrentConversationExport
  };
}

function createDeferred<T>() {
  let rejectPromise: (reason?: unknown) => void = () => undefined;
  let resolvePromise: (value: T | PromiseLike<T>) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    rejectPromise = reject;
    resolvePromise = resolve;
  });

  return { promise, reject: rejectPromise, resolve: resolvePromise };
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

  test("waits for the source tab layout before starting a scan", async () => {
    const calls: string[] = [];
    const scanCurrentConversationExport = vi.fn(async () => {
      calls.push("scan");
      return makeConversation();
    });
    const { handler } = createHandler({
      scanCurrentConversationExport,
      waitForScanReadiness: vi.fn(async () => {
        calls.push("ready");
      })
    });

    await handler({ type: CONTENT_SCAN_MESSAGE });

    expect(calls).toEqual(["ready", "scan"]);
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

  test("keeps the newer scan cancellable when an older scan unwinds late", async () => {
    const firstScan = createDeferred<ConversationExport>();
    const secondScan = createDeferred<ConversationExport>();
    const signals: AbortSignal[] = [];
    const scanCurrentConversationExport = vi
      .fn()
      .mockImplementationOnce(({ signal }: { readonly signal?: AbortSignal }) => {
        if (signal !== undefined) {
          signals.push(signal);
        }
        return firstScan.promise;
      })
      .mockImplementationOnce(({ signal }: { readonly signal?: AbortSignal }) => {
        if (signal !== undefined) {
          signals.push(signal);
        }
        return secondScan.promise;
      });
    const { handler } = createHandler({ scanCurrentConversationExport });

    const firstRequest = handler({ type: CONTENT_SCAN_MESSAGE });
    const secondRequest = handler({ type: CONTENT_SCAN_MESSAGE });

    expect(signals).toHaveLength(2);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);

    firstScan.reject(new Error("first scan cancelled"));
    await expect(firstRequest).rejects.toThrow("first scan cancelled");
    await expect(handler({ type: CONTENT_CANCEL_SCAN_MESSAGE })).resolves.toEqual({
      cancelled: true
    });

    expect(signals[1]?.aborted).toBe(true);

    secondScan.reject(new Error("second scan cancelled"));
    await expect(secondRequest).rejects.toThrow("second scan cancelled");
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

  test("does not accept rendering or delivery commands in the provider page", () => {
    expect(
      isContentRequest({
        delivery: "anchor",
        options: { formats: ["md"] },
        type: "jelluvi/content-export"
      })
    ).toBe(false);
  });

  test("rejects the legacy content protocol so a stale listener cannot race the current one", () => {
    expect(isContentRequest({ type: "jelluvi/content-scan" })).toBe(false);
    expect(isContentRequest({ type: "jelluvi/v2/content-scan" })).toBe(false);
    expect(isContentRequest({ type: "jelluvi/v3/content-scan" })).toBe(false);
    expect(isContentRequest({ type: CONTENT_SCAN_MESSAGE })).toBe(true);
  });
});
