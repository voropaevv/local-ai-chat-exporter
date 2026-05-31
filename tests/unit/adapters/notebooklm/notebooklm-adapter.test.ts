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
});
