import { strFromU8, unzipSync } from "fflate";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  DEFAULT_BATCH_CANCEL_GRACE_MS,
  DEFAULT_BATCH_TAB_TIMEOUT_MS,
  runBatchExport,
  type BatchExportProgress
} from "../../../src/ui/batch-export-controller";
import {
  POPUP_CANCEL_SCAN_MESSAGE,
  POPUP_EXPORT_MESSAGE,
  POPUP_SCAN_MESSAGE,
  type PopupCancelScanRequest,
  type PopupExportRequest,
  type PopupExportSuccess,
  type PopupScanRequest,
  type RuntimeResponse,
  type ScanSummary
} from "../../../src/core/messages";
import type { BatchCandidateTab, BatchManifest } from "../../../src/core/batch";
import { serializeRenderedFile } from "../../../src/core/rendered-file-transport";
import {
  CHATGPT_HISTORY_ACQUIRE_MESSAGE,
  CHATGPT_HISTORY_RELEASE_MESSAGE,
  type ChatGptHistoryAcquireRequest,
  type ChatGptHistoryReleaseRequest
} from "../../../src/core/chatgpt-history";

type BatchRequest = (
  | PopupCancelScanRequest
  | PopupExportRequest
  | PopupScanRequest
  | ChatGptHistoryAcquireRequest
  | ChatGptHistoryReleaseRequest
) & { readonly sourceTabId?: number; readonly expectedSourceUrl?: string };
const EXPORTED_AT = "2026-08-10T22:00:00.000Z";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("batch export controller", () => {
  test("reports serial per-tab phase progress without chat metadata", async () => {
    const progress: BatchExportProgress[] = [];
    const tabs = [makeTab(41, "Private alpha", "alpha"), makeTab(42, "Private beta", "beta")];

    const result = await runBatchExport(
      { onProgress: (next) => progress.push(next), options: { formats: ["md"] }, tabs },
      { now: () => EXPORTED_AT, sendRuntimeMessage: makeSuccessfulRuntimeMessenger() }
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

  test("uses the single-export runtime route serially with a pinned source and per-tab operation", async () => {
    const tabs = [
      makeTab(41, "Private alpha", "alpha", 10),
      makeTab(42, "Private beta", "beta", 20)
    ];
    const sendRuntimeMessage = makeSuccessfulRuntimeMessenger();

    const result = await runBatchExport(
      { options: { formats: ["md"], includeMetadata: false }, tabs },
      { now: () => EXPORTED_AT, sendRuntimeMessage }
    );

    expect(result.results.map((entry) => entry.status)).toEqual(["success", "success"]);
    expect(
      sendRuntimeMessage.mock.calls.map(([request]) => [request.type, request.sourceTabId])
    ).toEqual([
      [POPUP_SCAN_MESSAGE, 41],
      [POPUP_EXPORT_MESSAGE, 41],
      [POPUP_SCAN_MESSAGE, 42],
      [POPUP_EXPORT_MESSAGE, 42]
    ]);
    const firstOperation = sendRuntimeMessage.mock.calls[0][0].operationId;
    const secondOperation = sendRuntimeMessage.mock.calls[2][0].operationId;
    expect(firstOperation).toEqual(expect.any(String));
    expect(firstOperation?.length).toBeGreaterThan(0);
    expect(secondOperation).not.toBe(firstOperation);
    for (const [index, tab] of tabs.entries()) {
      const operationId = index === 0 ? firstOperation : secondOperation;
      expect(sendRuntimeMessage.mock.calls[index * 2][0]).toEqual({
        expectedSourceUrl: tab.url,
        operationId,
        sourceTabId: tab.id,
        type: POPUP_SCAN_MESSAGE
      });
      expect(sendRuntimeMessage.mock.calls[index * 2 + 1][0]).toMatchObject({
        download: false,
        expectedSourceUrl: tab.url,
        operationId,
        options: { formats: ["md"], includeMetadata: false },
        returnFiles: true,
        scanId: `scan-${tab.id}`,
        sourceTabId: tab.id,
        type: POPUP_EXPORT_MESSAGE
      });
    }
  });

  test("continues with later source tabs when one scan fails", async () => {
    const sendRuntimeMessage = makeSuccessfulRuntimeMessenger((request) => {
      if (request.sourceTabId === 41) {
        return {
          ok: false,
          error: { code: "content_script_injection_failed", message: "Tab disappeared" }
        };
      }
    });

    const result = await runBatchExport(
      {
        tabs: [makeTab(41, "Private alpha", "alpha", 10), makeTab(42, "Private beta", "beta", 20)]
      },
      { now: () => EXPORTED_AT, sendRuntimeMessage }
    );

    expect(result.results.map((entry) => entry.status)).toEqual(["failed", "success"]);
    expect(result.results[0]).toMatchObject({ error: "Tab disappeared" });
    expect(
      sendRuntimeMessage.mock.calls.map(([request]) => [request.type, request.sourceTabId])
    ).toEqual([
      [POPUP_SCAN_MESSAGE, 41],
      [POPUP_SCAN_MESSAGE, 42],
      [POPUP_EXPORT_MESSAGE, 42]
    ]);
  });

  test("cancels a stuck scan after the long-chat timeout and records an explicit failure", async () => {
    vi.useFakeTimers();
    const progress: BatchExportProgress[] = [];
    const sendRuntimeMessage = makeSuccessfulRuntimeMessenger((request) =>
      request.type === POPUP_SCAN_MESSAGE ? new Promise(() => undefined) : undefined
    );
    const pending = runBatchExport(
      {
        onProgress: (next) => progress.push(next),
        options: { formats: ["md"] },
        tabs: [makeTab(91, "Sensitive timeout title", "timeout")]
      },
      { now: () => EXPORTED_AT, sendRuntimeMessage }
    );

    await vi.advanceTimersByTimeAsync(DEFAULT_BATCH_TAB_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(DEFAULT_BATCH_CANCEL_GRACE_MS);
    const result = await pending;

    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      operationId: sendRuntimeMessage.mock.calls[0][0].operationId,
      sourceTabId: 91,
      type: POPUP_CANCEL_SCAN_MESSAGE
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
    const sendRuntimeMessage = makeSuccessfulRuntimeMessenger((request) =>
      request.sourceTabId === 2 && request.type === POPUP_SCAN_MESSAGE
        ? new Promise(() => undefined)
        : undefined
    );
    const pending = runBatchExport(
      {
        onProgress: (next) => progress.push(next),
        options: { formats: ["md"] },
        tabs,
        timing: { cancelGraceMs: 5, tabTimeoutMs: 20 }
      },
      { now: () => EXPORTED_AT, sendRuntimeMessage }
    );

    await waitForProgress(progress, (entry) => entry.position === 2 && entry.phase === "scanning");
    await vi.advanceTimersByTimeAsync(20);
    await vi.advanceTimersByTimeAsync(5);
    const result = await pending;

    expect(result.results.map((entry) => entry.status)).toEqual(["success", "failed", "success"]);
    expect(result.zipFile).toBeDefined();
    expect(progress).toContainEqual({ phase: "scanning", position: 3, total: 3 });
    expect(progress.at(-1)).toEqual({ phase: "packaging", position: 3, total: 3 });
    const cancelled = sendRuntimeMessage.mock.calls.find(
      ([request]) => request.type === POPUP_CANCEL_SCAN_MESSAGE
    )?.[0];
    const stuck = sendRuntimeMessage.mock.calls.find(
      ([request]) => request.type === POPUP_SCAN_MESSAGE && request.sourceTabId === 2
    )?.[0];
    expect(cancelled).toEqual({
      operationId: stuck?.operationId,
      sourceTabId: 2,
      type: POPUP_CANCEL_SCAN_MESSAGE
    });
  });

  test("manual cancellation during tab two preserves tab one and ignores late scan responses", async () => {
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
    const lateScan = createDeferred<RuntimeResponse<unknown>>();
    const sendRuntimeMessage = makeSuccessfulRuntimeMessenger((request) =>
      request.sourceTabId === 2 && request.type === POPUP_SCAN_MESSAGE
        ? lateScan.promise
        : undefined
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
        clearTimeout: clearTimeoutSpy,
        now: () => EXPORTED_AT,
        sendRuntimeMessage,
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
      [2, 3, 4].map((tabId) =>
        expect.objectContaining({ reason: "batch_cancelled", status: "skipped", tabId })
      )
    );
    expect(result.zipFile).toBeDefined();
    expect(
      sendRuntimeMessage.mock.calls.map(([request]) => [request.type, request.sourceTabId])
    ).toEqual([
      [POPUP_SCAN_MESSAGE, 1],
      [POPUP_EXPORT_MESSAGE, 1],
      [POPUP_SCAN_MESSAGE, 2],
      [POPUP_CANCEL_SCAN_MESSAGE, 2]
    ]);
    expect(sendRuntimeMessage.mock.calls[3][0].operationId).toBe(
      sendRuntimeMessage.mock.calls[2][0].operationId
    );
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

    const callsBeforeLateResponse = sendRuntimeMessage.mock.calls.length;
    const progressBeforeLateResponse = [...progress];
    lateScan.resolve({ ok: true, value: makeScanSummary(2, tabs[1].url) });
    await flushMicrotasks();

    expect(sendRuntimeMessage).toHaveBeenCalledTimes(callsBeforeLateResponse);
    expect(progress).toEqual(progressBeforeLateResponse);
  });

  test.each(["changed source", "missing scan ID"] as const)(
    "refuses a %s instead of rendering the wrong conversation",
    async (reason) => {
      const tab = makeTab(51, "Original", "original");
      const scan = makeScanSummary(tab.id, tab.url);
      const sendRuntimeMessage = makeSuccessfulRuntimeMessenger((request) =>
        request.type === POPUP_SCAN_MESSAGE
          ? {
              ok: true,
              value:
                reason === "changed source"
                  ? { ...scan, sourceUrl: "https://chatgpt.com/c/replacement" }
                  : { ...scan, scanId: undefined }
            }
          : undefined
      );

      const result = await runBatchExport(
        { tabs: [tab] },
        { now: () => EXPORTED_AT, sendRuntimeMessage }
      );

      expect(result.results).toEqual([
        expect.objectContaining({
          error: "The source conversation changed. Start a new export.",
          status: "failed",
          url: tab.url
        })
      ]);
      expect(result.zipFile).toBeUndefined();
      expect(sendRuntimeMessage).toHaveBeenCalledTimes(1);
    }
  );

  test("uses default chrome.runtime plumbing and preserves binary files and export metadata in the ZIP", async () => {
    const tab = makeTab(61, "Binary fixture", "binary");
    // Deliberately includes nulls and non-UTF-8 bytes: this checks transport, not PDF rendering.
    const binaryBytes = Uint8Array.from([0, 255, 128, 13, 10, 80, 68, 70, 0, 1]);
    const warnings = ["One attachment is reference-only."];
    const sendMessage = makeSuccessfulRuntimeMessenger((request) =>
      request.type === POPUP_EXPORT_MESSAGE
        ? {
            ok: true,
            value: {
              ...makeExportSuccess(tab.id),
              completenessStatus: "partial",
              exportedMessageCount: 7,
              files: [
                serializeRenderedFile({
                  bytes: binaryBytes,
                  encoding: "binary",
                  filename: "fixture.pdf",
                  format: "pdf",
                  mimeType: "application/pdf"
                })
              ],
              warnings
            } satisfies PopupExportSuccess
          }
        : undefined
    );
    const sendContentMessage = vi.fn();
    const updateTab = vi.fn();
    const executeScript = vi.fn();
    vi.stubGlobal("chrome", {
      runtime: { sendMessage },
      scripting: { executeScript },
      tabs: { sendMessage: sendContentMessage, update: updateTab }
    });

    const result = await runBatchExport(
      { options: { formats: ["pdf"] }, tabs: [tab] },
      { now: () => EXPORTED_AT }
    );

    expect(sendMessage.mock.calls.map(([request]) => request.type)).toEqual([
      POPUP_SCAN_MESSAGE,
      POPUP_EXPORT_MESSAGE
    ]);
    expect(sendContentMessage).not.toHaveBeenCalled();
    expect(updateTab).not.toHaveBeenCalled();
    expect(executeScript).not.toHaveBeenCalled();
    expect(result.results[0]).toMatchObject({
      completenessStatus: "partial",
      messageCount: 7,
      status: "success",
      warnings
    });
    expect(result.zipFile).toBeDefined();
    const archive = unzipSync(result.zipFile!.bytes);
    const binaryPath = "jelluvi-2026-08-10/chatgpt-binary-fixture-1.pdf";
    expect(Object.keys(archive).sort()).toEqual([binaryPath, "jelluvi-2026-08-10/manifest.json"]);
    expect(archive[binaryPath]).toEqual(binaryBytes);
    const manifest = JSON.parse(
      strFromU8(archive["jelluvi-2026-08-10/manifest.json"])
    ) as BatchManifest;
    expect(manifest.results).toEqual(result.results);
    expect(manifest.results[0]).toMatchObject({
      files: [
        {
          filename: "chatgpt-binary-fixture-1.pdf",
          format: "pdf",
          mimeType: "application/pdf",
          size: binaryBytes.length
        }
      ]
    });
  });

  test("does not claim complete when the export response omits its completeness status", async () => {
    const sendRuntimeMessage = makeSuccessfulRuntimeMessenger((request) => {
      if (request.type === POPUP_EXPORT_MESSAGE) {
        const { completenessStatus: _status, ...value } = makeExportSuccess(request.sourceTabId!);
        void _status;
        return { ok: true, value };
      }
    });

    const result = await runBatchExport(
      { tabs: [makeTab(71, "Legacy response", "legacy")] },
      { now: () => EXPORTED_AT, sendRuntimeMessage }
    );

    expect(result.results[0]).toMatchObject({ completenessStatus: "unknown", status: "success" });
  });

  test("ignores rendered files that arrive after cancellation during export", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const progress: BatchExportProgress[] = [];
    const lateExport = createDeferred<RuntimeResponse<unknown>>();
    const sendRuntimeMessage = makeSuccessfulRuntimeMessenger((request) =>
      request.type === POPUP_EXPORT_MESSAGE ? lateExport.promise : undefined
    );
    const pending = runBatchExport(
      {
        onProgress: (next) => progress.push(next),
        signal: controller.signal,
        tabs: [makeTab(81, "Held export", "held")],
        timing: { cancelGraceMs: 5 }
      },
      { now: () => EXPORTED_AT, sendRuntimeMessage }
    );
    await waitForProgress(progress, (entry) => entry.phase === "rendering");
    await flushMicrotasks();
    expect(sendRuntimeMessage.mock.calls[1][0].type).toBe(POPUP_EXPORT_MESSAGE);
    controller.abort();
    await waitForProgress(progress, (entry) => entry.phase === "cancelling");
    await vi.advanceTimersByTimeAsync(5);
    const result = await pending;
    expect(result.cancelled).toBe(true);
    expect(result.results[0]).toMatchObject({ status: "skipped" });
    expect(result.zipFile).toBeUndefined();
    const progressAtCancellation = [...progress];
    lateExport.resolve({ ok: true, value: makeExportSuccess(81) });
    await flushMicrotasks();
    expect(progress).toEqual(progressAtCancellation);
    expect(sendRuntimeMessage).toHaveBeenCalledTimes(3);
  });
});

describe("batch history source lifecycle", () => {
  test("acquires a real tab ID, pins scan and export, and releases only after rendering", async () => {
    const selected = makeHistoryTab();
    const getOwnerTabId = vi.fn(async () => 100);
    const sendRuntimeMessage = makeSuccessfulRuntimeMessenger((request) =>
      request.type === CHATGPT_HISTORY_ACQUIRE_MESSAGE
        ? { ok: true, value: { tab: { ...selected, id: 200, history: undefined } } }
        : undefined
    );

    const result = await runBatchExport(
      { tabs: [selected] },
      { now: () => EXPORTED_AT, getOwnerTabId, sendRuntimeMessage }
    );

    expect(result.results[0]).toMatchObject({
      status: "success",
      tabId: selected.id,
      url: selected.url
    });
    expect(result.zipFile).toBeDefined();
    expect(getOwnerTabId).toHaveBeenCalledTimes(1);
    const requests = sendRuntimeMessage.mock.calls.map(([request]) => request);
    expect(requests.map((request) => request.type)).toEqual([
      CHATGPT_HISTORY_ACQUIRE_MESSAGE,
      POPUP_SCAN_MESSAGE,
      POPUP_EXPORT_MESSAGE,
      CHATGPT_HISTORY_RELEASE_MESSAGE
    ]);
    const operationId = requests[0].operationId;
    expect(requests[0]).toEqual({
      type: CHATGPT_HISTORY_ACQUIRE_MESSAGE,
      operationId,
      ownerTabId: 100,
      target: selected.history
    });
    for (const request of requests.slice(1, 3)) {
      expect(request).toMatchObject({
        operationId,
        sourceTabId: 200,
        expectedSourceUrl: selected.url
      });
    }
    expect(requests[2]).toMatchObject({ scanId: "scan-200", download: false, returnFiles: true });
    expect(requests[3]).toEqual({
      type: CHATGPT_HISTORY_RELEASE_MESSAGE,
      operationId,
      ownerTabId: 100
    });
  });

  test.each(["scan failed", "wrong acquired URL", "negative acquired ID"] as const)(
    "releases the history lease after %s without exporting",
    async (failure) => {
      const selected = makeHistoryTab();
      const sendRuntimeMessage = makeSuccessfulRuntimeMessenger((request) => {
        if (request.type === CHATGPT_HISTORY_ACQUIRE_MESSAGE) {
          return {
            ok: true,
            value: {
              tab: {
                ...selected,
                id: failure === "negative acquired ID" ? -2 : 200,
                url:
                  failure === "wrong acquired URL"
                    ? "https://chatgpt.com/c/replacement"
                    : selected.url
              }
            }
          };
        }
        if (request.type === POPUP_SCAN_MESSAGE) {
          return {
            ok: false,
            error: { code: "no_messages_found", message: "Synthetic scan failure" }
          };
        }
      });
      const result = await runBatchExport(
        { tabs: [selected] },
        { now: () => EXPORTED_AT, getOwnerTabId: async () => 100, sendRuntimeMessage }
      );
      expect(result.results[0]).toMatchObject({ status: "failed" });
      expect(result.zipFile).toBeUndefined();
      expect(
        sendRuntimeMessage.mock.calls.some(([request]) => request.type === POPUP_EXPORT_MESSAGE)
      ).toBe(false);
      expect(sendRuntimeMessage.mock.calls.at(-1)?.[0]).toEqual({
        type: CHATGPT_HISTORY_RELEASE_MESSAGE,
        operationId: sendRuntimeMessage.mock.calls[0][0].operationId,
        ownerTabId: 100
      });
    }
  );

  test("reports lease cleanup failure while preserving already rendered files", async () => {
    const selected = makeHistoryTab();
    const sendRuntimeMessage = makeSuccessfulRuntimeMessenger((request) => {
      if (request.type === CHATGPT_HISTORY_ACQUIRE_MESSAGE)
        return { ok: true, value: { tab: { ...selected, id: 200 } } };
      if (request.type === CHATGPT_HISTORY_RELEASE_MESSAGE)
        return {
          ok: false,
          error: { code: "download_failed", message: "Synthetic cleanup failure" }
        };
    });
    const result = await runBatchExport(
      { tabs: [selected] },
      { now: () => EXPORTED_AT, getOwnerTabId: async () => 100, sendRuntimeMessage }
    );
    expect(result.results[0]).toMatchObject({
      status: "success",
      warnings: [
        "The temporary source tab could not be closed automatically. You can close it after this export."
      ]
    });
    expect(result.zipFile).toBeDefined();
  });

  test("does no acquisition or active-tab cancellation if cancelled while getCurrent is pending", async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const owner = createDeferred<number>();
    const progress: BatchExportProgress[] = [];
    const sendRuntimeMessage = makeSuccessfulRuntimeMessenger();
    const getOwnerTabId = vi.fn(() => owner.promise);
    const pending = runBatchExport(
      {
        tabs: [makeHistoryTab()],
        signal: abort.signal,
        onProgress: (next) => progress.push(next),
        timing: { cancelGraceMs: 5 }
      },
      { now: () => EXPORTED_AT, getOwnerTabId, sendRuntimeMessage }
    );
    expect(getOwnerTabId).toHaveBeenCalledTimes(1);
    abort.abort();
    await waitForProgress(progress, (entry) => entry.phase === "cancelling");
    await vi.advanceTimersByTimeAsync(5);
    const result = await pending;
    expect(result.cancelled).toBe(true);
    expect(result.zipFile).toBeUndefined();
    expect(sendRuntimeMessage).not.toHaveBeenCalled();
    const progressAtCancellation = [...progress];
    owner.resolve(100);
    await flushMicrotasks();
    expect(
      sendRuntimeMessage.mock.calls.every(
        ([request]) => request.type === CHATGPT_HISTORY_RELEASE_MESSAGE
      )
    ).toBe(true);
    expect(progress).toEqual(progressAtCancellation);
  });

  test.each([true, false])(
    "cancels an in-flight history acquisition without late files and reports cleanup confirmed=%s",
    async (cleanupConfirmed) => {
      vi.useFakeTimers();
      const selected = makeHistoryTab();
      const acquired = createDeferred<RuntimeResponse<unknown>>();
      const abort = new AbortController();
      const progress: BatchExportProgress[] = [];
      const sendRuntimeMessage = makeSuccessfulRuntimeMessenger((request) => {
        if (request.type === CHATGPT_HISTORY_ACQUIRE_MESSAGE) return acquired.promise;
        if (request.type === CHATGPT_HISTORY_RELEASE_MESSAGE && !cleanupConfirmed)
          return {
            ok: false,
            error: { code: "download_failed", message: "Synthetic cleanup failure" }
          };
      });
      const pending = runBatchExport(
        {
          tabs: [selected],
          signal: abort.signal,
          onProgress: (next) => progress.push(next),
          timing: { cancelGraceMs: 5 }
        },
        { now: () => EXPORTED_AT, getOwnerTabId: async () => 100, sendRuntimeMessage }
      );
      await flushMicrotasks();
      expect(sendRuntimeMessage.mock.calls[0][0].type).toBe(CHATGPT_HISTORY_ACQUIRE_MESSAGE);
      abort.abort();
      await waitForProgress(progress, (entry) => entry.phase === "cancelling");
      await vi.advanceTimersByTimeAsync(5);
      const result = await pending;
      expect(result.cancelled).toBe(true);
      expect(result.results[0]).toMatchObject({
        status: "skipped",
        warnings: cleanupConfirmed
          ? []
          : [
              "Cleanup of the temporary source tab was not confirmed. You can close it after this export."
            ]
      });
      expect(result.zipFile).toBeUndefined();
      expect(sendRuntimeMessage.mock.calls[1][0]).toEqual({
        type: CHATGPT_HISTORY_RELEASE_MESSAGE,
        ownerTabId: 100,
        operationId: sendRuntimeMessage.mock.calls[0][0].operationId
      });
      const progressAtCancellation = [...progress];
      acquired.resolve({ ok: true, value: { tab: { ...selected, id: 200 } } });
      await flushMicrotasks();
      expect(
        sendRuntimeMessage.mock.calls
          .slice(1)
          .every(([request]) => request.type === CHATGPT_HISTORY_RELEASE_MESSAGE)
      ).toBe(true);
      expect(progress).toEqual(progressAtCancellation);
    }
  );
});

function makeHistoryTab(): BatchCandidateTab {
  return {
    ...makeTab(-1, "Selected history", "selected-history"),
    history: {
      conversationId: "selected-history",
      sourceTabId: 50,
      sourceUrl: "https://chatgpt.com/c/source"
    }
  };
}

async function waitForProgress(
  progress: readonly BatchExportProgress[],
  predicate: (entry: BatchExportProgress) => boolean
): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (progress.some(predicate)) return;
    await Promise.resolve();
  }
  throw new Error("Expected batch progress was not emitted.");
}

