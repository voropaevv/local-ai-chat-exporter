import { JSDOM } from "jsdom";
import { describe, expect, test, vi } from "vitest";

import { findChatGptScrollContainer } from "../../../../src/adapters/chatgpt/scroll-container";
import { collectChatGptConversation } from "../../../../src/adapters/chatgpt/scroll-collector";

function createDocument(html: string): Document {
  return new JSDOM(html, { url: "https://chatgpt.com/c/scroll" }).window.document;
}

function setScrollMetrics(
  element: Element,
  metrics: {
    readonly clientHeight: number;
    readonly scrollHeight: number;
    readonly scrollTop: number;
  }
): void {
  let scrollTop = metrics.scrollTop;

  Object.defineProperties(element, {
    clientHeight: { configurable: true, get: () => metrics.clientHeight },
    scrollHeight: { configurable: true, get: () => metrics.scrollHeight },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = Math.max(0, Math.min(value, metrics.scrollHeight - metrics.clientHeight));
      }
    }
  });
}

function renderMessages(container: Element, messages: readonly string[]): void {
  container.innerHTML = messages
    .map((message, index) => {
      const [id, role, text] = message.split("|");
      return `
        <article data-testid="conversation-turn-${id}-${index}">
          <div data-message-author-role="${role}" data-message-id="${id}">
            <div class="markdown"><p>${text}</p></div>
          </div>
        </article>
      `;
    })
    .join("");
}

describe("findChatGptScrollContainer", () => {
  test("prefers a scrollable container that contains ChatGPT message nodes", () => {
    const document = createDocument(`
      <main>
        <section id="not-chat"></section>
        <section id="chat-scroll">
          <div data-message-author-role="assistant">Hello</div>
        </section>
      </main>
    `);
    const fallback = document.documentElement;
    const chatScroll = document.getElementById("chat-scroll");

    if (!chatScroll) {
      throw new Error("fixture missing chat-scroll");
    }

    setScrollMetrics(chatScroll, { clientHeight: 500, scrollHeight: 2000, scrollTop: 250 });
    Object.defineProperty(document, "scrollingElement", {
      configurable: true,
      value: fallback
    });

    expect(findChatGptScrollContainer(document)).toBe(chatScroll);
  });

  test("falls back to document.scrollingElement", () => {
    const document = createDocument("<main>No messages yet</main>");

    Object.defineProperty(document, "scrollingElement", {
      configurable: true,
      value: document.documentElement
    });

    expect(findChatGptScrollContainer(document)).toBe(document.documentElement);
  });
});

