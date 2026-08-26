import { afterEach, describe, expect, test, vi } from "vitest";

import {
  ACTIVE_TAB_INFO_ERROR_MESSAGE,
  normalizeActiveTabInfo,
  waitForActiveTabInfo
} from "../../../src/ui/active-tab-info";
import { getPageStatus } from "../../../src/ui/components/PageStatusCard";

describe("active tab info", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("recovers support details from the URL when an older worker omits them", () => {
    expect(
      normalizeActiveTabInfo({
        sourceUrl: "https://chatgpt.com/c/example"
      })
    ).toEqual({
      platformLabel: "ChatGPT",
      sourceUrl: "https://chatgpt.com/c/example",
      supported: true
    });
  });

  test("keeps unsupported pages disabled when an older worker omits support details", () => {
    expect(
      normalizeActiveTabInfo({
        sourceUrl: "https://example.com/page"
      })
    ).toEqual({
      sourceUrl: "https://example.com/page",
      supported: false
    });
  });

  test("respects an explicit support result from the current worker", () => {
    expect(
      normalizeActiveTabInfo({
        sourceUrl: "https://chatgpt.com/c/example",
        supported: false
      }).supported
    ).toBe(false);
  });

  test("preserves the pinned source tab id from the current worker", () => {
    expect(
      normalizeActiveTabInfo({
        sourceTabId: 73,
        sourceUrl: "https://chatgpt.com/c/example",
        supported: true
      }).sourceTabId
    ).toBe(73);
  });

  test("ends checking when the worker never responds", async () => {
    vi.useFakeTimers();

    const result = waitForActiveTabInfo(new Promise<never>(() => undefined), 100);
    const rejection = expect(result).rejects.toThrow(ACTIVE_TAB_INFO_ERROR_MESSAGE);

    await vi.advanceTimersByTimeAsync(100);
    await rejection;
  });

  test("shows an error instead of checking after active tab detection fails", () => {
    expect(getPageStatus("idle", undefined, "Current tab", "failed")).toEqual({
      label: "Retry",
      retry: true,
      tone: "error"
    });
  });

  test("keeps the checking label accessible but out of the successful status", () => {
    expect(getPageStatus("idle", undefined, "Current tab", "checking")).toEqual({
      label: "Checking",
      retry: false,
      tone: "neutral"
    });
    expect(getPageStatus("idle", true, "ChatGPT", "ready")).toEqual({
      label: "ChatGPT",
      retry: false,
      tone: "success"
    });
  });
});
