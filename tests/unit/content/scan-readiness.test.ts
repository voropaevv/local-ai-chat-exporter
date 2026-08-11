import { JSDOM } from "jsdom";
import { describe, expect, test, vi } from "vitest";

import { waitForVisibleScanLayout } from "../../../extension/content/scan-readiness";

describe("content scan readiness", () => {
  test("waits for a hidden source tab and two visible layout frames", async () => {
    const dom = new JSDOM("<main></main>", { pretendToBeVisual: true });
    const rootDocument = dom.window.document;
    let visibilityState: DocumentVisibilityState = "hidden";
    Object.defineProperty(rootDocument, "visibilityState", {
      configurable: true,
      get: () => visibilityState
    });
    const frameCallbacks: FrameRequestCallback[] = [];
    const requestFrame = vi
      .spyOn(dom.window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        frameCallbacks.push(callback);
        return frameCallbacks.length;
      });

    const pending = waitForVisibleScanLayout(rootDocument);
    await Promise.resolve();
    expect(requestFrame).not.toHaveBeenCalled();

    visibilityState = "visible";
    rootDocument.dispatchEvent(new dom.window.Event("visibilitychange"));
    await Promise.resolve();
    expect(requestFrame).toHaveBeenCalledTimes(1);

    frameCallbacks[0]?.(16);
    await Promise.resolve();
    expect(requestFrame).toHaveBeenCalledTimes(2);
    frameCallbacks[1]?.(32);
    await pending;

    expect(requestFrame).toHaveBeenCalledTimes(2);
    dom.window.close();
  });

  test("cancels a hidden-tab readiness wait without starting layout work", async () => {
    const dom = new JSDOM("<main></main>", { pretendToBeVisual: true });
    const rootDocument = dom.window.document;
    Object.defineProperty(rootDocument, "visibilityState", {
      configurable: true,
      value: "hidden"
    });
    const requestFrame = vi.spyOn(dom.window, "requestAnimationFrame");
    const controller = new AbortController();
    const pending = waitForVisibleScanLayout(rootDocument, controller.signal);

    controller.abort();
    await pending;

    expect(requestFrame).not.toHaveBeenCalled();
    dom.window.close();
  });
});
