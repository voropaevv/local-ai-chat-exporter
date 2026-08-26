import { describe, expect, test, vi } from "vitest";

import { getPopupSourceTab } from "../../../extension/background/source-tab";

describe("popup source tab resolution", () => {
  test("keeps using the pinned source tab after the active tab changes", async () => {
    const get = vi.fn(async (tabId: number) => ({
      id: tabId,
      url: "https://chatgpt.com/c/source"
    }));
    const query = vi.fn(async () => [
      {
        id: 99,
        url: "https://chatgpt.com/c/other"
      }
    ]);

    await expect(getPopupSourceTab(73, { get, query })).resolves.toMatchObject({ id: 73 });
    expect(get).toHaveBeenCalledWith(73);
    expect(query).not.toHaveBeenCalled();
  });

  test("falls back to the active tab for a compatible request without a source id", async () => {
    const get = vi.fn();
    const query = vi.fn(async () => [
      {
        id: 73,
        url: "https://chatgpt.com/c/source"
      }
    ]);

    await expect(getPopupSourceTab(undefined, { get, query })).resolves.toMatchObject({ id: 73 });
    expect(get).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true });
  });

  test("returns an actionable error when the pinned source tab was closed", async () => {
    const get = vi.fn(async () => {
      throw new Error("No tab with id: 73");
    });
    const query = vi.fn();

    await expect(getPopupSourceTab(73, { get, query })).rejects.toMatchObject({
      code: "unsupported_platform",
      message:
        "The source conversation tab is no longer available. Reopen Jelluvi on the conversation."
    });
  });
});
