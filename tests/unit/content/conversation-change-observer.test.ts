// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";

import { observeConversationChanges } from "../../../extension/content/conversation-change-observer";
import type { ChatRole, ExportedMessage } from "../../../src/core/schema";

const MESSAGE_SELECTOR = "[data-message-author-role]";

afterEach(() => {
  document.body.replaceChildren();
});

describe("conversation change observer", () => {
  test("invalidates once when message content changes", async () => {
    document.body.innerHTML = `
      <article data-message-author-role="assistant" data-message-id="msg-1"><p>Before</p></article>
    `;
    const onChange = vi.fn();
    const stop = observeConversationChanges(
      onChange,
      [makeMessage("msg-1", "assistant", "Before")],
      document,
      MESSAGE_SELECTOR,
      extractTestMessages
    );
    const paragraph = document.querySelector("p");

    paragraph?.append(" after");
    await flushMutations();
    paragraph?.append(" again");
    await flushMutations();

    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  test("invalidates when a new message is added", async () => {
    document.body.innerHTML = `
      <main>
        <article data-message-author-role="user" data-message-id="msg-1">Existing</article>
      </main>
    `;
    const onChange = vi.fn();
    const stop = observeConversationChanges(
      onChange,
      [makeMessage("msg-1", "user", "Existing")],
      document,
      MESSAGE_SELECTOR,
      extractTestMessages
    );
    const message = document.createElement("article");
    message.setAttribute("data-message-author-role", "assistant");
    message.setAttribute("data-message-id", "msg-2");
    message.textContent = "New answer";
    document.querySelector("main")?.append(message);

    await flushMutations();

    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  test("ignores unrelated page mutations", async () => {
    document.body.innerHTML = `
      <article data-message-author-role="assistant" data-message-id="msg-1"><p>Answer</p></article>
      <aside></aside>
    `;
    const onChange = vi.fn();
    const stop = observeConversationChanges(
      onChange,
      [makeMessage("msg-1", "assistant", "Answer")],
      document,
      MESSAGE_SELECTOR,
      extractTestMessages
    );
    document.querySelector("aside")?.append(document.createElement("span"));

    await flushMutations();

    expect(onChange).not.toHaveBeenCalled();
    stop();
  });

  test("ignores virtualized removal and reappearance of cached messages", async () => {
    document.body.innerHTML = `
      <main>
        <article data-message-author-role="user" data-message-id="msg-1">First prompt</article>
      </main>
    `;
    const onChange = vi.fn();
    const baselineMessages = [
      makeMessage("msg-1", "user", "First prompt"),
      makeMessage("msg-2", "assistant", "Known answer")
    ];
    const stop = observeConversationChanges(
      onChange,
      baselineMessages,
      document,
      MESSAGE_SELECTOR,
      extractTestMessages
    );
    const main = document.querySelector("main");

    main?.replaceChildren(createMessageElement("msg-2", "assistant", "Known answer"));
    await flushMutations();
    main?.replaceChildren(createMessageElement("msg-1", "user", "First prompt"));
    await flushMutations();

    expect(onChange).not.toHaveBeenCalled();
    stop();
  });
});

function extractTestMessages(root: ParentNode): readonly ExportedMessage[] {
  return Array.from(root.querySelectorAll(MESSAGE_SELECTOR)).map((element, index) =>
    makeMessage(
      element.getAttribute("data-message-id") ?? "",
      element.getAttribute("data-message-author-role") === "user" ? "user" : "assistant",
      element.textContent?.trim() ?? "",
      index
    )
  );
}

function makeMessage(id: string, role: ChatRole, text: string, index = 0): ExportedMessage {
  return {
    id,
    index,
    role,
    authorLabel: role === "user" ? "User" : "ChatGPT",
    text,
    codeBlocks: [],
    images: [],
    metadata: {}
  };
}

function createMessageElement(id: string, role: ChatRole, text: string): Element {
  const element = document.createElement("article");
  element.setAttribute("data-message-author-role", role);
  element.setAttribute("data-message-id", id);
  element.textContent = text;
  return element;
}

async function flushMutations(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
