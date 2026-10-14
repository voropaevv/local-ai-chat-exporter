import { expect, test, vi } from "vitest";
import {
  POPUP_EXPORT_MESSAGE,
  POPUP_SCAN_MESSAGE,
  type PopupExportSuccess,
  type RuntimeResponse,
  type ScanSummary
} from "../../../src/core/messages";
import { runExportJob } from "../../../src/ui/export-job";

test("pins the original source and finishes after its launcher disappears", async () => {
  const calls: unknown[] = [];
  const result = { files: [], exportedMessageCount: 2 } as unknown as PopupExportSuccess;
  const send = async <T>(request: unknown): Promise<RuntimeResponse<T>> => {
    calls.push(request);
    const value = calls.length === 1 ? ({ scanId: "scan-cold-1" } as ScanSummary) : result;
    return { ok: true, value: value as T };
  };
  const download = vi.fn(async () => undefined);
  await expect(
    runExportJob({
      request: {
        type: POPUP_EXPORT_MESSAGE,
        sourceTabId: 17,
        expectedSourceUrl: "https://chatgpt.com/c/original",
        operationId: "job-one"
      },
      send,
      download,
      signal: new AbortController().signal,
      onProgress: vi.fn()
    })
  ).resolves.toBe(result);
  expect(calls).toHaveLength(2);
  expect(calls[0]).toEqual({
    type: POPUP_SCAN_MESSAGE,
    sourceTabId: 17,
    expectedSourceUrl: "https://chatgpt.com/c/original",
    operationId: "job-one"
  });
  expect(calls[1]).toMatchObject({
    scanId: "scan-cold-1",
    sourceTabId: 17,
    type: POPUP_EXPORT_MESSAGE
  });
  expect(download).toHaveBeenCalledExactlyOnceWith(result);
});

test("never downloads a late scan result after cancellation", async () => {
  const controller = new AbortController();
  const download = vi.fn(async () => undefined);
  let calls = 0;
  const send = async <T>(): Promise<RuntimeResponse<T>> => {
    if (++calls === 1) controller.abort();
    return {
      ok: true,
      value: { scanId: "scan-cancelled" } as T
    };
  };
  await expect(
    runExportJob({
      request: { type: POPUP_EXPORT_MESSAGE, sourceTabId: 17 },
      send,
      download,
      signal: controller.signal,
      onProgress: vi.fn()
    })
  ).rejects.toThrow("Export cancelled");
  expect(download).not.toHaveBeenCalled();
  expect(calls).toBe(1);
});

test("renders a snapshot prepared synchronously by the export click", async () => {
  const calls: unknown[] = [];
  const result = { files: [], exportedMessageCount: 20 } as unknown as PopupExportSuccess;
  const download = vi.fn(async () => undefined);

  await expect(
    runExportJob({
      request: {
        scanId: "scan-prepared-at-click",
        sourceTabId: 17,
        type: POPUP_EXPORT_MESSAGE
      },
      send: async <T>(request: unknown): Promise<RuntimeResponse<T>> => {
        calls.push(request);
        return { ok: true, value: result as T };
      },
      download,
      signal: new AbortController().signal,
      onProgress: vi.fn()
    })
  ).resolves.toBe(result);

  expect(calls).toEqual([
    {
      scanId: "scan-prepared-at-click",
      sourceTabId: 17,
      type: POPUP_EXPORT_MESSAGE
    }
  ]);
  expect(download).toHaveBeenCalledExactlyOnceWith(result);
});
