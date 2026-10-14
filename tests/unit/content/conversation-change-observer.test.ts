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

  test("invalidates when an attachment sibling hydrates inside a conversation turn", async () => {
    document.body.innerHTML = `
      <section data-testid="conversation-turn-1">
        <article data-message-author-role="assistant" data-message-id="msg-1">
          <p>Answer</p>
        </article>
        <div data-testid="attachments-container"></div>
      </section>
    `;
    const onChange = vi.fn();
    const stop = observeConversationChanges(
      onChange,
      [makeMessage("msg-1", "assistant", "Answer")],
      document,
      MESSAGE_SELECTOR,
      extractRichTestMessages
    );
    const attachment = document.createElement("div");
    attachment.setAttribute("data-attachment-id", "file-1");
    attachment.setAttribute("data-file-name", "report.pdf");
    document.querySelector("[data-testid='attachments-container']")?.append(attachment);

    await flushMutations();

    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  test.each(["aria-controls", "aria-describedby", "aria-labelledby"] as const)(
    "invalidates when an externally linked Activity panel hydrates via %s",
    async (linkAttribute) => {
      document.body.innerHTML = `
        <section data-testid="conversation-turn-1">
          <article data-message-author-role="assistant" data-message-id="msg-1">
            <p>Answer</p>
          </article>
          <button id="activity-trigger" ${linkAttribute}="activity-panel">Activity</button>
        </section>
        <aside id="activity-panel" data-testid="activity-panel"></aside>
      `;
      const onChange = vi.fn();
      const stop = observeConversationChanges(
        onChange,
        [makeMessage("msg-1", "assistant", "Answer")],
        document,
        MESSAGE_SELECTOR,
        extractRichTestMessages
      );
      document.querySelector("#activity-panel")?.append("Inspected the uploaded files");

      await flushMutations();

      expect(onChange).toHaveBeenCalledTimes(1);
      stop();
    }
  );

  test("invalidates when a conversation iframe loads an accessible document", async () => {
    document.body.innerHTML = `
      <section data-testid="conversation-turn-1">
        <article data-message-author-role="assistant" data-message-id="msg-1">
          <p>Answer</p>
        </article>
        <div data-attachment-id="artifact-1" data-file-name="dashboard.html">
          <iframe title="Dashboard"></iframe>
        </div>
      </section>
    `;
    const iframe = document.querySelector("iframe");
    const iframeDocument = document.implementation.createHTMLDocument("Dashboard");

    if (!(iframe instanceof HTMLIFrameElement)) {
      throw new Error("Expected iframe fixture.");
    }

    Object.defineProperty(iframe, "contentDocument", {
      configurable: true,
      get: () => iframeDocument
    });
    const onChange = vi.fn();
    const stop = observeConversationChanges(
      onChange,
      [
        makeMessage("msg-1", "assistant", "Answer", 0, {
          attachments: [
            {
              id: "artifact-1",
              kind: "website",
              name: "dashboard.html",
              warning: "Preview unavailable"
            }
          ]
        })
      ],
      document,
      MESSAGE_SELECTOR,
      extractRichTestMessages
    );

    iframeDocument.body.innerHTML = "<main><h1>Release dashboard</h1></main>";
    iframe.dispatchEvent(new Event("load"));
    await flushMutations();

    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  test("ignores load events from unrelated iframes", async () => {
    document.body.innerHTML = `
      <section data-testid="conversation-turn-1">
        <article data-message-author-role="assistant" data-message-id="msg-1">Answer</article>
      </section>
      <aside><iframe title="Unrelated"></iframe></aside>
    `;
    const onChange = vi.fn();
    const stop = observeConversationChanges(
      onChange,
      [makeMessage("msg-1", "assistant", "Answer")],
      document,
      MESSAGE_SELECTOR,
      extractRichTestMessages
    );

    document.querySelector("aside iframe")?.dispatchEvent(new Event("load"));
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

function extractRichTestMessages(root: ParentNode): readonly ExportedMessage[] {
  return Array.from(root.querySelectorAll(MESSAGE_SELECTOR)).map((element, index) => {
    const turn = element.closest("[data-testid^='conversation-turn-']");
    const attachments = Array.from(
      turn?.querySelectorAll<HTMLElement>("[data-attachment-id]") ?? []
    ).map((attachment) => {
      const iframe = attachment.querySelector<HTMLIFrameElement>("iframe");
      const previewHtml = readTestIframeHtml(iframe);

      return {
        id: attachment.dataset.attachmentId,
        kind: iframe === null ? ("file" as const) : ("website" as const),
        name: attachment.dataset.fileName ?? "Attachment",
        ...(previewHtml === undefined ? { warning: "Preview unavailable" } : { previewHtml })
      };
    });
    const thinkingBlocks = collectLinkedActivityText(turn);

    return makeMessage(
      element.getAttribute("data-message-id") ?? "",
      element.getAttribute("data-message-author-role") === "user" ? "user" : "assistant",
      element.querySelector("p")?.textContent?.trim() ?? element.textContent?.trim() ?? "",
      index,
      {
        ...(attachments.length > 0 ? { attachments } : {}),
        ...(thinkingBlocks.length > 0 ? { thinkingBlocks } : {})
      }
    );
  });
}

function makeMessage(
  id: string,
  role: ChatRole,
  text: string,
  index = 0,
  overrides: Partial<ExportedMessage> = {}
): ExportedMessage {
  return {
    id,
    index,
    role,
    authorLabel: role === "user" ? "User" : "ChatGPT",
    text,
    codeBlocks: [],
    images: [],
    metadata: {},
    ...overrides
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

function collectLinkedActivityText(turn: Element | null): readonly { text: string }[] {
  if (turn === null) {
    return [];
  }

  const ids = new Set<string>();
  for (const controller of Array.from(
    turn.querySelectorAll("[aria-controls], [aria-describedby], [aria-labelledby]")
  )) {
    for (const attribute of ["aria-controls", "aria-describedby", "aria-labelledby"]) {
      for (const id of controller.getAttribute(attribute)?.split(/\s+/u) ?? []) {
        if (id.length > 0) {
          ids.add(id);
        }
      }
    }
  }

  return [...ids]
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
    .filter((text) => text.length > 0)
    .map((text) => ({ text }));
}

function readTestIframeHtml(iframe: HTMLIFrameElement | null): string | undefined {
  const html = iframe?.contentDocument?.documentElement.outerHTML.trim();
  return html && iframe?.contentDocument?.body?.textContent?.trim() ? html : undefined;
}
