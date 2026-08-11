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
        <section id="chat-scroll" style="overflow-y: auto">
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

  test("includes exact-label roleless turns in scroll-root eligibility and scoring", () => {
    const document = createDocument(`
      <main>
        <section id="roleful-scroll" style="overflow-y: auto">
          <div data-message-author-role="assistant">One roleful message</div>
        </section>
        <section id="roleless-scroll" style="overflow-y: auto">
          <article data-testid="conversation-turn-1">
            <h4 class="sr-only">ChatGPT said:</h4><p>First roleless answer</p>
          </article>
          <article data-testid="conversation-turn-2">
            <h4 class="sr-only">You said:</h4><p>Second roleless prompt</p>
          </article>
        </section>
      </main>
    `);
    const rolefulScroll = document.getElementById("roleful-scroll");
    const rolelessScroll = document.getElementById("roleless-scroll");

    if (!rolefulScroll || !rolelessScroll) {
      throw new Error("fixture missing scroll candidates");
    }

    setScrollMetrics(rolefulScroll, { clientHeight: 100, scrollHeight: 500, scrollTop: 0 });
    setScrollMetrics(rolelessScroll, { clientHeight: 100, scrollHeight: 500, scrollTop: 0 });

    expect(findChatGptScrollContainer(document)).toBe(rolelessScroll);
  });

  test("prefers the deepest nested scroll root when message scores tie", () => {
    const document = createDocument(`
      <main id="outer" style="overflow-y: auto">
        <section id="inner" style="overflow-y: scroll">
          <div data-message-author-role="assistant">Tail answer</div>
        </section>
      </main>
    `);
    const outer = document.getElementById("outer");
    const inner = document.getElementById("inner");

    if (!outer || !inner) {
      throw new Error("fixture missing nested scroll candidates");
    }

    setScrollMetrics(outer, { clientHeight: 100, scrollHeight: 500, scrollTop: 0 });
    setScrollMetrics(inner, { clientHeight: 100, scrollHeight: 500, scrollTop: 0 });

    expect(findChatGptScrollContainer(document)).toBe(inner);
  });

  test("ignores a deeper overflow-visible element with inert scroll geometry", () => {
    const document = createDocument(`
      <main id="true-scroll-root" style="overflow-y: auto">
        <section id="inert-content" style="overflow-y: visible">
          <div data-message-author-role="assistant">Hydrated answer</div>
        </section>
      </main>
    `);
    const trueScrollRoot = document.getElementById("true-scroll-root");
    const inertContent = document.getElementById("inert-content");

    if (!trueScrollRoot || !inertContent) {
      throw new Error("fixture missing overflow candidates");
    }

    setScrollMetrics(trueScrollRoot, { clientHeight: 100, scrollHeight: 500, scrollTop: 0 });
    setScrollMetrics(inertContent, { clientHeight: 100, scrollHeight: 500, scrollTop: 0 });

    expect(findChatGptScrollContainer(document)).toBe(trueScrollRoot);
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
          <article>
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
    expect(result.duplicateCount).toBe(0);
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

  test("directly hydrates 323 placeholders when 332 turns use ancestor identities", async () => {
    const turnCount = 332;
    const turnHeight = 72;
    const document = createDocument(`<main id="chat-scroll"></main>`);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    container.innerHTML = Array.from({ length: turnCount }, (_, index) => {
      const turnNumber = index + 1;
      const hydrated = index < 9;
      return `<div data-turn-id-container="logical-turn-${turnNumber}"
        style="--last-known-height: ${turnHeight}px">
        ${
          hydrated
            ? `<article data-testid="conversation-turn-${turnNumber}">
                <div data-message-author-role="${index % 2 === 0 ? "user" : "assistant"}">
                  <div class="markdown"><p>Message ${turnNumber}</p></div>
                </div>
              </article>`
            : ""
        }
      </div>`;
    }).join("");

    const wrappers = Array.from(container.querySelectorAll("[data-turn-id-container]"));
    const hydrateVisibleWindow = (scrollTop: number) => {
      const first = Math.max(0, Math.floor(scrollTop / turnHeight));
      const last = Math.min(turnCount - 1, first + 6);

      for (let index = first; index <= last; index += 1) {
        const wrapper = wrappers[index];
        if (wrapper.childElementCount > 0) {
          continue;
        }
        const turnNumber = index + 1;
        wrapper.innerHTML = `<article data-testid="conversation-turn-${turnNumber}">
          <div data-message-author-role="${index % 2 === 0 ? "user" : "assistant"}">
            <div class="markdown"><p>Message ${turnNumber}</p></div>
          </div>
        </article>`;
      }
    };

    setScrollMetrics(container, {
      clientHeight: turnHeight * 6,
      onScrollTopChange: hydrateVisibleWindow,
      scrollHeight: turnHeight * turnCount,
      scrollTop: turnHeight * 160
    });
    Object.defineProperty(container, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: turnHeight * 6,
        height: turnHeight * 6,
        left: 0,
        right: 500,
        top: 0,
        width: 500,
        x: 0,
        y: 0,
        toJSON: () => ({})
      })
    });
    wrappers.forEach((wrapper, index) => {
      Object.defineProperty(wrapper, "getBoundingClientRect", {
        configurable: true,
        value: () => ({
          bottom: (index + 1) * turnHeight - container.scrollTop,
          height: turnHeight,
          left: 0,
          right: 500,
          top: index * turnHeight - container.scrollTop,
          width: 500,
          x: 0,
          y: index * turnHeight - container.scrollTop,
          toJSON: () => ({})
        })
      });
    });

    const containerQuerySpy = vi.spyOn(container, "querySelectorAll");
    const documentQuerySpy = vi.spyOn(document, "querySelectorAll");

    try {
      const result = await collectChatGptConversation({
        document,
        scrollContainer: container,
        waitForDomSettle: () => Promise.resolve()
      });
      const fullMessageScans = containerQuerySpy.mock.calls.filter(([selector]) =>
        String(selector).includes("data-message-author-role")
      );
      const activityIndexScans = documentQuerySpy.mock.calls.filter(([selector]) =>
        String(selector).includes("activity")
      );

      expect(result.messages).toHaveLength(turnCount);
      expect(result.messages.map((message) => message.id)).toEqual(
        Array.from({ length: turnCount }, (_, index) => `conversation-turn-${index + 1}`)
      );
      expect(result.completeness.status).toBe("complete");
      expect(fullMessageScans).toHaveLength(0);
      expect(activityIndexScans).toHaveLength(1);
      expect(result.scrollSteps).toBeLessThan(turnCount);
      expect(container.scrollTop).toBe(turnHeight * 160);
    } finally {
      containerQuerySpy.mockRestore();
      documentQuerySpy.mockRestore();
    }
  });

  test("prioritizes a twice-hydrated roleless gap over buffered first-mount mutations", async () => {
    const turnCount = 332;
    const targetIndex = 313;
    const turnHeight = 72;
    const document = createDocument(`<main id="chat-scroll"></main>`);
    const container = document.getElementById("chat-scroll");
    const ownerWindow = document.defaultView;

    if (!container || ownerWindow === null) {
      throw new Error("fixture missing browser context");
    }

    const observerInstances: BufferedMutationObserver[] = [];
    class BufferedMutationObserver implements MutationObserver {
      private records: MutationRecord[] = [];
      observedTarget?: Node;

      constructor() {
        observerInstances.push(this);
      }

      disconnect(): void {
        this.records = [];
        this.observedTarget = undefined;
      }

      observe(target: Node): void {
        this.observedTarget = target;
      }

      takeRecords(): MutationRecord[] {
        const records = this.records;
        this.records = [];
        return records;
      }

      enqueueChildMount(target: Node, addedNodes: readonly Node[]): void {
        this.records.push({
          addedNodes: [...addedNodes],
          attributeName: null,
          attributeNamespace: null,
          nextSibling: null,
          oldValue: null,
          previousSibling: null,
          removedNodes: [],
          target,
          type: "childList"
        } as unknown as MutationRecord);
      }
    }

    const originalMutationObserver = ownerWindow.MutationObserver;
    Object.defineProperty(ownerWindow, "MutationObserver", {
      configurable: true,
      value: BufferedMutationObserver
    });

    try {
      container.innerHTML = Array.from({ length: turnCount }, (_, index) => {
        const turnNumber = index + 1;
        return `<div data-turn-id-container="logical-turn-${turnNumber}"
          style="--last-known-height: ${turnHeight}px"></div>`;
      }).join("");

      const wrappers = Array.from(container.querySelectorAll("[data-turn-id-container]"));
      const visitCounts = new Map<number, number>();
      const visitOrder: number[] = [];
      const hydrateTurn = (index: number) => {
        const wrapper = wrappers[index];

        if (wrapper === undefined) {
          return;
        }

        visitOrder.push(index);
        const visits = (visitCounts.get(index) ?? 0) + 1;
        visitCounts.set(index, visits);

        if (index === targetIndex && visits === 1) {
          const earlierExtractedWrapper = wrappers[0];

          earlierExtractedWrapper?.replaceChildren();
          if (earlierExtractedWrapper !== undefined) {
            observerInstances
              .find((observer) => observer.observedTarget === container)
              ?.enqueueChildMount(earlierExtractedWrapper, [document.createElement("span")]);
          }
        }

        if (wrapper.childElementCount > 0 || (index === targetIndex && visits < 2)) {
          return;
        }

        const turnNumber = index + 1;
        wrapper.innerHTML =
          index === targetIndex
            ? `<section data-testid="conversation-turn-314">
                <h4 class="sr-only select-none">ChatGPT said:</h4>
                <div class="text-base my-auto mx-auto">Second answer.</div>
              </section>`
            : `<article data-testid="conversation-turn-${turnNumber}">
                <div data-message-author-role="${index % 2 === 0 ? "user" : "assistant"}"
                  data-message-id="message-${turnNumber}">
                  <div class="markdown"><p>${
                    index === 0 && visits > 1 ? "Message 1 revised" : `Message ${turnNumber}`
                  }</p></div>
                </div>
              </article>`;

        observerInstances
          .find((observer) => observer.observedTarget === container)
          ?.enqueueChildMount(wrapper, Array.from(wrapper.childNodes));
      };

      setScrollMetrics(container, {
        clientHeight: turnHeight,
        scrollHeight: turnHeight * turnCount,
        scrollTop: turnHeight * 160
      });
      Object.defineProperty(container, "getBoundingClientRect", {
        configurable: true,
        value: () => ({
          bottom: turnHeight,
          height: turnHeight,
          left: 0,
          right: 500,
          top: 0,
          width: 500,
          x: 0,
          y: 0,
          toJSON: () => ({})
        })
      });
      wrappers.forEach((wrapper, index) => {
        Object.defineProperty(wrapper, "getBoundingClientRect", {
          configurable: true,
          value: () => ({
            bottom: (index + 1) * turnHeight - container.scrollTop,
            height: turnHeight,
            left: 0,
            right: 500,
            top: index * turnHeight - container.scrollTop,
            width: 500,
            x: 0,
            y: index * turnHeight - container.scrollTop,
            toJSON: () => ({})
          })
        });
      });

      const result = await collectChatGptConversation({
        document,
        scrollBy: (element, pixels) => {
          element.scrollTop += pixels;
          const target = Math.max(
            0,
            Math.min(turnCount - 1, Math.round((element.scrollTop + turnHeight * 0.1) / turnHeight))
          );
          hydrateTurn(target);
        },
        scrollContainer: container,
        waitForDomSettle: () => Promise.resolve()
      });

      expect(visitCounts.get(targetIndex)).toBe(2);
      expect(visitOrder[turnCount]).toBe(targetIndex);
      expect(result.messages).toHaveLength(turnCount);
      expect(result.messages.map((message) => message.id)).toEqual(
        Array.from({ length: turnCount }, (_, index) =>
          index === targetIndex ? "conversation-turn-314" : `message-${index + 1}`
        )
      );
      expect(result.messages[0]?.text).toBe("Message 1 revised");
      expect(result.duplicateCount).toBe(0);
      expect(result.completeness.status).toBe("complete");
      expect(result.warnings).toEqual([]);
    } finally {
      Object.defineProperty(ownerWindow, "MutationObserver", {
        configurable: true,
        value: originalMutationObserver
      });
    }
  }, 15_000);

  test("extracts exact accessible-label roleless turns without leaving them missing", async () => {
    const document = createDocument(`
      <main id="chat-scroll">
        <div data-turn-id-container="logical-turn-306"
          class="h-[var(--last-known-height,var(--estimated-turn-height,50vh))] min-h-14">
          <section data-testid="conversation-turn-306">
            <h4 class="sr-only select-none">ChatGPT said:</h4>
            <div class="text-base my-auto mx-auto">First roleless assistant answer.</div>
            <span class="sr-only">End of response</span>
          </section>
        </div>
        <div data-turn-id-container="logical-turn-314"
          class="h-[var(--last-known-height,var(--estimated-turn-height,50vh))] min-h-14">
          <section data-testid="conversation-turn-314">
            <h4 class="sr-only select-none"> ChatGPT   said: </h4>
            <div class="text-base my-auto mx-auto">Second answer.</div>
            <span class="sr-only">End of response</span>
          </section>
        </div>
      </main>
    `);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    setScrollMetrics(container, { clientHeight: 200, scrollHeight: 200, scrollTop: 0 });
    const result = await collectChatGptConversation({
      document,
      scrollContainer: container,
      waitForDomSettle: () => Promise.resolve()
    });

    expect(result.messages).toMatchObject([
      {
        id: "conversation-turn-306",
        role: "assistant",
        text: "First roleless assistant answer."
      },
      {
        id: "conversation-turn-314",
        role: "assistant",
        text: "Second answer."
      }
    ]);
    expect(result.messages.every((message) => !message.text.includes("ChatGPT said:"))).toBe(true);
    expect(result.completeness.status).toBe("complete");
    expect(result.warnings).toEqual([]);
  });

  test("re-extracts the final mounted window after the last quiet pass", async () => {
    const document = createDocument(`
      <main id="chat-scroll">
        <div data-turn-id-container="logical-turn-1" style="--last-known-height: 100px">
          <article data-testid="conversation-turn-1">
            <div data-message-author-role="user" data-message-id="m1"><p>First</p></div>
          </article>
        </div>
        <div data-turn-id-container="logical-turn-2" style="--last-known-height: 100px">
          <article data-testid="conversation-turn-2">
            <div data-message-author-role="assistant" data-message-id="m2"><p>Second</p></div>
          </article>
        </div>
      </main>
    `);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    let bottomMounts = 0;
    setScrollMetrics(container, {
      clientHeight: 100,
      onScrollTopChange: (scrollTop) => {
        if (scrollTop !== 100) {
          return;
        }

        bottomMounts += 1;
        container
          .querySelector("[data-turn-id-container='logical-turn-2']")
          ?.insertAdjacentHTML("beforeend", `<span aria-label="mounted-${bottomMounts}"></span>`);
      },
      scrollHeight: 200,
      scrollTop: 0
    });

    const result = await collectChatGptConversation({
      document,
      scrollContainer: container,
      waitForDomSettle: () => Promise.resolve()
    });

    expect(bottomMounts).toBe(2);
    expect(result.messages.map((message) => message.id)).toEqual(["m1", "m2"]);
    expect(result.completeness.status).toBe("complete");
    expect(result.warnings).not.toContain(
      "ChatGPT changed extracted turns before the final quiet pass completed."
    );
  });

  test("waits for target-local exportable content after UI-only turn chrome", async () => {
    vi.useFakeTimers();

    try {
      const document = createDocument(`
        <main id="chat-scroll">
          ${Array.from({ length: 4 }, (_, index) => {
            const turnNumber = index + 1;
            return `<div data-turn-id-container="logical-turn-${turnNumber}"
              style="--last-known-height: 100px">
              <article data-testid="conversation-turn-${turnNumber}">
                <div data-message-author-role="user" data-message-id="m${turnNumber}">
                  <div class="markdown"><p>Message ${turnNumber}</p></div>
                </div>
              </article>
            </div>`;
          }).join("")}
          <div data-turn-id-container="logical-turn-5" style="--last-known-height: 100px">
            <article data-testid="conversation-turn-5">
              <div data-message-author-role="assistant" data-message-id="m5">
                <span class="screen-reader-user-query-label">Assistant response</span>
                <button type="button">Copy</button>
              </div>
            </article>
          </div>
        </main>
      `);
      const container = document.getElementById("chat-scroll");

      if (!container) {
        throw new Error("fixture missing chat-scroll");
      }

      let scrollAssignments = 0;
      let finalContentScheduled = false;
      setScrollMetrics(container, {
        clientHeight: 100,
        onScrollTopChange: () => {
          scrollAssignments += 1;
          if (scrollAssignments !== 2 || finalContentScheduled) {
            return;
          }
          finalContentScheduled = true;
          globalThis.setTimeout(() => {
            const message = container.querySelector("[data-message-id='m5']");
            message?.insertAdjacentHTML(
              "beforeend",
              `<div class="markdown"><p>Hydrated final answer</p></div>`
            );
          }, 250);
        },
        scrollHeight: 100,
        scrollTop: 0
      });

      let settled = false;
      const resultPromise = collectChatGptConversation({
        document,
        scrollContainer: container
      }).then((result) => {
        settled = true;
        return result;
      });

      await vi.advanceTimersByTimeAsync(350);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1_000);

      const result = await resultPromise;
      expect(result.messages).toHaveLength(5);
      expect(result.messages[4]).toMatchObject({
        id: "m5",
        text: "Hydrated final answer"
      });
      expect(result.completeness.status).toBe("complete");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  test("indexes activity panels that mount while a target turn hydrates", async () => {
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
    let hydrated = false;
    const result = await collectChatGptConversation({
      document,
      scrollBy: (element, pixels) => {
        element.scrollTop += pixels;
        if (hydrated) {
          return;
        }
        hydrated = true;
        const target = container.querySelector("[data-turn-id-container='logical-turn-2']");
        if (target !== null) {
          target.innerHTML = `<article data-testid="conversation-turn-2">
            <div data-message-author-role="assistant" data-message-id="m2">
              <div class="markdown"><p>Second</p></div>
            </div>
          </article>`;
        }
        document.body.insertAdjacentHTML(
          "beforeend",
          `<aside data-jelluvi-advanced-kind="activity" data-message-id="m2">
            <h3>Activity</h3><p>Loaded linked result.</p>
          </aside>`
        );
      },
      scrollContainer: container,
      waitForDomSettle: () => Promise.resolve()
    });

    expect(result.messages[1]?.thinkingBlocks).toEqual([
      { title: "Activity", text: "Loaded linked result." }
    ]);
  });

  test("cancels a 332-turn direct traversal and clears its watchdog timers", async () => {
    vi.useFakeTimers();

    try {
      const document = createDocument(`<main id="chat-scroll"></main>`);
      const container = document.getElementById("chat-scroll");
      const controller = new AbortController();

      if (!container) {
        throw new Error("fixture missing chat-scroll");
      }

      container.innerHTML = Array.from(
        { length: 332 },
        (_, index) =>
          `<div data-turn-id-container="logical-turn-${index + 1}"
          style="--last-known-height: 100px">${
            index === 0
              ? `<article data-testid="conversation-turn-1">
                  <div data-message-author-role="user" data-message-id="m1">
                    <div class="markdown"><p>First</p></div>
                  </div>
                </article>`
              : ""
          }</div>`
      ).join("");
      setScrollMetrics(container, { clientHeight: 100, scrollHeight: 33_200, scrollTop: 0 });

      const result = await collectChatGptConversation({
        document,
        scrollBy: () => controller.abort(),
        scrollContainer: container,
        signal: controller.signal,
        waitForDomSettle: () => Promise.resolve()
      });

      expect(result.aborted).toBe(true);
      expect(result.completeness.status).toBe("partial");
      expect(result.warnings).toContain("Scan was cancelled.");
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
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
    expect(result.completeness.status).toBe("partial");
    expect(result.completeness.warnings).toContain(
      "ChatGPT did not hydrate 1 conversation turn before the scan timeout."
    );
    expect(result.completeness.warnings).toContain(
      "Platform virtualization may hide unloaded messages."
    );
  });

  test("keeps newly discovered missing turns fail-closed across completion passes", async () => {
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
          const missingTurn = container.querySelector("[data-turn-id-container='logical-turn-2']");
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

    expect(waitCalls).toBe(5);
    expect(result.messages.map((message) => message.id)).toEqual(["m1", "m2"]);
    expect(result.scrollSteps).toBe(4);
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
      expect(settled).toBe(true);

      const result = await resultPromise;
      const fullTurnInventoryScans = querySelectorAllSpy.mock.calls.filter(
        ([selector]) => selector === "[data-turn-id-container]"
      );

      expect(result.aborted).toBe(false);
      expect(result.messages.map((message) => message.id)).toEqual(["m1", "m2"]);
      expect(result.warnings).toContain(
        "ChatGPT turn traversal stopped at its bounded wall-clock budget."
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
              `<article data-testid="conversation-turn-3">
                <h4 class="sr-only">ChatGPT said:</h4>
                <div class="loading"></div>
              </article>`
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

  test("treats a substantive exact-label roleless final turn as hydrated", async () => {
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
      let finalTurnMounted = false;
      const resultPromise = collectChatGptConversation({
        document,
        scrollBy: (element, pixels) => {
          element.scrollTop += pixels;

          if (!finalTurnMounted && element.scrollTop >= 200) {
            finalTurnMounted = true;
            container.insertAdjacentHTML(
              "beforeend",
              `<article data-testid="conversation-turn-3">
                <h4 class="sr-only">ChatGPT said:</h4>
                <div class="text-base"><p>Hydrated roleless final answer</p></div>
              </article>`
            );
          }
        },
        scrollContainer: container
      });

      await vi.advanceTimersByTimeAsync(3_600);

      const result = await resultPromise;
      expect(result.messages.map((message) => message.id)).toEqual([
        "1",
        "2",
        "conversation-turn-3"
      ]);
      expect(result.messages.at(-1)).toMatchObject({
        role: "assistant",
        text: "Hydrated roleless final answer"
      });
      expect(result.completeness.warnings).not.toContain(
        "ChatGPT's final turn window did not finish loading before the scan timeout."
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
          const answer = container.querySelector("[data-message-id='2'] .markdown p");
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
