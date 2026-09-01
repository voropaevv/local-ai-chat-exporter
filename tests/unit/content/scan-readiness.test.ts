import { JSDOM } from "jsdom";
import { describe, expect, test, vi } from "vitest";

import { waitForScanLayout } from "../../../extension/content/scan-readiness";

describe("content scan readiness", () => {
  test("continues a hidden source tab after bounded layout fallbacks", async () => {
    vi.useFakeTimers();

    const dom = new JSDOM("<main></main>", { pretendToBeVisual: true });
    const rootDocument = dom.window.document;
    Object.defineProperty(rootDocument, "visibilityState", {
      configurable: true,
      value: "hidden"
    });
    let nextFrameId = 1;
    const cancelFrame = vi.fn();
    const requestFrame = vi
      .spyOn(dom.window, "requestAnimationFrame")
      .mockImplementation(() => {
        const frameId = nextFrameId;
        nextFrameId += 1;
        return frameId;
      });
    Object.defineProperty(dom.window, "cancelAnimationFrame", {
      configurable: true,
      value: cancelFrame
    });

    try {
      const pending = waitForScanLayout(rootDocument);
      await Promise.resolve();
      expect(requestFrame).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(500);
      await pending;

      expect(requestFrame).toHaveBeenCalledTimes(2);
      expect(cancelFrame).toHaveBeenNthCalledWith(1, 1);
      expect(cancelFrame).toHaveBeenNthCalledWith(2, 2);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
      dom.window.close();
    }
  });

  test("cancels a hidden-tab layout wait without leaking timers", async () => {
    vi.useFakeTimers();

    const dom = new JSDOM("<main></main>", { pretendToBeVisual: true });
    const rootDocument = dom.window.document;
    Object.defineProperty(rootDocument, "visibilityState", {
      configurable: true,
      value: "hidden"
    });
    const cancelFrame = vi.fn();
    const requestFrame = vi.spyOn(dom.window, "requestAnimationFrame").mockReturnValue(17);
    Object.defineProperty(dom.window, "cancelAnimationFrame", {
      configurable: true,
      value: cancelFrame
    });
    const controller = new AbortController();

    try {
      const pending = waitForScanLayout(rootDocument, controller.signal);
      controller.abort();
      await pending;

      expect(requestFrame).toHaveBeenCalledTimes(1);
      expect(cancelFrame).toHaveBeenCalledWith(17);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
      dom.window.close();
    }
  });
});
