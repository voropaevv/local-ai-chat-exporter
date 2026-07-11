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
        sourceUrl: "https://chatgpt.com/c/example",
        title: "Example chat"
      })
    ).toEqual({
      platformLabel: "ChatGPT",
      sourceUrl: "https://chatgpt.com/c/example",
      supported: true,
      title: "Example chat"
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

  test("ends checking when the worker never responds", async () => {
    vi.useFakeTimers();

    const result = waitForActiveTabInfo(new Promise<never>(() => undefined), 100);
    const rejection = expect(result).rejects.toThrow(ACTIVE_TAB_INFO_ERROR_MESSAGE);

    await vi.advanceTimersByTimeAsync(100);
    await rejection;
  });

  test("shows an error instead of checking after active tab detection fails", () => {
    expect(getPageStatus("error", false, "Current tab")).toEqual({
      label: "Unavailable",
      tone: "error"
    });
  });
});
