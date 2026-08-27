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
  test("produces identical ordered ids and content hashes across three repeated scans", async () => {
    const document = createDocument(`
      <main id="chat-scroll">
        <div data-turn-id-container="logical-turn-1" style="--last-known-height: 120px">
          <article data-testid="conversation-turn-1">
            <div data-message-author-role="user" data-message-id="m1">
              <div class="markdown"><p>First prompt</p></div>
            </div>
          </article>
        </div>
        <div data-turn-id-container="logical-turn-2" style="--last-known-height: 120px">
          <article data-testid="conversation-turn-2">
            <div data-message-author-role="assistant" data-message-id="m2">
              <div class="markdown"><p>Stable answer</p></div>
            </div>
          </article>
        </div>
      </main>
    `);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    setScrollMetrics(container, { clientHeight: 200, scrollHeight: 200, scrollTop: 0 });
    const runs = [];
    for (let index = 0; index < 3; index += 1) {
      runs.push(
        await collectChatGptConversation({
          document,
          scrollContainer: container,
          waitForDomSettle: () => Promise.resolve()
        })
      );
    }

    const snapshots = runs.map((run) => ({
      hashes: run.completeness.messageContentHashes,
      ids: run.messages.map((message) => message.id)
    }));
    expect(snapshots[0]).toEqual({
      hashes: expect.arrayContaining([
        expect.stringMatching(/^user:h/u),
        expect.stringMatching(/^assistant:h/u)
      ]),
      ids: ["m1", "m2"]
    });
    expect(snapshots[1]).toEqual(snapshots[0]);
    expect(snapshots[2]).toEqual(snapshots[0]);
    expect(runs.every((run) => run.completeness.status === "complete")).toBe(true);
    expect(
      runs.every((run) => run.completeness.capturePhases?.join(",") === "inventory,capture,verify")
    ).toBe(true);
  });

  test("hydrates a scroll-anchored top boundary before the first capture pass", async () => {
    const document = createDocument(`<main id="chat-scroll"></main>`);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    const renderRange = (firstTurn: number) => {
      container.innerHTML = Array.from({ length: 21 - firstTurn }, (_, index) => {
        const turnNumber = firstTurn + index;
        const role = turnNumber % 2 === 0 ? "assistant" : "user";
        return `
          <div data-turn-id-container="logical-turn-${turnNumber}" style="--last-known-height: 100px">
            <article data-testid="conversation-turn-${turnNumber}">
              <div data-message-author-role="${role}" data-message-id="m${turnNumber}">
                <div class="markdown"><p>Message ${turnNumber}</p></div>
              </div>
            </article>
          </div>
        `;
      }).join("");
    };

    renderRange(11);
    let applyingScrollAnchor = false;
    let topLoads = 0;
    setScrollMetrics(container, {
      clientHeight: 100,
      onScrollTopChange: (scrollTop, previousScrollTop) => {
        if (
          applyingScrollAnchor ||
          scrollTop !== 0 ||
          previousScrollTop <= 0 ||
          previousScrollTop > 100
        ) {
          return;
        }

        topLoads += 1;
        if (topLoads === 1) {
          renderRange(6);
        } else if (topLoads === 2) {
          renderRange(1);
        } else {
          return;
        }

        applyingScrollAnchor = true;
        container.scrollTop = 100;
        applyingScrollAnchor = false;
      },
      scrollHeight: 1100,
      scrollTop: 1000
    });

    const extractionScrollTops: number[] = [];
    const result = await collectChatGptConversation({
      document,
      extractMessages: () => {
        extractionScrollTops.push(container.scrollTop);
        return undefined;
      },
      maxSteps: 200,
      scrollContainer: container,
      waitForDomSettle: () => Promise.resolve()
    });

    expect(topLoads).toBeGreaterThanOrEqual(2);
    expect(extractionScrollTops[0]).toBe(0);
    expect(result.messages.map((message) => message.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => `m${index + 1}`)
    );
    expect(result.completeness).toMatchObject({
      knownTurnCount: 20,
      missingTurnIds: [],
      reachedTop: true,
      status: "complete"
    });
  });

  test("waits for delayed prepend batches even when each lazy window is renumbered from one", async () => {
    vi.useFakeTimers();

    try {
      const document = createDocument(`<main id="chat-scroll"></main>`);
      const container = document.getElementById("chat-scroll");

      if (!container) {
        throw new Error("fixture missing chat-scroll");
      }

      const renderRange = (firstTurn: number) => {
        container.innerHTML = Array.from({ length: 13 - firstTurn }, (_, index) => {
          const messageNumber = firstTurn + index;
          const role = messageNumber % 2 === 0 ? "assistant" : "user";
          return `
            <div data-turn-id-container="logical-turn-${messageNumber}" style="--last-known-height: 100px">
              <article data-testid="conversation-turn-${index + 1}">
                <div data-message-author-role="${role}" data-message-id="m${messageNumber}">
                  <div class="markdown"><p>Message ${messageNumber}</p></div>
                </div>
              </article>
            </div>
          `;
        }).join("");
      };

      renderRange(9);
      let applyingScrollAnchor = false;
      let loadPending = false;
      let loadedBatchCount = 0;
      setScrollMetrics(container, {
        clientHeight: 100,
        onScrollTopChange: (scrollTop, previousScrollTop) => {
          if (
            applyingScrollAnchor ||
            loadPending ||
            loadedBatchCount >= 2 ||
            scrollTop !== 0 ||
            previousScrollTop <= 0
          ) {
            return;
          }

          loadPending = true;
          globalThis.setTimeout(() => {
            loadedBatchCount += 1;
            renderRange(loadedBatchCount === 1 ? 5 : 1);
            applyingScrollAnchor = true;
            container.scrollTop = 100;
            applyingScrollAnchor = false;
            loadPending = false;
          }, 500);
        },
        scrollHeight: 200,
        scrollTop: 100
      });

      const firstExtractedIds: string[] = [];
      const resultPromise = collectChatGptConversation({
        document,
        extractMessages: () => {
          const firstMessageId = container
            .querySelector("[data-message-id]")
            ?.getAttribute("data-message-id");
          if (firstMessageId !== null && firstMessageId !== undefined) {
            firstExtractedIds.push(firstMessageId);
          }
          return undefined;
        },
        maxSteps: 100,
        scrollContainer: container
      });

      await vi.advanceTimersByTimeAsync(60_000);
      const result = await resultPromise;

      expect(loadedBatchCount).toBe(2);
      expect(firstExtractedIds[0]).toBe("m1");
      expect(result.messages.map((message) => message.id)).toEqual(
        Array.from({ length: 12 }, (_, index) => `m${index + 1}`)
      );
      expect(result.completeness).toMatchObject({
        knownTurnCount: 12,
        missingTurnIds: [],
        reachedTop: true,
        status: "complete"
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test("re-enters the top boundary from beyond the viewport before accepting it as stable", async () => {
    vi.useFakeTimers();

    try {
      const document = createDocument(`<main id="chat-scroll"></main>`);
      const container = document.getElementById("chat-scroll");

      if (!container) {
        throw new Error("fixture missing chat-scroll");
      }

      const renderRange = (firstMessage: number) => {
        container.innerHTML = Array.from({ length: 13 - firstMessage }, (_, index) => {
          const messageNumber = firstMessage + index;
          const role = messageNumber % 2 === 0 ? "assistant" : "user";
          return `
            <div data-turn-id-container="logical-turn-${messageNumber}" style="--last-known-height: 100px">
              <article data-testid="conversation-turn-${index + 1}">
                <div data-message-author-role="${role}" data-message-id="m${messageNumber}">
                  <div class="markdown"><p>Message ${messageNumber}</p></div>
                </div>
              </article>
            </div>
          `;
        }).join("");
      };

      renderRange(9);
      let applyingScrollAnchor = false;
      let furthestScrollTop = 0;
      let loadedBatchCount = 0;
      let topSentinelExited = false;
      setScrollMetrics(container, {
        clientHeight: 100,
        onScrollTopChange: (scrollTop, previousScrollTop) => {
          furthestScrollTop = Math.max(furthestScrollTop, scrollTop);
          if (applyingScrollAnchor) {
            return;
          }

          if (scrollTop >= 150) {
            topSentinelExited = true;
            return;
          }

          if (!topSentinelExited || scrollTop !== 0 || previousScrollTop <= 0) {
            return;
          }

          topSentinelExited = false;
          if (loadedBatchCount >= 2) {
            return;
          }

          loadedBatchCount += 1;
          renderRange(loadedBatchCount === 1 ? 5 : 1);
          applyingScrollAnchor = true;
          container.scrollTop = 100;
          applyingScrollAnchor = false;
        },
        scrollHeight: 300,
        scrollTop: 0
      });

      const resultPromise = collectChatGptConversation({
        document,
        maxSteps: 100,
        scrollContainer: container
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(furthestScrollTop).toBeGreaterThanOrEqual(200);
      expect(loadedBatchCount).toBe(2);
      expect(result.messages.map((message) => message.id)).toEqual(
        Array.from({ length: 12 }, (_, index) => `m${index + 1}`)
      );
      expect(result.completeness).toMatchObject({
        knownTurnCount: 12,
        missingTurnIds: [],
        reachedTop: true,
        status: "complete"
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test("preloads anchored top batches before traversing downward without returning to the top", async () => {
    const document = createDocument(`<main id="chat-scroll"></main>`);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    const renderRange = (firstTurn: number) => {
      container.innerHTML = Array.from({ length: 21 - firstTurn }, (_, index) => {
        const turnNumber = firstTurn + index;
        const role = turnNumber % 2 === 0 ? "assistant" : "user";
        return `
          <div data-turn-id-container="logical-turn-${turnNumber}" style="--last-known-height: 100px">
            <div data-message-author-role="${role}" data-message-id="m${turnNumber}">
              <div class="markdown"><p>Message ${turnNumber}</p></div>
            </div>
          </div>
        `;
      }).join("");
    };

    renderRange(11);
    let applyingScrollAnchor = false;
    let captureStarted = false;
    let topTransitions = 0;
    let upwardTransitionsAfterCapture = 0;
    setScrollMetrics(container, {
      clientHeight: 100,
      onScrollTopChange: (scrollTop, previousScrollTop) => {
        if (captureStarted && scrollTop < previousScrollTop) {
          upwardTransitionsAfterCapture += 1;
        }

        if (applyingScrollAnchor || scrollTop !== 0 || previousScrollTop <= 0) {
          return;
        }

        topTransitions += 1;
        if (topTransitions === 1) {
          renderRange(6);
        } else if (topTransitions === 2) {
          renderRange(1);
        } else {
          return;
        }

        applyingScrollAnchor = true;
        container.scrollTop = 100;
        applyingScrollAnchor = false;
      },
      scrollHeight: 300,
      scrollTop: 200
    });

    const result = await collectChatGptConversation({
      document,
      extractMessages: () => {
        captureStarted = true;
        return undefined;
      },
      maxSteps: 200,
      scrollContainer: container,
      waitForDomSettle: () => Promise.resolve()
    });

    expect(result.messages.map((message) => message.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => `m${index + 1}`)
    );
    expect(result.completeness).toMatchObject({
      knownTurnCount: 20,
      missingTurnIds: [],
      reachedBottom: true,
      reachedTop: true,
      status: "complete"
    });
    expect(result.completeness.capturePhases).toEqual(["inventory", "capture", "verify"]);
    expect(topTransitions).toBe(3);
    expect(upwardTransitionsAfterCapture).toBe(0);
  });

  test("orders disjoint virtual turn windows during one monotonic downward traversal", async () => {
    const document = createDocument(`<main id="chat-scroll"></main>`);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    const renderRange = (firstTurn: number, lastTurn: number) => {
      container.innerHTML = Array.from({ length: lastTurn - firstTurn + 1 }, (_, index) => {
        const turnNumber = firstTurn + index;
        const role = turnNumber % 2 === 0 ? "assistant" : "user";
        return `
          <div data-turn-id-container="logical-turn-${turnNumber}" style="--last-known-height: 100px">
            <div data-message-author-role="${role}" data-message-id="m${turnNumber}">
              <div class="markdown"><p>Message ${turnNumber}</p></div>
            </div>
          </div>
        `;
      }).join("");
    };

    renderRange(11, 20);
    let applyingScrollAnchor = false;
    let captureStarted = false;
    let topTransitions = 0;
    let upwardTransitionsAfterCapture = 0;
    setScrollMetrics(container, {
      clientHeight: 100,
      onScrollTopChange: (scrollTop, previousScrollTop) => {
        if (captureStarted && scrollTop < previousScrollTop) {
          upwardTransitionsAfterCapture += 1;
        }

        if (applyingScrollAnchor) {
          return;
        }

        if (scrollTop === 0 && previousScrollTop > 0) {
          topTransitions += 1;
          if (topTransitions === 1) {
            renderRange(6, 10);
          } else if (topTransitions === 2) {
            renderRange(1, 5);
          } else {
            return;
          }

          applyingScrollAnchor = true;
          container.scrollTop = 100;
          applyingScrollAnchor = false;
          return;
        }

        if (!captureStarted) {
          return;
        }

        if (scrollTop > 0 && scrollTop < 100) {
          renderRange(6, 10);
        } else if (scrollTop >= 100 && scrollTop < 200) {
          renderRange(11, 15);
        } else if (scrollTop >= 200) {
          renderRange(16, 20);
        }
      },
      scrollHeight: 300,
      scrollTop: 200
    });

    const result = await collectChatGptConversation({
      document,
      extractMessages: () => {
        captureStarted = true;
        return undefined;
      },
      maxSteps: 200,
      scrollContainer: container,
      waitForDomSettle: () => Promise.resolve()
    });

    expect(result.messages.map((message) => message.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => `m${index + 1}`)
    );
    expect(result.completeness).toMatchObject({
      knownTurnCount: 20,
      missingTurnIds: [],
      status: "complete"
    });
    expect(upwardTransitionsAfterCapture).toBe(0);
  });

  test("reconciles previously discovered keys to the latest complete DOM order", async () => {
    const document = createDocument(`
      <main id="chat-scroll">
        <div data-turn-id-container="logical-turn-3">
          <div data-message-author-role="user" data-message-id="m3">Message 3</div>
        </div>
        <div data-turn-id-container="logical-turn-1">
          <div data-message-author-role="user" data-message-id="m1">Message 1</div>
        </div>
        <div data-turn-id-container="logical-turn-2">
          <div data-message-author-role="assistant" data-message-id="m2">Message 2</div>
        </div>
      </main>
    `);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    setScrollMetrics(container, { clientHeight: 100, scrollHeight: 100, scrollTop: 0 });
    let waitCount = 0;
    const result = await collectChatGptConversation({
      document,
      scrollContainer: container,
      waitForDomSettle: () => {
        waitCount += 1;
        if (waitCount === 2) {
          ["logical-turn-1", "logical-turn-2", "logical-turn-3"].forEach((logicalKey) => {
            const turn = container.querySelector(`[data-turn-id-container="${logicalKey}"]`);
            if (turn) {
              container.append(turn);
            }
          });
        }
        return Promise.resolve();
      }
    });

    expect(result.messages.map((message) => message.id)).toEqual(["m1", "m2", "m3"]);
    expect(result.completeness.status).toBe("complete");
  });

  test("prefers the final DOM skeleton over transient ChatGPT turn ordinals", async () => {
    const document = createDocument(`
      <main id="chat-scroll">
        <div data-turn-id-container="logical-turn-1">
          <article data-testid="conversation-turn-2">
            <div data-message-author-role="user" data-message-id="m1">Message 1</div>
          </article>
        </div>
        <div data-turn-id-container="logical-turn-2">
          <article data-testid="conversation-turn-3">
            <div data-message-author-role="assistant" data-message-id="m2">Message 2</div>
          </article>
        </div>
        <div data-turn-id-container="logical-turn-3">
          <article data-testid="conversation-turn-1">
            <div data-message-author-role="user" data-message-id="m3">Message 3</div>
          </article>
        </div>
      </main>
    `);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    setScrollMetrics(container, { clientHeight: 100, scrollHeight: 100, scrollTop: 0 });
    const result = await collectChatGptConversation({
      document,
      scrollContainer: container,
      waitForDomSettle: () => Promise.resolve()
    });

    expect(result.messages.map((message) => message.id)).toEqual(["m1", "m2", "m3"]);
  });

  test("uses native scrollIntoView to hydrate a missing virtual turn", async () => {
    const document = createDocument(`
      <main id="chat-scroll">
        <div data-turn-id-container="logical-turn-1">
          <section data-testid="conversation-turn-1" data-turn="user">
            <div data-message-author-role="user" data-message-id="m1">Message 1</div>
          </section>
        </div>
        <div
          data-turn-id-container="logical-turn-2"
          data-is-intersecting="false"
          style="--last-known-height: 120px"
        ></div>
      </main>
    `);
    const container = document.getElementById("chat-scroll");
    const placeholder = container?.querySelector<HTMLElement>(
      '[data-turn-id-container="logical-turn-2"]'
    );

    if (!container || !placeholder) {
      throw new Error("fixture missing virtual turn");
    }

    const scrollIntoView = vi.fn(() => {
      placeholder.setAttribute("data-is-intersecting", "true");
      placeholder.innerHTML = `
        <section data-testid="conversation-turn-2" data-turn="assistant">
          <div data-message-author-role="assistant" data-message-id="m2">Message 2</div>
        </section>
      `;
    });
    placeholder.scrollIntoView = scrollIntoView;
    setScrollMetrics(container, { clientHeight: 100, scrollHeight: 200, scrollTop: 0 });

    const result = await collectChatGptConversation({
      document,
      maxSteps: 100,
      scrollContainer: container,
      waitForDomSettle: () => Promise.resolve()
    });

    expect(scrollIntoView).toHaveBeenCalled();
    expect(result.messages.map((message) => message.id)).toEqual(["m1", "m2"]);
    expect(result.completeness).toMatchObject({
      missingTurnIds: [],
      status: "complete"
    });
  });

  test("stays partial when a lazily expanding turn inventory never stabilizes", async () => {
    const document = createDocument(`<main id="chat-scroll"></main>`);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    let firstTurn = 101;
    const renderRange = () => {
      container.innerHTML = Array.from({ length: 111 - firstTurn }, (_, index) => {
        const turnNumber = firstTurn + index;
        const role = turnNumber % 2 === 0 ? "assistant" : "user";
        return `
          <div data-turn-id-container="logical-turn-${turnNumber}" style="--last-known-height: 100px">
            <div data-message-author-role="${role}" data-message-id="m${turnNumber}">
              <div class="markdown"><p>Message ${turnNumber}</p></div>
            </div>
          </div>
        `;
      }).join("");
    };

    renderRange();
    let applyingScrollAnchor = false;
    setScrollMetrics(container, {
      clientHeight: 100,
      onScrollTopChange: (scrollTop, previousScrollTop) => {
        if (!applyingScrollAnchor && scrollTop === 0 && previousScrollTop > 0) {
          firstTurn -= 1;
          renderRange();
          applyingScrollAnchor = true;
          container.scrollTop = 100;
          applyingScrollAnchor = false;
        }
      },
      scrollHeight: 300,
      scrollTop: 200
    });

    const result = await collectChatGptConversation({
      document,
      maxSteps: 20,
      scrollContainer: container,
      waitForDomSettle: () => Promise.resolve()
    });

    expect(result.completeness.status).toBe("partial");
    expect(result.completeness.reachedTop).toBe(false);
    expect(result.completeness.warnings).toContain(
      "ChatGPT's virtual turn inventory did not stabilize before the scan limit."
    );
  });

  test("runs a monotonic capture sweep when only sparse turn windows are mounted", async () => {
    const document = createDocument(`<main id="chat-scroll"></main>`);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    const renderWindow = (turnNumbers: readonly number[]) => {
      container.innerHTML = turnNumbers
        .map(
          (turnNumber) => `
            <div data-turn-id-container="logical-turn-${turnNumber}" style="--last-known-height: 100px">
              <article data-testid="conversation-turn-${turnNumber}">
                <div data-message-author-role="${turnNumber % 2 === 0 ? "assistant" : "user"}" data-message-id="m${turnNumber}">
                  <div class="markdown"><p>Message ${turnNumber}</p></div>
                </div>
              </article>
            </div>
          `
        )
        .join("");
    };
    const updateMountedWindow = (scrollTop: number) => {
      if (scrollTop < 75) {
        renderWindow([1, 2]);
      } else if (scrollTop < 175) {
        renderWindow([3, 4]);
      } else {
        renderWindow([5, 6]);
      }
    };

    renderWindow([1, 2]);
    setScrollMetrics(container, {
      clientHeight: 100,
      onScrollTopChange: updateMountedWindow,
      scrollHeight: 300,
      scrollTop: 0
    });

    const phases: string[] = [];
    const result = await collectChatGptConversation({
      document,
      maxSteps: 30,
      onProgress: (progress) => phases.push(progress.phase),
      scrollContainer: container,
      waitForDomSettle: () => Promise.resolve()
    });

    expect(result.messages.map((message) => message.id)).toEqual([
      "m1",
      "m2",
      "m3",
      "m4",
      "m5",
      "m6"
    ]);
    expect(result.completeness).toMatchObject({
      knownTurnCount: 6,
      missingTurnIds: [],
      status: "complete"
    });
    expect(result.completeness.capturePhases).toEqual(["inventory", "capture", "verify"]);
    expect(phases).not.toContain("recheck");
  });

  test("opens collapsed reasoning disclosures sequentially before extraction", async () => {
    const document = createDocument(`
      <main id="chat-scroll">
        <div data-turn-id-container="logical-turn-1" style="--last-known-height: 120px">
          <article data-testid="conversation-turn-1">
            <div data-message-author-role="assistant" data-message-id="m1">
              <button aria-controls="activity-panel" aria-expanded="false">Thought for 2m 46s</button>
              <div class="markdown"><p>Final answer</p></div>
            </div>
          </article>
        </div>
      </main>
    `);
    const container = document.getElementById("chat-scroll");
    const control = document.querySelector<HTMLButtonElement>("button[aria-controls]");

    if (!container || !control) {
      throw new Error("fixture missing reasoning disclosure");
    }

    let clickCount = 0;
    control.addEventListener("click", () => {
      clickCount += 1;
      const expanded = control.getAttribute("aria-expanded") !== "true";
      control.setAttribute("aria-expanded", String(expanded));
      if (expanded && document.getElementById("activity-panel") === null) {
        const panel = document.createElement("section");
        panel.id = "activity-panel";
        panel.setAttribute("data-jelluvi-advanced-kind", "activity");
        panel.innerHTML = "<h3>Activity</h3><p>Loaded linked reasoning details.</p>";
        control.closest("article")?.append(panel);
      }
    });
    setScrollMetrics(container, { clientHeight: 120, scrollHeight: 120, scrollTop: 0 });

    const result = await collectChatGptConversation({
      document,
      scrollContainer: container,
      waitForDomSettle: () => Promise.resolve()
    });

    expect(result.messages[0]).toMatchObject({
      reasoningSummary: { durationSeconds: 166, label: "Thought for 2m 46s" },
      thinkingBlocks: [{ text: "Loaded linked reasoning details.", title: "Activity" }]
    });
    expect(clickCount).toBe(2);
    expect(control.getAttribute("aria-expanded")).toBe("false");
  });

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
    expect(result.completeness.status).toBe("partial");
    expect(result.completeness.knownTurnCount).toBe(2);
    expect(result.completeness.missingTurnIds).toEqual(["logical-turn-2"]);
    expect(result.completeness.warnings).toContain(
      "ChatGPT did not hydrate 1 conversation turn before the scan timeout."
    );
    expect(result.completeness.warnings).toContain(
      "Platform virtualization may hide unloaded messages."
    );
  });

  test("resolves an intersecting mounted empty assistant tombstone", async () => {
    const document = createDocument(`
      <main id="chat-scroll">
        <div data-turn-id-container="logical-turn-1" style="--last-known-height: 100px">
          <article data-testid="conversation-turn-1">
            <div data-message-author-role="user" data-message-id="m1">
              <div class="markdown"><p>First</p></div>
            </div>
          </article>
        </div>
        <div
          data-is-intersecting="true"
          data-turn-id-container="logical-turn-2"
          style="--estimated-turn-height: 144px"
        >
          <section
            data-testid="conversation-turn-2"
            data-turn="assistant"
            data-turn-id-container="logical-turn-2"
          >
            <h4 class="sr-only">ChatGPT said:</h4>
            <div class="agent-turn"><div class="grow"></div></div>
            <span class="sr-only"><br /></span>
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

    expect(result.messages.map((message) => message.id)).toEqual(["m1"]);
    expect(result.completeness).toMatchObject({
      knownTurnCount: 2,
      missingTurnIds: [],
      status: "complete"
    });
    expect(result.completeness.warnings).not.toContain(
      "Platform virtualization may hide unloaded messages."
    );
  });

  test("reconciles a stale placeholder id after ChatGPT rebuilds the turn inventory", async () => {
    const document = createDocument(`
      <main id="chat-scroll">
        <div data-turn-id-container="logical-turn-2" style="--last-known-height: 100px">
          <article data-testid="conversation-turn-2">
            <div data-message-author-role="assistant" data-message-id="m2">
              <div class="markdown"><p>Second</p></div>
            </div>
          </article>
        </div>
        <div data-turn-id-container="stale-placeholder" style="--estimated-turn-height: 100px"></div>
      </main>
    `);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    setScrollMetrics(container, {
      clientHeight: 100,
      onScrollTopChange: (scrollTop, previousScrollTop) => {
        if (previousScrollTop > 0 && scrollTop === 0) {
          container.innerHTML = `
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
          `;
        }
      },
      scrollHeight: 200,
      scrollTop: 100
    });

    const result = await collectChatGptConversation({
      document,
      maxSteps: 20,
      scrollContainer: container,
      waitForDomSettle: () => Promise.resolve()
    });

    expect(result.messages.map((message) => message.id)).toEqual(["m1", "m2"]);
    expect(result.completeness).toMatchObject({
      knownTurnCount: 2,
      missingTurnIds: [],
      status: "complete"
    });
  });

  test("drops a repeatedly observed stale key after a complete ordinal skeleton replaces it", async () => {
    const document = createDocument(`
      <main id="chat-scroll">
        <div data-turn-id-container="logical-turn-2" style="--last-known-height: 100px">
          <article data-testid="conversation-turn-2">
            <div data-message-author-role="assistant" data-message-id="m2">Second</div>
          </article>
        </div>
        <div data-turn-id-container="stale-placeholder" style="--estimated-turn-height: 100px"></div>
      </main>
    `);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    setScrollMetrics(container, { clientHeight: 100, scrollHeight: 200, scrollTop: 100 });
    let waitCount = 0;
    const result = await collectChatGptConversation({
      document,
      maxSteps: 40,
      scrollContainer: container,
      waitForDomSettle: () => {
        waitCount += 1;
        if (waitCount === 2) {
          container.innerHTML = `
            <div data-turn-id-container="logical-turn-1" style="--last-known-height: 100px">
              <article data-testid="conversation-turn-1">
                <div data-message-author-role="user" data-message-id="m1">First</div>
              </article>
            </div>
            <div data-turn-id-container="logical-turn-2" style="--last-known-height: 100px">
              <article data-testid="conversation-turn-2">
                <div data-message-author-role="assistant" data-message-id="m2">Second</div>
              </article>
            </div>
          `;
        }
        return Promise.resolve();
      }
    });

    expect(result.messages.map((message) => message.id)).toEqual(["m1", "m2"]);
    expect(result.completeness).toMatchObject({
      knownTurnCount: 2,
      missingTurnIds: [],
      status: "complete"
    });
  });

  test("rebinds a stable message when ChatGPT replaces its outer wrapper id", async () => {
    const document = createDocument(`
      <main id="chat-scroll">
        <div data-turn-id-container="old-logical-turn-2" style="--last-known-height: 100px">
          <article data-testid="conversation-turn-2">
            <div data-message-author-role="assistant" data-message-id="m2">Second</div>
          </article>
        </div>
        <div data-turn-id-container="stale-placeholder" style="--estimated-turn-height: 100px"></div>
      </main>
    `);
    const container = document.getElementById("chat-scroll");

    if (!container) {
      throw new Error("fixture missing chat-scroll");
    }

    setScrollMetrics(container, { clientHeight: 100, scrollHeight: 200, scrollTop: 100 });
    let waitCount = 0;
    const result = await collectChatGptConversation({
      document,
      maxSteps: 40,
      scrollContainer: container,
      waitForDomSettle: () => {
        waitCount += 1;
        if (waitCount === 2) {
          container.innerHTML = `
            <div data-turn-id-container="logical-turn-1" style="--last-known-height: 100px">
              <article data-testid="conversation-turn-1">
                <div data-message-author-role="user" data-message-id="m1">First</div>
              </article>
            </div>
            <div data-turn-id-container="new-logical-turn-2" style="--last-known-height: 100px">
              <article data-testid="conversation-turn-2">
                <div data-message-author-role="assistant" data-message-id="m2">Second</div>
              </article>
            </div>
          `;
        }
        return Promise.resolve();
      }
    });

    expect(result.messages.map((message) => message.id)).toEqual(["m1", "m2"]);
    expect(result.completeness).toMatchObject({
      knownTurnCount: 2,
      missingTurnIds: [],
      status: "complete"
    });
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
      await vi.advanceTimersByTimeAsync(2_000);

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
      expect(result.completeness.status).toBe("partial");
      expect(result.completeness.reachedTop).toBe(false);
      expect(result.completeness.warnings).toContain(
        "ChatGPT's virtual turn inventory did not stabilize before the scan limit."
      );
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

  test("confirms a repeatedly unchanged scrollable top while retaining its hydration warning", async () => {
    vi.useFakeTimers();

    try {
      const document = createDocument(`<main id="chat-scroll"></main>`);
      const container = document.getElementById("chat-scroll");

      if (!container) {
        throw new Error("fixture missing chat-scroll");
      }

      setScrollMetrics(container, { clientHeight: 100, scrollHeight: 300, scrollTop: 0 });
      renderMessages(container, ["1|user|First user message", "5|user|Fifth user message"]);
      const resultPromise = collectChatGptConversation({
        document,
        scrollContainer: container
      });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.completeness).toMatchObject({
        reachedBottom: true,
        reachedTop: true,
        status: "probably_complete"
      });
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
      await vi.runAllTimersAsync();

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

      await vi.runAllTimersAsync();

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
      await vi.advanceTimersByTimeAsync(2_000);

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
      await vi.advanceTimersByTimeAsync(2_000);

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
