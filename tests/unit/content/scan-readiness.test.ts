import { JSDOM } from "jsdom";
import { describe, expect, test, vi } from "vitest";

import { waitForScanLayout } from "../../../extension/content/scan-readiness";

describe("content scan readiness", () => {
  test("waits for the first ChatGPT message instead of scanning a cold conversation shell", async () => {
    vi.useFakeTimers();

    const dom = new JSDOM(
      "<main><article data-testid='conversation-turn-loading'></article></main>",
      {
        pretendToBeVisual: true,
        url: "https://chatgpt.com/c/cold-conversation"
      }
    );
    const rootDocument = dom.window.document;
    let settled = false;

    try {
      const pending = waitForScanLayout(rootDocument).then(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(2_000);
      expect(settled).toBe(false);

      const message = rootDocument.createElement("article");
      message.setAttribute("data-message-author-role", "user");
      rootDocument.querySelector("main")?.append(message);
      await vi.advanceTimersByTimeAsync(0);

      expect(settled).toBe(false);

      message.textContent = "Hydrated current prompt";
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1_000);
      await pending;

      expect(settled).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
      dom.window.close();
    }
  });

  test("settles when a cold ChatGPT turn hydrates with a nested accessible role heading", async () => {
    vi.useFakeTimers();

    const dom = new JSDOM("<main></main>", {
      pretendToBeVisual: true,
      url: "https://chatgpt.com/c/nested-heading-hydration"
    });
    const rootDocument = dom.window.document;
    let settled = false;

    try {
      const pending = waitForScanLayout(rootDocument).then(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(2_000);
      expect(settled).toBe(false);

      rootDocument.querySelector("main")?.insertAdjacentHTML(
        "beforeend",
        `<article data-testid="conversation-turn-current">
          <div class="turn-layout-wrapper">
            <div class="turn-content-wrapper">
              <h4 class="sr-only">You said:</h4>
              <div class="whitespace-pre-wrap">Nested current prompt</div>
            </div>
          </div>
        </article>`
      );
      await vi.advanceTimersByTimeAsync(0);

      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1_000);
      await pending;
      expect(settled).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
      dom.window.close();
    }
  });

  test("restarts the stability gate when ChatGPT replaces its scroll container", async () => {
    vi.useFakeTimers();

    const dom = new JSDOM(
      `<main id="initial">
        <article data-message-author-role="assistant">Initial rendered answer</article>
      </main>`,
      {
        pretendToBeVisual: true,
        url: "https://chatgpt.com/c/replaced-container"
      }
    );
    const rootDocument = dom.window.document;
    let settled = false;

    try {
      const pending = waitForScanLayout(rootDocument).then(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(700);
      rootDocument.body.innerHTML = `<main id="hydrated">
        <article data-message-author-role="assistant">Hydrated replacement answer</article>
      </main>`;
      await vi.advanceTimersByTimeAsync(999);
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(settled).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
      dom.window.close();
    }
  });

  test("bounds a ChatGPT initial-message wait and releases its observer", async () => {
    vi.useFakeTimers();

    const dom = new JSDOM("<main></main>", {
      pretendToBeVisual: true,
      url: "https://chatgpt.com/g/project/c/empty-conversation"
    });

    try {
      const pending = waitForScanLayout(dom.window.document);
      await vi.advanceTimersByTimeAsync(30_500);
      await pending;

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
      dom.window.close();
    }
  });

  test("cancels while waiting for ChatGPT's first message without leaking resources", async () => {
    vi.useFakeTimers();

    const dom = new JSDOM("<main></main>", {
      pretendToBeVisual: true,
      url: "https://chatgpt.com/c/cancelled-conversation"
    });
    const controller = new AbortController();

    try {
      const pending = waitForScanLayout(dom.window.document, controller.signal);
      await vi.advanceTimersByTimeAsync(500);
      controller.abort();
      await pending;

      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
      dom.window.close();
    }
  });

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
