import { afterEach, describe, expect, test, vi } from "vitest";

import {
  DEFAULT_BATCH_CANCEL_GRACE_MS,
  DEFAULT_BATCH_TAB_TIMEOUT_MS,
  runBatchExport,
  type BatchExportProgress
} from "../../../src/ui/batch-export-controller";
import {
  CONTENT_CANCEL_SCAN_MESSAGE,
  CONTENT_GET_CACHED_CONVERSATION_MESSAGE,
  CONTENT_SCAN_MESSAGE,
  type RuntimeResponse,
  type ScanSummary
} from "../../../src/core/messages";
import type { BatchCandidateTab } from "../../../src/core/batch";
import type { ConversationExport } from "../../../src/core/schema";

afterEach(() => {
  vi.useRealTimers();
});

describe("batch export controller", () => {
  test("reports serial per-tab phase progress without chat metadata", async () => {
    const progress: BatchExportProgress[] = [];
    const tabs = [makeTab(41, "Private alpha", "alpha"), makeTab(42, "Private beta", "beta")];
    const sendContentMessage = makeSuccessfulContentMessenger();

    const result = await runBatchExport(
      {
        onProgress: (next) => progress.push(next),
        options: { formats: ["md"] },
        tabs
      },
      {
        ensureContentScript: vi.fn(async () => undefined),
        now: () => "2026-08-10T22:00:00.000Z",
        sendContentMessage
      }
    );

    expect(progress).toEqual([
      { phase: "preparing", position: 1, total: 2 },
      { phase: "scanning", position: 1, total: 2 },
      { phase: "rendering", position: 1, total: 2 },
      { phase: "complete", position: 1, total: 2 },
      { phase: "preparing", position: 2, total: 2 },
      { phase: "scanning", position: 2, total: 2 },
      { phase: "rendering", position: 2, total: 2 },
      { phase: "complete", position: 2, total: 2 },
      { phase: "packaging", position: 2, total: 2 }
    ]);
    const serializedProgress = JSON.stringify(progress);
    expect(serializedProgress).not.toContain("Private alpha");
    expect(serializedProgress).not.toContain("chatgpt.com");
    expect(serializedProgress).not.toContain('"tabId"');
    expect(result.results.map((entry) => entry.status)).toEqual(["success", "success"]);
    expect(result.zipFile?.filename).toBe("jelluvi-2026-08-10.zip");
  });

  test("cancels a stuck scan after the long-chat timeout and records an explicit failure", async () => {
    vi.useFakeTimers();
    const progress: BatchExportProgress[] = [];
    const sendContentMessage = vi.fn(
      async (
        _tabId: number,
        request: { readonly type: string }
      ): Promise<RuntimeResponse<unknown>> => {
        if (request.type === CONTENT_CANCEL_SCAN_MESSAGE) {
          return { ok: true, value: { cancelled: true } };
        }

        return new Promise(() => undefined);
      }
    );
    const pending = runBatchExport(
      {
        onProgress: (next) => progress.push(next),
        options: { formats: ["md"] },
        tabs: [makeTab(91, "Sensitive timeout title", "timeout")]
      },
      {
        ensureContentScript: vi.fn(async () => undefined),
        now: () => "2026-08-10T22:00:00.000Z",
        sendContentMessage
      }
    );

    await vi.advanceTimersByTimeAsync(DEFAULT_BATCH_TAB_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(DEFAULT_BATCH_CANCEL_GRACE_MS);
    const result = await pending;

    expect(sendContentMessage).toHaveBeenCalledWith(91, {
      type: CONTENT_CANCEL_SCAN_MESSAGE
    });
    expect(progress.map((entry) => entry.phase)).toEqual([
      "preparing",
      "scanning",
      "cancelling",
      "failed"
    ]);
    expect(result.zipFile).toBeUndefined();
    expect(result.results[0]).toMatchObject({
      error:
        "Timed out after 4 minutes. The scan was cancelled and this chat was skipped so the batch could continue.",
      status: "failed"
    });
  });

  test("preserves earlier successes and continues with later tabs after one timeout", async () => {
    vi.useFakeTimers();
    const progress: BatchExportProgress[] = [];
    const tabs = [
      makeTab(1, "First", "first"),
      makeTab(2, "Stuck", "stuck"),
      makeTab(3, "Last", "last")
    ];
    const sendContentMessage = vi.fn(
      async (
        tabId: number,
        request: { readonly type: string }
      ): Promise<RuntimeResponse<unknown>> => {
        if (request.type === CONTENT_CANCEL_SCAN_MESSAGE) {
          return { ok: true, value: { cancelled: true } };
        }

        if (tabId === 2 && request.type === CONTENT_SCAN_MESSAGE) {
          return new Promise(() => undefined);
        }

        if (request.type === CONTENT_SCAN_MESSAGE) {
          return { ok: true, value: makeScanSummary(tabId) };
        }

        return {
          ok: true,
          value: {
            conversation: makeConversation(tabId),
            hasConversation: true,
            scanId: `scan-${tabId}`
          }
        };
      }
    );
    const pending = runBatchExport(
      {
        onProgress: (next) => progress.push(next),
        options: { formats: ["md"] },
        tabs,
        timing: { cancelGraceMs: 5, tabTimeoutMs: 20 }
      },
      {
        ensureContentScript: vi.fn(async () => undefined),
        now: () => "2026-08-10T22:00:00.000Z",
        sendContentMessage
      }
    );

    await waitForProgress(progress, (entry) => entry.position === 2 && entry.phase === "scanning");
    await vi.advanceTimersByTimeAsync(20);
    await vi.advanceTimersByTimeAsync(5);
    const result = await pending;

    expect(result.results.map((entry) => entry.status)).toEqual(["success", "failed", "success"]);
    expect(result.zipFile).toBeDefined();
    expect(progress).toContainEqual({ phase: "scanning", position: 3, total: 3 });
    expect(progress.at(-1)).toEqual({ phase: "packaging", position: 3, total: 3 });
  });
});

async function waitForProgress(
  progress: readonly BatchExportProgress[],
  predicate: (entry: BatchExportProgress) => boolean
): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (progress.some(predicate)) {
      return;
    }

    await Promise.resolve();
  }

  throw new Error("Expected batch progress was not emitted.");
}

