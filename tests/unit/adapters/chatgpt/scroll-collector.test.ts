import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";

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
  });
});
