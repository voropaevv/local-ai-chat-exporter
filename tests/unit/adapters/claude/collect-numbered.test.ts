import { JSDOM } from "jsdom";
import { expect, test } from "vitest";
import { collectNumberedClaudeMessages } from "../../../../src/adapters/claude/collect-numbered";
import { scanCurrentConversationExport } from "../../../../src/content/scan";

function fixture() {
  const document = new JSDOM('<main style="overflow-y:auto"></main>', {
    url: "https://claude.ai/chat/test"
  }).window.document;
  const container = document.querySelector("main")!;
  Object.defineProperties(container, {
    clientHeight: { value: 100 },
    scrollHeight: { value: 500 }
  });
  const render = (indices: number[], streaming = false) => {
    container.innerHTML = indices
      .map(
        (index) =>
          `<div role="article" aria-label="Message ${index} of 6"><div data-testid="${index % 2 ? "user" : "assistant"}-message" data-is-streaming="${streaming}"><p>Repeat</p></div></div>`
      )
      .join("");
  };
  render([5, 6]);
  container.scrollTop = 400;
  return { document, container, render };
}

test("scan traverses the numbered inventory and preserves repeated turns", async () => {
  const { document, container, render } = fixture();
  let polls = 0;
  const result = await scanCurrentConversationExport({
    document,
    hostname: "claude.ai",
    href: "https://claude.ai/chat/test",
    maxSteps: 12,
    waitForDomSettle: async () => {
      polls++;
      // Delayed hydration: do not confuse an initial bottom viewport with top.
      if (polls > 2)
        render(container.scrollTop < 80 ? [1, 2] : container.scrollTop < 160 ? [3, 4] : [5, 6]);
    }
  });
  expect(result.messages).toHaveLength(6);
  expect(new Set(result.messages.map((message) => message.id)).size).toBe(6);
  expect(result.completeness.status).toBe("probably_complete");
  expect(container.scrollTop).toBe(400);
});

test("missing middle and streaming never satisfy inventory completeness", async () => {
  for (const streaming of [false, true]) {
    const { document, render } = fixture();
    const result = await collectNumberedClaudeMessages({
      document,
      maxSteps: 4,
      wait: async () => render(streaming ? [1, 2, 3, 4, 5, 6] : [1, 2, 5, 6], streaming)
    });
    expect(result?.complete).toBe(false);
    expect(result?.messages.map((message) => message.index)).toEqual(
      result?.messages.map((_, index) => index)
    );
  }
});

test("cancellation restores viewport and unknown labels retain fallback", async () => {
  const { document, container } = fixture();
  const controller = new AbortController();
  await expect(
    collectNumberedClaudeMessages({
      document,
      signal: controller.signal,
      wait: async () => controller.abort()
    })
  ).rejects.toThrow("cancelled");
  expect(container.scrollTop).toBe(400);
  container.innerHTML =
    '<div role="article" aria-label="Unknown"><div data-testid="user-message">text</div></div>';
  expect(await collectNumberedClaudeMessages({ document })).toBeNull();
});