describe("collectChatGptConversation", () => {
  test("scrolls from top to bottom, dedupes messages, and reports completeness", async () => {
    const document = createDocument(`<main id="chat-scroll"></main>`);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    setScrollMetrics(container, { clientHeight: 500, scrollHeight: 2000, scrollTop: 1000 });
    renderMessages(container, [
      "m1|user|First user message",
      "m2|assistant|First assistant message"
    ]);

    const windows = [
      ["m1|user|First user message", "m2|assistant|First assistant message"],
      ["m2|assistant|First assistant message", "m3|user|Second user message"],
      ["m3|user|Second user message", "m4|assistant|Final assistant message"],
      ["m4|assistant|Final assistant message"]
    ];

    let renderCount = 0;
    const result = await collectChatGptConversation({
      document,
      extractMessages: () => {
        renderMessages(container, windows[Math.min(renderCount, windows.length - 1)]);
        renderCount += 1;
        return undefined;
      },
      maxSteps: 10,
      scrollContainer: container,
      scrollStepRatio: 0.75,
      settleDelayMs: 0
    });

    expect(result.messages.map((message) => message.id)).toEqual(["m1", "m2", "m3", "m4"]);
    expect(result.duplicateCount).toBeGreaterThan(0);
    expect(result.reachedTop).toBe(true);
    expect(result.reachedBottom).toBe(true);
    expect(result.scrollSteps).toBeGreaterThan(0);
    expect(result.completeness.status).toBe("complete");
    expect(result.completeness.firstMessagePreview).toBe("First user message");
    expect(result.completeness.lastMessagePreview).toBe("Final assistant message");
    expect(container.scrollTop).toBe(1000);
  });

  test("uses an 85 percent viewport step by default", async () => {
    const document = createDocument(`<main id="chat-scroll"></main>`);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    setScrollMetrics(container, { clientHeight: 100, scrollHeight: 400, scrollTop: 0 });
    renderMessages(container, ["m1|user|First user message"]);
    const scrollPixels: number[] = [];

    await collectChatGptConversation({
      document,
      maxSteps: 1,
      scrollBy: (element, pixels) => {
        scrollPixels.push(pixels);
        element.scrollTop += pixels;
      },
      scrollContainer: container,
      waitForDomSettle: () => Promise.resolve()
    });

    expect(scrollPixels).toEqual([85]);
  });

  test("keeps distinct attachment-only turns when both have stable ids", async () => {
    const document = createDocument(`<main id="chat-scroll"></main>`);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    setScrollMetrics(container, { clientHeight: 500, scrollHeight: 500, scrollTop: 0 });
    const result = await collectChatGptConversation({
      document,
      extractMessages: () => [
        {
          attachments: [{ kind: "file", name: "one.md" }],
          authorLabel: "User",
          codeBlocks: [],
          id: "attachment-turn-1",
          images: [],
          index: 0,
          metadata: {},
          role: "user",
          text: ""
        },
        {
          attachments: [{ kind: "file", name: "two.md" }],
          authorLabel: "User",
          codeBlocks: [],
          id: "attachment-turn-2",
          images: [],
          index: 1,
          metadata: {},
          role: "user",
          text: ""
        }
      ],
      scrollContainer: container,
      waitForDomSettle: () => Promise.resolve()
    });

    expect(result.messages.map((message) => message.id)).toEqual([
      "attachment-turn-1",
      "attachment-turn-2"
    ]);
  });

  test("does not deeply re-extract stable message ids already collected", async () => {
    const document = createDocument(`<main id="chat-scroll"></main>`);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    setScrollMetrics(container, { clientHeight: 100, scrollHeight: 300, scrollTop: 0 });
    renderMessages(container, ["stable-message|assistant|Stable answer"]);
    const messageElement = container.querySelector("[data-message-author-role]");

    if (!messageElement) {
      throw new Error("fixture missing stable message");
    }

    const cloneSpy = vi.spyOn(messageElement, "cloneNode");

    try {
      const result = await collectChatGptConversation({
        document,
        maxSteps: 2,
        scrollContainer: container,
        waitForDomSettle: () => Promise.resolve()
      });

      expect(result.messages.map((message) => message.id)).toEqual(["stable-message"]);
      expect(result.duplicateCount).toBe(2);
      expect(cloneSpy).toHaveBeenCalledTimes(1);
    } finally {
      cloneSpy.mockRestore();
    }
  });

  test("re-extracts and replaces a stable message when its visible revision changes", async () => {
    const document = createDocument(`<main id="chat-scroll"></main>`);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    setScrollMetrics(container, { clientHeight: 100, scrollHeight: 300, scrollTop: 0 });
    renderMessages(container, ["stable-message|assistant|Partial answer"]);
    const messageElement = container.querySelector("[data-message-author-role]");

    if (!messageElement) {
      throw new Error("fixture missing stable message");
    }

    const cloneSpy = vi.spyOn(messageElement, "cloneNode");
    let hydrated = false;

    try {
      const result = await collectChatGptConversation({
        document,
        maxSteps: 2,
        scrollBy: (element, pixels) => {
          element.scrollTop += pixels;

          if (!hydrated) {
            hydrated = true;
            messageElement.innerHTML = `
              <div class="markdown"><p>Complete answer with the loaded result.</p></div>
              <section data-jelluvi-advanced-kind="activity">
                <h3>Activity</h3>
                <p>Loaded the final attachment metadata.</p>
              </section>
            `;
          }
        },
        scrollContainer: container,
        waitForDomSettle: () => Promise.resolve()
      });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toMatchObject({
        id: "stable-message",
        text: "Complete answer with the loaded result.",
        thinkingBlocks: [
          {
            text: "Loaded the final attachment metadata.",
            title: "Activity"
          }
        ]
      });
      expect(cloneSpy).toHaveBeenCalledTimes(2);
    } finally {
      cloneSpy.mockRestore();
    }
  });

  test("waits for DOM quiet but never longer than the 300 ms hard cap", async () => {
    vi.useFakeTimers();

    try {
      const document = createDocument(`<main id="chat-scroll"></main>`);
      const container = document.getElementById("chat-scroll");

      if (!container) {
        throw new Error("fixture missing chat-scroll");
      }

      setScrollMetrics(container, { clientHeight: 500, scrollHeight: 500, scrollTop: 0 });
      renderMessages(container, ["m1|user|First user message"]);
      let settled = false;
      const resultPromise = collectChatGptConversation({
        document,
        scrollContainer: container
      }).then((result) => {
        settled = true;
        return result;
      });

      await vi.advanceTimersByTimeAsync(0);

      for (let elapsed = 60; elapsed <= 240; elapsed += 60) {
        await vi.advanceTimersByTimeAsync(60);
        container.append(document.createElement("span"));
        await Promise.resolve();
        expect(settled).toBe(false);
      }

      await vi.advanceTimersByTimeAsync(59);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      const result = await resultPromise;
      expect(result.messages.map((message) => message.id)).toEqual(["m1"]);
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("cancels an adaptive DOM wait without waiting for its timeout", async () => {
    vi.useFakeTimers();

    try {
      const document = createDocument(`<main id="chat-scroll"></main>`);
      const container = document.getElementById("chat-scroll");
      const controller = new AbortController();

      if (!container) {
        throw new Error("fixture missing chat-scroll");
      }

      setScrollMetrics(container, { clientHeight: 500, scrollHeight: 500, scrollTop: 0 });
      renderMessages(container, ["m1|user|First user message"]);
      const resultPromise = collectChatGptConversation({
        document,
        scrollContainer: container,
        signal: controller.signal
      });

      controller.abort();
      const result = await resultPromise;

      expect(result.aborted).toBe(true);
      expect(result.warnings).toContain("Scan was cancelled.");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test("supports cancellation with AbortSignal", async () => {
    const document = createDocument(`<main id="chat-scroll"></main>`);
    const container = document.getElementById("chat-scroll");
    const controller = new AbortController();

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    setScrollMetrics(container, { clientHeight: 500, scrollHeight: 2000, scrollTop: 0 });
    renderMessages(container, ["m1|user|First user message"]);

    const result = await collectChatGptConversation({
      document,
      maxSteps: 10,
      scrollContainer: container,
      settleDelayMs: 0,
      signal: controller.signal,
      waitForDomSettle: () => {
        controller.abort();
        return Promise.resolve();
      }
    });

    expect(result.aborted).toBe(true);
    expect(result.completeness.status).toBe("partial");
    expect(result.warnings).toContain("Scan was cancelled.");
    expect(container.scrollTop).toBe(0);
  });

  test("marks a stalled scan as partial", async () => {
    const document = createDocument(`<main id="chat-scroll"></main>`);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    setScrollMetrics(container, { clientHeight: 500, scrollHeight: 2000, scrollTop: 0 });
    renderMessages(container, ["m1|user|First user message"]);

    const result = await collectChatGptConversation({
      document,
      maxSteps: 10,
      maxStalls: 2,
      scrollContainer: container,
      settleDelayMs: 0,
      scrollBy: () => undefined
    });

    expect(result.reachedBottom).toBe(false);
    expect(result.stalls).toBe(2);
    expect(result.completeness.status).toBe("partial");
    expect(result.warnings).toContain("Scan stalled before reaching the bottom.");
    expect(container.scrollTop).toBe(0);
  });

  test("restores the reader position when scanning throws", async () => {
    const document = createDocument(`<main id="chat-scroll"></main>`);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    setScrollMetrics(container, { clientHeight: 500, scrollHeight: 2000, scrollTop: 725 });

    await expect(
      collectChatGptConversation({
        document,
        scrollContainer: container,
        waitForDomSettle: () => Promise.reject(new Error("layout failed"))
      })
    ).rejects.toThrow("layout failed");
    expect(container.scrollTop).toBe(725);
  });
});
