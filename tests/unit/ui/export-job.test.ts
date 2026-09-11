import { expect, test, vi } from "vitest";
import {
  POPUP_EXPORT_MESSAGE,
  POPUP_SCAN_MESSAGE,
  type PopupExportSuccess,
  type RuntimeResponse
} from "../../../src/core/messages";
import { runExportJob } from "../../../src/ui/export-job";

test("pins the original source and finishes after its launcher disappears", async () => {
  const calls: unknown[] = [];
  const result = { files: [], exportedMessageCount: 2 } as unknown as PopupExportSuccess;
  const send = async <T>(request: unknown): Promise<RuntimeResponse<T>> => {
    calls.push(request);
    return { ok: true, value: (calls.length === 1 ? { hasCache: false } : result) as T };
  };
  const download = vi.fn(async () => undefined);
  await expect(
    runExportJob({
      request: { type: POPUP_EXPORT_MESSAGE, sourceTabId: 17 },
      send,
      download,
      signal: new AbortController().signal,
      onProgress: vi.fn()
    })
  ).resolves.toBe(result);
  expect(calls).toHaveLength(3);
  expect(calls[1]).toEqual({ type: POPUP_SCAN_MESSAGE, sourceTabId: 17 });
  expect(calls[2]).toMatchObject({ type: POPUP_EXPORT_MESSAGE, sourceTabId: 17 });
  expect(download).toHaveBeenCalledExactlyOnceWith(result);
});

test("never downloads a late scan result after cancellation", async () => {
  const controller = new AbortController();
  const download = vi.fn(async () => undefined);
  let calls = 0;
  const send = async <T>(): Promise<RuntimeResponse<T>> => {
    if (++calls === 2) controller.abort();
    return { ok: true, value: { hasCache: false } as T };
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
  expect(calls).toBe(2);
});
