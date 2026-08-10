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
    readonly onScrollTopChange?: (scrollTop: number, previousScrollTop: number) => void;
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
        const previousScrollTop = scrollTop;
        scrollTop = Math.max(0, Math.min(value, metrics.scrollHeight - metrics.clientHeight));
        metrics.onScrollTopChange?.(scrollTop, previousScrollTop);
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

  test("keeps repeated same-role text when stable message ids differ", async () => {
    const document = createDocument(`<main id="chat-scroll"></main>`);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    setScrollMetrics(container, { clientHeight: 500, scrollHeight: 500, scrollTop: 0 });
    renderMessages(container, ["m1|user|Continue", "m2|user|Continue"]);

    const result = await collectChatGptConversation({
      document,
      scrollContainer: container,
      waitForDomSettle: () => Promise.resolve()
    });

    expect(result.messages.map((message) => message.id)).toEqual(["m1", "m2"]);
    expect(result.messages.map((message) => message.text)).toEqual(["Continue", "Continue"]);
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

  test("dedupes a hydrating turn when ChatGPT replaces its temporary id", async () => {
    const document = createDocument(`
      <main id="chat-scroll">
        <div data-turn-id-container="logical-turn-1" style="--last-known-height: 120px">
          <article data-testid="conversation-turn-1">
            <div data-message-author-role="assistant">
              <div class="markdown"><p>Partial answer</p></div>
            </div>
          </article>
        </div>
      </main>
    `);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    setScrollMetrics(container, { clientHeight: 100, scrollHeight: 200, scrollTop: 0 });
    let hydrated = false;
    const result = await collectChatGptConversation({
      document,
      maxSteps: 4,
      scrollBy: (element, pixels) => {
        element.scrollTop += pixels;

        if (!hydrated) {
          hydrated = true;
          const message = container.querySelector("[data-message-author-role]");
          message?.setAttribute("data-message-id", "hydrated-message-id");
          if (message !== null) {
            message.innerHTML = `<div class="markdown"><p>Complete answer</p></div>`;
          }
        }
      },
      scrollContainer: container,
      waitForDomSettle: () => Promise.resolve()
    });

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      id: "hydrated-message-id",
      text: "Complete answer"
    });
    expect(result.duplicateCount).toBeGreaterThan(0);
  });

  test("hydrates missing virtual turn containers and restores conversation order", async () => {
    const document = createDocument(`
      <main id="chat-scroll">
        <div data-turn-id-container="logical-turn-1" style="--last-known-height: 100px">
          <article data-testid="conversation-turn-1">
            <div data-message-author-role="user" data-message-id="m1">
              <div class="markdown"><p>First</p></div>
            </div>
          </article>
        </div>
        <div data-turn-id-container="logical-turn-2" style="--last-known-height: 100px">
          <article data-testid="conversation-turn-2">
            <div data-message-author-role="assistant" data-message-id="m2">
              <div class="markdown"><p>Second</p></div>
            </div>
          </article>
        </div>
        <div data-turn-id-container="logical-turn-3" style="--last-known-height: 100px"></div>
        <div data-turn-id-container="logical-turn-4" style="--last-known-height: 100px">
          <article data-testid="conversation-turn-4">
            <div data-message-author-role="assistant" data-message-id="m4">
              <div class="markdown"><p>Fourth</p></div>
            </div>
          </article>
        </div>
      </main>
    `);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    const wrappers = Array.from(container.querySelectorAll("[data-turn-id-container]"));
    wrappers.forEach((wrapper, index) => {
      Object.defineProperty(wrapper, "getBoundingClientRect", {
        configurable: true,
        value: () => ({
          bottom: index * 100 + 100 - container.scrollTop,
          height: 100,
          left: 0,
          right: 500,
          top: index * 100 - container.scrollTop,
          width: 500,
          x: 0,
          y: index * 100 - container.scrollTop,
          toJSON: () => ({})
        })
      });
    });
    Object.defineProperty(container, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 100,
        height: 100,
        left: 0,
        right: 500,
        top: 0,
        width: 500,
        x: 0,
        y: 0,
        toJSON: () => ({})
      })
    });

    const missingWrapper = wrappers[2];
    let hydrated = false;
    setScrollMetrics(container, {
      clientHeight: 100,
      onScrollTopChange: (scrollTop, previousScrollTop) => {
        if (!hydrated && previousScrollTop === 300 && scrollTop < 250) {
          hydrated = true;
          missingWrapper.innerHTML = `
            <article data-testid="conversation-turn-3">
              <div data-message-author-role="user" data-message-id="m3">
                <div class="markdown"><p>Third</p></div>
              </div>
            </article>
          `;
        }
      },
      scrollHeight: 400,
      scrollTop: 0
    });

    const result = await collectChatGptConversation({
      document,
      maxSteps: 20,
      scrollContainer: container,
      waitForDomSettle: () => Promise.resolve()
    });

    expect(hydrated).toBe(true);
    expect(result.messages.map((message) => message.id)).toEqual(["m1", "m2", "m3", "m4"]);
    expect(result.completeness.status).toBe("complete");
    expect(result.completeness.lastMessagePreview).toBe("Fourth");
  });

  test("does not report complete when a tracked turn container stays unhydrated", async () => {
    const document = createDocument(`
      <main id="chat-scroll">
        <div data-turn-id-container="logical-turn-1" style="--last-known-height: 100px">
          <article data-testid="conversation-turn-1">
            <div data-message-author-role="user" data-message-id="m1">
              <div class="markdown"><p>First</p></div>
            </div>
          </article>
        </div>
        <div data-turn-id-container="logical-turn-2" style="--last-known-height: 100px"></div>
      </main>
    `);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    setScrollMetrics(container, { clientHeight: 100, scrollHeight: 200, scrollTop: 0 });
    const result = await collectChatGptConversation({
      document,
      maxSteps: 20,
      scrollContainer: container,
      waitForDomSettle: () => Promise.resolve()
    });

    expect(result.messages.map((message) => message.id)).toEqual(["m1"]);
    expect(result.completeness.status).toBe("probably_complete");
    expect(result.completeness.warnings).toContain(
      "ChatGPT did not hydrate 1 conversation turn before the scan timeout."
    );
    expect(result.completeness.warnings).toContain(
      "Platform virtualization may hide unloaded messages."
    );
  });

  test("shares the missing-turn attempt budget across completion passes", async () => {
    const document = createDocument(`
      <main id="chat-scroll">
        <div data-turn-id-container="logical-turn-1" style="--last-known-height: 100px">
          <article data-testid="conversation-turn-1">
            <div data-message-author-role="user" data-message-id="m1">
              <div class="markdown"><p>First</p></div>
            </div>
          </article>
        </div>
        <div data-turn-id-container="logical-turn-2" style="--last-known-height: 100px"></div>
      </main>
    `);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    setScrollMetrics(container, { clientHeight: 100, scrollHeight: 100, scrollTop: 0 });
    let waitCalls = 0;
    const result = await collectChatGptConversation({
      document,
      maxMissingTurnRecoveryAttempts: 1,
      maxSteps: 20,
      scrollContainer: container,
      waitForDomSettle: () => {
        waitCalls += 1;

        if (waitCalls === 2) {
          const missingTurn = container.querySelector(
            "[data-turn-id-container='logical-turn-2']"
          );
          if (missingTurn !== null) {
            missingTurn.innerHTML = `
              <article data-testid="conversation-turn-2">
                <div data-message-author-role="assistant" data-message-id="m2">
                  <div class="markdown"><p>Second</p></div>
                </div>
              </article>
            `;
          }
        }

        if (waitCalls === 3) {
          container.insertAdjacentHTML(
            "beforeend",
            `<div data-turn-id-container="logical-turn-3"
              style="--last-known-height: 100px"></div>`
          );
        }

        return Promise.resolve();
      }
    });

    expect(waitCalls).toBe(3);
    expect(result.messages.map((message) => message.id)).toEqual(["m1", "m2"]);
    expect(result.scrollSteps).toBe(2);
    expect(result.warnings).toContain(
      "ChatGPT missing-turn recovery stopped at its bounded scan budget."
    );
    expect(result.warnings).toContain(
      "ChatGPT did not hydrate 1 conversation turn before the scan timeout."
    );
  });

  test("bounds production missing-turn waits without polling the full turn inventory", async () => {
    vi.useFakeTimers();

    try {
      const document = createDocument(`
        <main id="chat-scroll">
          <div data-turn-id-container="logical-turn-1" style="--last-known-height: 100px">
            <article data-testid="conversation-turn-1">
              <div data-message-author-role="user" data-message-id="m1">
                <div class="markdown"><p>First</p></div>
              </div>
            </article>
          </div>
          <div data-turn-id-container="logical-turn-2" style="--last-known-height: 100px">
            <article data-testid="conversation-turn-2">
              <div data-message-author-role="assistant" data-message-id="m2">
                <div class="markdown"><p>Second</p></div>
              </div>
            </article>
          </div>
          <div data-turn-id-container="logical-turn-3" style="--last-known-height: 100px"></div>
        </main>
      `);
      const container = document.getElementById("chat-scroll");

      if (!container) {
        throw new Error("fixture missing chat-scroll");
      }

      setScrollMetrics(container, { clientHeight: 100, scrollHeight: 100, scrollTop: 0 });
      const querySelectorAllSpy = vi.spyOn(container, "querySelectorAll");
      let settled = false;
      const resultPromise = collectChatGptConversation({
        document,
        maxMissingTurnRecoveryAttempts: 10,
        missingTurnRecoveryBudgetMs: 1_000,
        scrollContainer: container
      }).then((result) => {
        settled = true;
        return result;
      });

      await vi.advanceTimersByTimeAsync(1_100);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(100);

      const result = await resultPromise;
      const fullTurnInventoryScans = querySelectorAllSpy.mock.calls.filter(
        ([selector]) => selector === "[data-turn-id-container]"
      );

      expect(result.aborted).toBe(false);
      expect(result.messages.map((message) => message.id)).toEqual(["m1", "m2"]);
      expect(result.warnings).toContain(
        "ChatGPT missing-turn recovery stopped at its bounded scan budget."
      );
      expect(fullTurnInventoryScans.length).toBeLessThan(10);
      expect(vi.getTimerCount()).toBe(0);
      querySelectorAllSpy.mockRestore();
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  test("waits for a suspicious virtualized turn inventory to hydrate", async () => {
    vi.useFakeTimers();

    try {
      const document = createDocument(`<main id="chat-scroll"></main>`);
      const container = document.getElementById("chat-scroll");

      if (!container) {
        throw new Error("fixture missing chat-scroll");
      }

      setScrollMetrics(container, { clientHeight: 500, scrollHeight: 500, scrollTop: 0 });
      renderMessages(container, ["1|user|First user message", "5|user|Fifth user message"]);
      let settled = false;
      const resultPromise = collectChatGptConversation({
        document,
        scrollContainer: container
      }).then((result) => {
        settled = true;
        return result;
      });

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(1_199);
      expect(settled).toBe(false);

      renderMessages(container, [
        "1|user|First user message",
        "2|assistant|First assistant message",
        "3|user|Second user message",
        "4|assistant|Second assistant message",
        "5|user|Fifth user message"
      ]);
      await vi.advanceTimersByTimeAsync(120);

      const result = await resultPromise;
      expect(result.messages.map((message) => message.id)).toEqual(["1", "2", "3", "4", "5"]);
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("bounds a virtualized hydration wait when missing turns never mount", async () => {
    vi.useFakeTimers();

    try {
      const document = createDocument(`<main id="chat-scroll"></main>`);
      const container = document.getElementById("chat-scroll");

      if (!container) {
        throw new Error("fixture missing chat-scroll");
      }

      setScrollMetrics(container, { clientHeight: 500, scrollHeight: 500, scrollTop: 0 });
      renderMessages(container, ["1|user|First user message", "5|user|Fifth user message"]);
      let settled = false;
      const resultPromise = collectChatGptConversation({
        document,
        scrollContainer: container
      }).then((result) => {
        settled = true;
        return result;
      });

      await vi.advanceTimersByTimeAsync(2_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      const result = await resultPromise;
      expect(result.messages.map((message) => message.id)).toEqual(["1", "5"]);
      expect(settled).toBe(true);
      expect(result.completeness.status).toBe("probably_complete");
      expect(result.completeness.warnings).toContain(
        "ChatGPT's early turn window did not finish loading before the scan timeout."
      );
      expect(result.completeness.warnings).toContain(
        "Platform virtualization may hide unloaded messages."
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test("waits at the bottom for delayed final turns to mount", async () => {
    vi.useFakeTimers();

    try {
      const document = createDocument(`<main id="chat-scroll"></main>`);
      const container = document.getElementById("chat-scroll");

      if (!container) {
        throw new Error("fixture missing chat-scroll");
      }

      const scrollMetrics = { clientHeight: 100, scrollHeight: 300, scrollTop: 0 };
      setScrollMetrics(container, scrollMetrics);
      renderMessages(container, [
        "1|user|First user message",
        "2|assistant|First assistant message"
      ]);
      let lateTailMounted = false;
      let settled = false;
      const resultPromise = collectChatGptConversation({
        document,
        scrollBy: (element, pixels) => {
          element.scrollTop += pixels;

          if (!lateTailMounted && element.scrollTop >= 200) {
            lateTailMounted = true;
            globalThis.setTimeout(() => {
              scrollMetrics.scrollHeight = 400;
              renderMessages(container, [
                "1|user|First user message",
                "2|assistant|First assistant message",
                "3|user|Late final user message",
                "4|assistant|Late final assistant message"
              ]);
            }, 750);
          }
        },
        scrollContainer: container
      }).then((result) => {
        settled = true;
        return result;
      });

      await vi.advanceTimersByTimeAsync(1_000);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(8_000);

      const result = await resultPromise;
      expect(result.messages.map((message) => message.id)).toEqual(["1", "2", "3", "4"]);
      expect(result.completeness.status).toBe("complete");
      expect(settled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("warns when the final turn remains unhydrated after the bottom wait", async () => {
    vi.useFakeTimers();

    try {
      const document = createDocument(`<main id="chat-scroll"></main>`);
      const container = document.getElementById("chat-scroll");

      if (!container) {
        throw new Error("fixture missing chat-scroll");
      }

      setScrollMetrics(container, { clientHeight: 100, scrollHeight: 300, scrollTop: 0 });
      renderMessages(container, [
        "1|user|First user message",
        "2|assistant|First assistant message"
      ]);
      let finalPlaceholderMounted = false;
      const resultPromise = collectChatGptConversation({
        document,
        scrollBy: (element, pixels) => {
          element.scrollTop += pixels;

          if (!finalPlaceholderMounted && element.scrollTop >= 200) {
            finalPlaceholderMounted = true;
            container.insertAdjacentHTML(
              "beforeend",
              `<article data-testid="conversation-turn-3"><div class="loading"></div></article>`
            );
          }
        },
        scrollContainer: container
      });

      await vi.advanceTimersByTimeAsync(3_600);

      const result = await resultPromise;
      expect(result.messages.map((message) => message.id)).toEqual(["1", "2"]);
      expect(result.completeness.status).toBe("probably_complete");
      expect(result.completeness.warnings).toContain(
        "ChatGPT's final turn window did not finish loading before the scan timeout."
      );
      expect(result.completeness.warnings).toContain(
        "Platform virtualization may hide unloaded messages."
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test("waits for turn one when the top initially exposes only a later window", async () => {
    vi.useFakeTimers();

    try {
      const document = createDocument(`<main id="chat-scroll"></main>`);
      const container = document.getElementById("chat-scroll");

      if (!container) {
        throw new Error("fixture missing chat-scroll");
      }

      setScrollMetrics(container, { clientHeight: 500, scrollHeight: 500, scrollTop: 0 });
      renderMessages(container, ["5|user|Fifth user message"]);
      const resultPromise = collectChatGptConversation({
        document,
        scrollContainer: container
      });

      await vi.advanceTimersByTimeAsync(500);
      renderMessages(container, [
        "1|user|First user message",
        "2|assistant|First assistant message"
      ]);
      await vi.advanceTimersByTimeAsync(120);

      const result = await resultPromise;
      expect(result.messages.map((message) => message.id)).toEqual(["1", "2"]);
      expect(result.completeness.status).toBe("complete");
    } finally {
      vi.useRealTimers();
    }
  });

  test("waits for an empty early turn placeholder to receive message content", async () => {
    vi.useFakeTimers();

    try {
      const document = createDocument(`<main id="chat-scroll"></main>`);
      const container = document.getElementById("chat-scroll");

      if (!container) {
        throw new Error("fixture missing chat-scroll");
      }

      setScrollMetrics(container, { clientHeight: 500, scrollHeight: 500, scrollTop: 0 });
      renderMessages(container, ["1|user|First user message"]);
      container.insertAdjacentHTML(
        "beforeend",
        `<article data-testid="conversation-turn-2"><div class="loading"></div></article>`
      );
      const resultPromise = collectChatGptConversation({
        document,
        scrollContainer: container
      });

      await vi.advanceTimersByTimeAsync(500);
      const placeholder = container.querySelector("[data-testid='conversation-turn-2']");
      placeholder?.insertAdjacentHTML(
        "beforeend",
        `<div data-message-author-role="assistant" data-message-id="2">
          <div class="markdown"><p>Hydrated assistant answer</p></div>
        </div>`
      );
      await vi.advanceTimersByTimeAsync(120);

      const result = await resultPromise;
      expect(result.messages.map((message) => message.id)).toEqual(["1", "2"]);
      expect(result.completeness.status).toBe("complete");
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

  test("starts the DOM wait when a background tab never runs requestAnimationFrame", async () => {
    vi.useFakeTimers();

    try {
      const document = createDocument(`<main id="chat-scroll"></main>`);
      const container = document.getElementById("chat-scroll");
      const ownerWindow = document.defaultView;

      if (!container || ownerWindow === null) {
        throw new Error("fixture missing browser context");
      }

      const requestFrame = vi.fn(() => 17);
      const cancelFrame = vi.fn();
      Object.defineProperties(ownerWindow, {
        cancelAnimationFrame: { configurable: true, value: cancelFrame },
        requestAnimationFrame: { configurable: true, value: requestFrame }
      });
      setScrollMetrics(container, { clientHeight: 500, scrollHeight: 500, scrollTop: 0 });
      renderMessages(container, ["1|user|First", "2|assistant|Second"]);
      let settled = false;
      const resultPromise = collectChatGptConversation({
        document,
        scrollContainer: container
      }).then((result) => {
        settled = true;
        return result;
      });

      await vi.advanceTimersByTimeAsync(119);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      const result = await resultPromise;
      expect(result.messages.map((message) => message.id)).toEqual(["1", "2"]);
      expect(result.completeness.status).toBe("complete");
      expect(requestFrame).toHaveBeenCalledTimes(1);
      expect(cancelFrame).toHaveBeenCalledWith(17);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test("cancels before a suspended requestAnimationFrame without leaking timers", async () => {
    vi.useFakeTimers();

    try {
      const document = createDocument(`<main id="chat-scroll"></main>`);
      const container = document.getElementById("chat-scroll");
      const ownerWindow = document.defaultView;
      const controller = new AbortController();

      if (!container || ownerWindow === null) {
        throw new Error("fixture missing browser context");
      }

      const cancelFrame = vi.fn();
      Object.defineProperties(ownerWindow, {
        cancelAnimationFrame: { configurable: true, value: cancelFrame },
        requestAnimationFrame: { configurable: true, value: () => 23 }
      });
      setScrollMetrics(container, { clientHeight: 500, scrollHeight: 500, scrollTop: 0 });
      renderMessages(container, ["1|user|First"]);
      const resultPromise = collectChatGptConversation({
        document,
        scrollContainer: container,
        signal: controller.signal
      });

      controller.abort();
      const result = await resultPromise;

      expect(result.aborted).toBe(true);
      expect(result.warnings).toContain("Scan was cancelled.");
      expect(cancelFrame).toHaveBeenCalledWith(23);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test("returns collected messages when the total main-scan wall budget expires", async () => {
    vi.useFakeTimers();

    try {
      const document = createDocument(`<main id="chat-scroll"></main>`);
      const container = document.getElementById("chat-scroll");

      if (!container) {
        throw new Error("fixture missing chat-scroll");
      }

      setScrollMetrics(container, { clientHeight: 100, scrollHeight: 2_000, scrollTop: 0 });
      renderMessages(container, ["1|user|First", "2|assistant|Second"]);
      let settled = false;
      const resultPromise = collectChatGptConversation({
        document,
        mainScanBudgetMs: 1_000,
        scrollContainer: container,
        waitForDomSettle: (signal) =>
          signal?.aborted === true
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                signal?.addEventListener("abort", () => resolve(), { once: true });
              })
      }).then((result) => {
        settled = true;
        return result;
      });

      await vi.advanceTimersByTimeAsync(999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      const result = await resultPromise;
      expect(result.aborted).toBe(false);
      expect(result.messages.map((message) => message.id)).toEqual(["1", "2"]);
      expect(result.warnings).toContain(
        "ChatGPT main scan stopped at its bounded wall-clock budget."
      );
      expect(result.completeness.status).toBe("partial");
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

  test("stops the main scan after bounded no-new-message progress", async () => {
    const document = createDocument(`<main id="chat-scroll"></main>`);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    setScrollMetrics(container, { clientHeight: 100, scrollHeight: 2_000, scrollTop: 0 });
    renderMessages(container, ["m1|user|First user message"]);

    const result = await collectChatGptConversation({
      document,
      maxNoNewMessageSteps: 3,
      maxStalls: 100,
      maxSteps: 100,
      scrollContainer: container,
      waitForDomSettle: () => Promise.resolve()
    });

    expect(result.reachedBottom).toBe(false);
    expect(result.scrollSteps).toBe(3);
    expect(result.completeness.status).toBe("partial");
    expect(result.warnings).toContain(
      "Scan stopped after repeated scrolls without discovering new conversation content."
    );
  });

  test("does not treat rich-message revisions or height jitter as new history", async () => {
    vi.useFakeTimers();

    try {
      const document = createDocument(`<main id="chat-scroll"></main>`);
      const container = document.getElementById("chat-scroll");

      if (!container) {
        throw new Error("fixture missing chat-scroll");
      }

      const scrollMetrics = { clientHeight: 100, scrollHeight: 2_000, scrollTop: 0 };
      setScrollMetrics(container, scrollMetrics);
      renderMessages(container, ["1|user|First", "2|assistant|Rich answer"]);
      let scrollCalls = 0;
      const resultPromise = collectChatGptConversation({
        document,
        maxNoNewMessageSteps: 3,
        maxStalls: 100,
        maxSteps: 100,
        scrollBy: (element, pixels) => {
          element.scrollTop += pixels;
          scrollCalls += 1;
          scrollMetrics.scrollHeight = scrollCalls % 2 === 0 ? 2_000 : 2_001;
          const answer = container.querySelector(
            "[data-message-id='2'] .markdown p"
          );
          if (answer !== null) {
            answer.textContent = `Rich answer revision ${scrollCalls}`;
          }
        },
        scrollContainer: container
      });

      await vi.advanceTimersByTimeAsync(1_000);
      const result = await resultPromise;

      expect(scrollCalls).toBe(3);
      expect(result.scrollSteps).toBe(3);
      expect(result.messages).toHaveLength(2);
      expect(result.messages[1]?.text).toBe("Rich answer revision 3");
      expect(result.warnings).toContain(
        "Scan stopped after repeated scrolls without discovering new conversation content."
      );
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test("resets the no-new-message bound when lazy history appears", async () => {
    const document = createDocument(`<main id="chat-scroll"></main>`);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    const scrollMetrics = { clientHeight: 100, scrollHeight: 300, scrollTop: 0 };
    setScrollMetrics(container, scrollMetrics);
    renderMessages(container, ["m1|user|First user message"]);
    let scrollCalls = 0;

    const result = await collectChatGptConversation({
      document,
      maxNoNewMessageSteps: 2,
      maxSteps: 10,
      scrollBy: (element, pixels) => {
        element.scrollTop += pixels;
        scrollCalls += 1;

        if (scrollCalls === 2) {
          scrollMetrics.scrollHeight = 400;
        }

        if (scrollCalls === 4) {
          renderMessages(container, [
            "m1|user|First user message",
            "m2|assistant|Lazy assistant answer"
          ]);
        }
      },
      scrollContainer: container,
      waitForDomSettle: () => Promise.resolve()
    });

    expect(scrollCalls).toBe(4);
    expect(result.reachedBottom).toBe(true);
    expect(result.messages.map((message) => message.id)).toEqual(["m1", "m2"]);
    expect(result.warnings).not.toContain(
      "Scan stopped after repeated scrolls without discovering new conversation content."
    );
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