function makeSuccessfulContentMessenger() {
  return vi.fn(
    async (
      tabId: number,
      request: { readonly type: string }
    ): Promise<RuntimeResponse<unknown>> => {
      if (request.type === CONTENT_SCAN_MESSAGE) {
        return { ok: true, value: makeScanSummary(tabId) };
      }

      if (request.type === CONTENT_GET_CACHED_CONVERSATION_MESSAGE) {
        return {
          ok: true,
          value: {
            conversation: makeConversation(tabId),
            hasConversation: true,
            scanId: `scan-${tabId}`
          }
        };
      }

      return { ok: true, value: { cancelled: true } };
    }
  );
}

function makeTab(id: number, title: string, slug: string): BatchCandidateTab {
  return {
    id,
    platform: "chatgpt",
    platformLabel: "ChatGPT",
    title,
    url: `https://chatgpt.com/c/${slug}`
  };
}

function makeScanSummary(tabId: number): ScanSummary {
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
    scanId: `scan-${tabId}`,
    sourceUrl: `https://chatgpt.com/c/${tabId}`
  };
}

function makeConversation(tabId: number): ConversationExport {
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
    exportedAt: "2026-08-10T22:00:00.000Z",
    messageCount: 2,
    messages: [
      {
        authorLabel: "User",
        codeBlocks: [],
        id: `user-${tabId}`,
        images: [],
        index: 0,
        metadata: {},
        role: "user",
        text: "Private message body"
      },
      {
        authorLabel: "ChatGPT",
        codeBlocks: [],
        id: `assistant-${tabId}`,
        images: [],
        index: 1,
        metadata: {},
        role: "assistant",
        text: "Private response body"
      }
    ],
    platform: "chatgpt",
    platformLabel: "ChatGPT",
    schemaVersion: "1.0",
    sourceUrl: `https://chatgpt.com/c/${tabId}`,
    title: `Private chat ${tabId}`
  };
}
