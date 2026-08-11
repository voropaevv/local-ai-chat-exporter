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

  test("activates every source tab before scanning and restores the original tab", async () => {
    const calls: string[] = [];
    const tabs = [
      makeTab(41, "Private alpha", "alpha", 10),
      makeTab(42, "Private beta", "beta", 20)
    ];
    const sendContentMessage = makeSuccessfulContentMessenger((tabId, type) => {
      calls.push(`${type}:${tabId}`);
    });

    const result = await runBatchExport(
      { options: { formats: ["md"] }, tabs },
      {
        activateTab: vi.fn(async (tabId) => {
          calls.push(`activate:${tabId}`);
        }),
        ensureContentScript: vi.fn(async (tabId) => {
          calls.push(`inject:${tabId}`);
        }),
        getActiveTabId: vi.fn(async (windowId) => (windowId === 10 ? 900 : 901)),
        now: () => "2026-08-10T22:00:00.000Z",
        sendContentMessage
      }
    );

    expect(result.results.map((entry) => entry.status)).toEqual(["success", "success"]);
    expect(calls).toEqual([
      "activate:41",
      "inject:41",
      `${CONTENT_SCAN_MESSAGE}:41`,
      `${CONTENT_GET_CACHED_CONVERSATION_MESSAGE}:41`,
      "activate:42",
      "inject:42",
      `${CONTENT_SCAN_MESSAGE}:42`,
      `${CONTENT_GET_CACHED_CONVERSATION_MESSAGE}:42`,
      "activate:900",
      "activate:901"
    ]);
  });

  test("restores both original window tabs when one source activation fails", async () => {
    const activateTab = vi.fn(async (tabId: number) => {
      if (tabId === 41) {
        throw new Error("Tab disappeared");
      }
    });

    const result = await runBatchExport(
      {
        tabs: [makeTab(41, "Private alpha", "alpha", 10), makeTab(42, "Private beta", "beta", 20)]
      },
      {
        activateTab,
        ensureContentScript: vi.fn(async () => undefined),
        getActiveTabId: vi.fn(async (windowId) => (windowId === 10 ? 900 : 901)),
        now: () => "2026-08-10T22:00:00.000Z",
        sendContentMessage: makeSuccessfulContentMessenger()
      }
    );

    expect(result.results.map((entry) => entry.status)).toEqual(["failed", "success"]);
    expect(activateTab.mock.calls.map(([tabId]) => tabId)).toEqual([41, 42, 900, 901]);
  });

  test("continues restoring other windows when one restore fails", async () => {
    const activateTab = vi.fn(async (tabId: number) => {
      if (tabId === 900) {
        throw new Error("Original tab disappeared");
      }
    });

    const result = await runBatchExport(
      {
        tabs: [makeTab(41, "Private alpha", "alpha", 10), makeTab(42, "Private beta", "beta", 20)]
      },
      {
        activateTab,
        ensureContentScript: vi.fn(async () => undefined),
        getActiveTabId: vi.fn(async (windowId) => (windowId === 10 ? 900 : 901)),
        now: () => "2026-08-10T22:00:00.000Z",
        sendContentMessage: makeSuccessfulContentMessenger()
      }
    );

    expect(result.results.map((entry) => entry.status)).toEqual(["success", "success"]);
    expect(result.zipFile).toBeDefined();
    expect(activateTab.mock.calls.map(([tabId]) => tabId)).toEqual([41, 42, 900, 901]);
  });

  test("does not activate a source tab when the per-window snapshot fails", async () => {
    const activateTab = vi.fn(async () => undefined);

    await expect(
      runBatchExport(
        {
          tabs: [makeTab(41, "Private alpha", "alpha", 10), makeTab(42, "Private beta", "beta", 20)]
        },
        {
          activateTab,
          getActiveTabId: vi.fn(async (windowId) => {
            if (windowId === 20) {
              throw new Error("Window disappeared");
            }

            return 900;
          })
        }
      )
    ).rejects.toThrow("Window disappeared");
    expect(activateTab).not.toHaveBeenCalled();
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
      makeTab(1, "First", "first", 10),
      makeTab(2, "Stuck", "stuck", 20),
      makeTab(3, "Last", "last", 10)
    ];
    const activationCalls: number[] = [];
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
        activateTab: vi.fn(async (tabId) => {
          activationCalls.push(tabId);
        }),
        ensureContentScript: vi.fn(async () => undefined),
        getActiveTabId: vi.fn(async (windowId) => (windowId === 10 ? 900 : 901)),
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
    expect(activationCalls).toEqual([1, 2, 3, 900, 901]);
  });

  test("manual cancellation during tab two preserves tab one and never starts later tabs", async () => {
    vi.useFakeTimers();
    const abortController = new AbortController();
    const addAbortListener = vi.spyOn(abortController.signal, "addEventListener");
    const removeAbortListener = vi.spyOn(abortController.signal, "removeEventListener");
    const progress: BatchExportProgress[] = [];
    const tabs = [
      makeTab(1, "First private title", "first", 10),
      makeTab(2, "Second private title", "second", 20),
      makeTab(3, "Third private title", "third", 10),
      makeTab(4, "Fourth private title", "fourth", 20)
    ];
    const activationCalls: number[] = [];
    const lateScan = createDeferred<RuntimeResponse<unknown>>();
    const ensureContentScript = vi.fn(async (tabId: number) => {
      void tabId;
    });
    const sendContentMessage = vi.fn(
      async (
        tabId: number,
        request: { readonly type: string }
      ): Promise<RuntimeResponse<unknown>> => {
        if (request.type === CONTENT_CANCEL_SCAN_MESSAGE) {
          return { ok: true, value: { cancelled: true } };
        }

        if (tabId === 2 && request.type === CONTENT_SCAN_MESSAGE) {
          return lateScan.promise;
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
    const setTimeoutSpy = vi.fn((callback: () => void, delayMs: number) =>
      globalThis.setTimeout(callback, delayMs)
    );
    const clearTimeoutSpy = vi.fn((handle: ReturnType<typeof globalThis.setTimeout>) =>
      globalThis.clearTimeout(handle)
    );
    const pending = runBatchExport(
      {
        onProgress: (next) => progress.push(next),
        options: { formats: ["md"] },
        signal: abortController.signal,
        tabs,
        timing: { cancelGraceMs: 5, tabTimeoutMs: 1_000 }
      },
      {
        activateTab: vi.fn(async (tabId) => {
          activationCalls.push(tabId);
        }),
        clearTimeout: clearTimeoutSpy,
        ensureContentScript,
        getActiveTabId: vi.fn(async (windowId) => (windowId === 10 ? 900 : 901)),
        now: () => "2026-08-10T22:00:00.000Z",
        sendContentMessage,
        setTimeout: setTimeoutSpy
      }
    );

    await waitForProgress(progress, (entry) => entry.position === 2 && entry.phase === "scanning");
    abortController.abort();
    await waitForProgress(
      progress,
      (entry) => entry.position === 2 && entry.phase === "cancelling"
    );
    await vi.advanceTimersByTimeAsync(5);
    const result = await pending;

    expect(result.cancelled).toBe(true);
    expect(result.results.map((entry) => entry.status)).toEqual([
      "success",
      "skipped",
      "skipped",
      "skipped"
    ]);
    expect(result.results.slice(1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "batch_cancelled", status: "skipped", tabId: 2 }),
        expect.objectContaining({ reason: "batch_cancelled", status: "skipped", tabId: 3 }),
        expect.objectContaining({ reason: "batch_cancelled", status: "skipped", tabId: 4 })
      ])
    );
    expect(result.zipFile).toBeDefined();
    expect(ensureContentScript.mock.calls.map(([tabId]) => tabId)).toEqual([1, 2]);
    expect(sendContentMessage).toHaveBeenCalledWith(2, { type: CONTENT_CANCEL_SCAN_MESSAGE });
    expect(sendContentMessage.mock.calls.some(([tabId]) => tabId === 3 || tabId === 4)).toBe(false);
    expect(progress.map((entry) => entry.phase)).toEqual([
      "preparing",
      "scanning",
      "rendering",
      "complete",
      "preparing",
      "scanning",
      "cancelling",
      "cancelled",
      "packaging"
    ]);
    expect(JSON.stringify(progress)).not.toContain("private title");
    expect(JSON.stringify(progress)).not.toContain("chatgpt.com");
    expect(addAbortListener).toHaveBeenCalledTimes(2);
    expect(removeAbortListener).toHaveBeenCalledTimes(2);
    expect(setTimeoutSpy).toHaveBeenCalledTimes(3);
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(3);
    expect(activationCalls).toEqual([1, 2, 900, 901]);

    const callsBeforeLateResponse = sendContentMessage.mock.calls.length;
    const progressBeforeLateResponse = [...progress];
    lateScan.resolve({ ok: true, value: makeScanSummary(2) });
    await Promise.resolve();
    await Promise.resolve();

    expect(sendContentMessage).toHaveBeenCalledTimes(callsBeforeLateResponse);
    expect(progress).toEqual(progressBeforeLateResponse);
    expect(
      sendContentMessage.mock.calls.some(
        ([tabId, request]) =>
          tabId === 2 && request.type === CONTENT_GET_CACHED_CONVERSATION_MESSAGE
      )
    ).toBe(false);
  });
});

async function waitForProgress(
  progress: readonly BatchExportProgress[],
  predicate: (entry: BatchExportProgress) => boolean
): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (progress.some(predicate)) {
      return;
    }

    await Promise.resolve();
  }

  throw new Error("Expected batch progress was not emitted.");
}

function makeSuccessfulContentMessenger(onRequest?: (tabId: number, type: string) => void) {
  return vi.fn(
    async (
      tabId: number,
      request: { readonly type: string }
    ): Promise<RuntimeResponse<unknown>> => {
      onRequest?.(tabId, request.type);

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

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: (value) => resolvePromise?.(value)
  };
}

function makeTab(id: number, title: string, slug: string, windowId = 1): BatchCandidateTab {
  return {
    id,
    platform: "chatgpt",
    platformLabel: "ChatGPT",
    title,
    url: `https://chatgpt.com/c/${slug}`,
    windowId
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
