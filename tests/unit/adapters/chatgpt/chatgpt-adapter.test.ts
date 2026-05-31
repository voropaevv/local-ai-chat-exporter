import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";

import { detectChatGpt } from "../../../../src/adapters/chatgpt/detect";
import { extractVisibleChatGptMessages } from "../../../../src/adapters/chatgpt/extract-visible";
import { chatGptSelectors } from "../../../../src/adapters/chatgpt/selectors";

const fixturesDir = resolve(import.meta.dirname, "../../../fixtures/chatgpt");

function loadFixture(name: string, url = "https://chatgpt.com/c/example"): Document {
  const html = readFileSync(resolve(fixturesDir, name), "utf8");
  return new JSDOM(html, { url }).window.document;
}

describe("detectChatGpt", () => {
  test("detects supported ChatGPT hosts", () => {
    expect(detectChatGpt({ hostname: "chatgpt.com" })).toBe(true);
    expect(detectChatGpt({ hostname: "chat.openai.com" })).toBe(true);
    expect(detectChatGpt({ hostname: "example.com" })).toBe(false);
  });

  test("detects ChatGPT-like DOM by stable message role attribute", () => {
    const document = loadFixture("simple-conversation.html", "https://example.com/local");

    expect(detectChatGpt({ document, hostname: "example.com" })).toBe(true);
  });
});

describe("extractVisibleChatGptMessages", () => {
  test("uses stable selectors for ChatGPT messages and turns", () => {
    expect(chatGptSelectors).toMatchObject({
      codeBlocks: "pre code, pre",
      conversationTurn: "[data-testid^='conversation-turn-']",
      markdownBody: ".markdown, [data-message-author-role]",
      messageByRole: "[data-message-author-role]"
    });
  });

  test("extracts user and assistant messages in document order", () => {
    const messages = extractVisibleChatGptMessages(loadFixture("simple-conversation.html"));

    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(messages.map((message) => message.id)).toEqual(["user-msg-1", "assistant-msg-1"]);
    expect(messages.map((message) => message.index)).toEqual([0, 1]);
    expect(messages[0].text).toBe("Hello, can you summarize this?");
    expect(messages[1].text).toBe("Sure. Here is a concise summary.");
  });

  test("preserves code block whitespace and visible language", () => {
    const [message] = extractVisibleChatGptMessages(loadFixture("code-block.html"));

    expect(message.text).toContain("Use this TypeScript:");
    expect(message.text).not.toContain("Copy code");
    expect(message.codeBlocks).toEqual([
      {
        language: "ts",
        code: "  const value = 1;\n\n  console.log(value);\n"
      }
    ]);
  });

  test("keeps table HTML and visible table text", () => {
    const [message] = extractVisibleChatGptMessages(loadFixture("table.html"));

    expect(message.text).toContain("Comparison:");
    expect(message.text).toContain("Markdown");
    expect(message.text).toContain("Archive");
    expect(message.html).toContain("<table>");
  });

  test("preserves LaTeX-like text without interpreting it", () => {
    const [message] = extractVisibleChatGptMessages(loadFixture("math.html"));

    expect(message.text).toContain("\\(E = mc^2\\)");
    expect(message.text).toContain("$$a^2 + b^2 = c^2$$");
  });

  test("removes UI-only controls from text and sanitized HTML", () => {
    const [message] = extractVisibleChatGptMessages(loadFixture("buttons.html"));

    expect(message.text).toBe("Final answer text.");
    expect(message.html).not.toContain("<button");
    expect(message.html).not.toContain("<svg");
    expect(message.html).not.toContain("Screen reader control label");
  });

  test("extracts image references without fetching image content", () => {
    const [message] = extractVisibleChatGptMessages(loadFixture("image.html"));

    expect(message.images).toEqual([
      {
        alt: "Architecture diagram",
        height: 360,
        src: "blob:https://chatgpt.com/local-image",
        width: 640
      }
    ]);
    expect(message.text).toContain("Here is the diagram.");
  });
});