async function flushMicrotasks(): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) await Promise.resolve();
}

function makeSuccessfulRuntimeMessenger(
  override?: (
    request: BatchRequest
  ) => RuntimeResponse<unknown> | Promise<RuntimeResponse<unknown>> | undefined
) {
  return vi.fn(async (request: BatchRequest): Promise<RuntimeResponse<unknown>> => {
    const overridden = override?.(request);
    if (overridden !== undefined) return overridden;
    if (request.type === POPUP_SCAN_MESSAGE) {
      return { ok: true, value: makeScanSummary(request.sourceTabId!, request.expectedSourceUrl!) };
    }
    if (request.type === POPUP_EXPORT_MESSAGE) {
      return { ok: true, value: makeExportSuccess(request.sourceTabId!) };
    }
    return { ok: true, value: { cancelled: true } };
  });
}

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: (value) => resolvePromise?.(value) };
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

function makeScanSummary(tabId: number, sourceUrl: string): ScanSummary {
  return {
    completeness: {
      duplicateCount: 0,
      messageCount: 2,
      platformWarnings: [],
      reachedBottom: true,
      reachedTop: true,
      scrollSteps: 0,
      status: "complete",
      warnings: []
    },
    messageCount: 2,
    platformLabel: "ChatGPT",
    scanId: `scan-${tabId}`,
    sourceUrl
  };
}

function makeExportSuccess(tabId: number): PopupExportSuccess {
  return {
    completenessStatus: "complete",
    downloaded: [],
    exportedMessageCount: 2,
    files: [
      serializeRenderedFile({
        bytes: `Synthetic response for chat ${tabId}.`,
        encoding: "utf-8",
        filename: `chat-${tabId}.md`,
        format: "md",
        mimeType: "text/markdown"
      })
    ],
    messageCount: 2,
    warnings: []
  };
}
