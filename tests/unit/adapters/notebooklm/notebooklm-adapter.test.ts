import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";

import { detectNotebookLm } from "../../../../src/adapters/notebooklm/detect";
import { extractVisibleNotebookLmMessages } from "../../../../src/adapters/notebooklm/extract-visible";
import { notebookLmSelectors } from "../../../../src/adapters/notebooklm/selectors";

const fixturesDir = resolve(import.meta.dirname, "../../../fixtures/notebooklm");

function loadFixture(
  name: string,
  url = "https://notebooklm.google.com/notebook/example"
): Document {
  const html = readFileSync(resolve(fixturesDir, name), "utf8");
  return new JSDOM(html, { url }).window.document;
}

describe("NotebookLM adapter", () => {
  test("detects NotebookLM by hostname or visible message selectors", () => {
    const document = loadFixture("simple-conversation.html", "https://example.com/local");

    expect(detectNotebookLm({ hostname: "notebooklm.google.com" })).toBe(true);
    expect(detectNotebookLm({ document, hostname: "example.com" })).toBe(true);
    expect(detectNotebookLm({ hostname: "chatgpt.com" })).toBe(false);
  });

  test("defines selectors and extraction limitations", () => {
    expect(notebookLmSelectors.message).toContain("[data-testid='user-query']");
    expect(notebookLmSelectors.message).toContain("[data-testid='chat-message-answer']");
    expect(notebookLmSelectors.message).toContain(".from-user-message-inner-content");
    expect(notebookLmSelectors.message).toContain(".to-user-message-inner-content");
  });

  test("extracts visible user and assistant messages from fixture DOM", () => {
    const messages = extractVisibleNotebookLmMessages(loadFixture("simple-conversation.html"));

    expect(messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(messages.map((message) => message.authorLabel)).toEqual(["User", "NotebookLM"]);
    expect(messages.map((message) => message.id)).toEqual([
      "notebooklm-user-1",
      "notebooklm-assistant-1"
    ]);
    expect(messages[0].text).toBe("Summarize this source.");
    expect(messages[1].text).toBe("The source describes a local-only export workflow.");
  });

  test("extracts current NotebookLM user and model cards with rich structure", () => {
    const messages = extractVisibleNotebookLmMessages(loadFixture("current-layout.html"));

    expect(messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(messages[0].text).toBe("На основе источника ответь кратко.");
    expect(messages[1].text).toContain("Начало NotebookLM: ёж, Юникод, ₽, —");
    expect(messages[1].markdown).toContain("| Элемент | Значение |");
    expect(messages[1].markdown).toContain("1. Строка 1");
    expect(messages[1].markdown).toContain("2. Строка 2");
    expect(messages[1].markdown).not.toContain("Строка 1 1");
    expect(messages[1].markdown).toContain("Конец проверки NotebookLM 2026");
    expect(messages[1].text).not.toContain("Copy");
  });

  test("retains provider content that resembles ChatGPT attachments and source UI", () => {
    const document = new JSDOM(`
      <main>
        <div class="to-user-message-inner-content" id="notebooklm-structured-content">
          <div class="message-text-content">
            <p>NotebookLM answer with supporting material.</p>
            <section data-testid="sources">
              <img
                alt="Source favicon"
                height="128"
                src="https://www.google.com/s2/favicons?domain=https://example.com&amp;sz=128"
                width="128"
              >
              <p>Source notes belong to this provider response.</p>
            </section>
            <span class="avatar">
              <img
                alt="NotebookLM avatar"
                height="48"
                src="https://example.com/notebooklm-avatar.png"
                width="48"
              >
            </span>
            <div data-testid="file-attachment">
              <strong>research-notes.pdf</strong>
              <img
                alt="Attached research diagram"
                height="360"
                src="https://example.com/research-diagram.png"
                width="640"
              >
            </div>
            <p data-participant-name="NotebookLM collaborator">Collaborator annotation.</p>
          </div>
        </div>
      </main>
    `).window.document;
    const [message] = extractVisibleNotebookLmMessages(document);

    expect(message.text).toContain("Source notes belong to this provider response.");
    expect(message.text).toContain("research-notes.pdf");
    expect(message.text).toContain("Collaborator annotation.");
    expect(message.text).not.toContain("Source favicon");
    expect(message.text).not.toContain("NotebookLM avatar");
    expect(message.markdown).toContain(
      "Image: [Attached research diagram](https://example.com/research-diagram.png) (640x360)"
    );
    expect(message.markdown).not.toContain("Source favicon");
    expect(message.markdown).not.toContain("NotebookLM avatar");
    expect(message.images).toEqual([
      {
        alt: "Attached research diagram",
        height: 360,
        src: "https://example.com/research-diagram.png",
        width: 640
      }
    ]);
  });
});
