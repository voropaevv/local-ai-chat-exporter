// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";

import { observeConversationChanges } from "../../../extension/content/conversation-change-observer";

const MESSAGE_SELECTOR = "[data-message-author-role]";

afterEach(() => {
  document.body.replaceChildren();
});

describe("conversation change observer", () => {
  test("invalidates once when message content changes", async () => {
    document.body.innerHTML = `
      <article data-message-author-role="assistant"><p>Before</p></article>
    `;
    const onChange = vi.fn();
    const stop = observeConversationChanges(onChange, document, MESSAGE_SELECTOR);
    const paragraph = document.querySelector("p");

    paragraph?.append(" after");
    await flushMutations();
    paragraph?.append(" again");
    await flushMutations();

    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  test("ignores selection controls inserted into a message", async () => {
    document.body.innerHTML = `
      <article data-message-author-role="assistant"><p>Answer</p></article>
    `;
    const onChange = vi.fn();
    const stop = observeConversationChanges(onChange, document, MESSAGE_SELECTOR);
    const control = document.createElement("button");
    control.dataset.localExportSelectionControl = "true";
    document.querySelector("article")?.append(control);

    await flushMutations();

    expect(onChange).not.toHaveBeenCalled();
    stop();
  });

  test("ignores unrelated page mutations", async () => {
    document.body.innerHTML = `
      <article data-message-author-role="assistant"><p>Answer</p></article>
      <aside></aside>
    `;
    const onChange = vi.fn();
    const stop = observeConversationChanges(onChange, document, MESSAGE_SELECTOR);
    document.querySelector("aside")?.append(document.createElement("span"));

    await flushMutations();

    expect(onChange).not.toHaveBeenCalled();
    stop();
  });
});

async function flushMutations(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
