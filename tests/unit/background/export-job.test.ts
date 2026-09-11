import { afterEach, expect, test, vi } from "vitest";
import { startExportJob } from "../../../extension/background/export-job";
import { POPUP_EXPORT_MESSAGE } from "../../../src/core/messages";

afterEach(() => vi.unstubAllGlobals());

test("creates an inactive job tab with a one-time session-only request", async () => {
  const set = vi
    .fn<(value: Record<string, unknown>) => Promise<void>>()
    .mockResolvedValue(undefined);
  const create = vi.fn(async () => ({ id: 23 }));
  vi.stubGlobal("chrome", {
    storage: { session: { set, remove: vi.fn() } },
    runtime: { getURL: (path: string) => `chrome-extension://test/${path}` },
    tabs: { create }
  });
  const request = { type: POPUP_EXPORT_MESSAGE, sourceTabId: 17 } as const;
  await expect(startExportJob(request)).resolves.toEqual({ tabId: 23 });
  expect(Object.values(set.mock.calls[0][0])).toEqual([request]);
  expect(create).toHaveBeenCalledWith({
    active: false,
    url: expect.stringMatching(/\/export\/index.html\?jobId=/u)
  });
});

test("cleans up session state if the browser cannot open the export tab", async () => {
  const set = vi
    .fn<(value: Record<string, unknown>) => Promise<void>>()
    .mockResolvedValue(undefined);
  const remove = vi.fn<(key: string) => Promise<void>>().mockResolvedValue(undefined);
  vi.stubGlobal("chrome", {
    storage: { session: { set, remove } },
    runtime: { getURL: (path: string) => path },
    tabs: {
      create: vi.fn(async () => {
        throw new Error("Tab creation failed");
      })
    }
  });
  await expect(startExportJob({ type: POPUP_EXPORT_MESSAGE, sourceTabId: 17 })).rejects.toThrow(
    "Tab creation failed"
  );
  expect(remove).toHaveBeenCalledWith(Object.keys(set.mock.calls[0][0] as object)[0]);
});
