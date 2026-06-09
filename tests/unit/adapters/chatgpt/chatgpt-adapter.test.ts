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

  test("extracts advanced ChatGPT content without leaking thinking into the body", () => {
    const messages = extractVisibleChatGptMessages(loadFixture("advanced-content.html"));

    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({
      authorLabel: "Ava Researcher",
      createdAt: "2026-06-01T10:00:00.000Z",
      participant: "Ava Researcher",
      role: "user"
    });

    const assistant = messages[1];

    expect(assistant).toMatchObject({
      createdAt: "2026-06-01T10:05:00.000Z",
      model: "GPT-4o Deep Research",
      metadata: { contentKind: "deep_research" }
    });
    expect(assistant.markdown).toContain("| Variant | Evidence |");
    expect(assistant.markdown).toContain("\\(p < 0.05\\)");
    expect(assistant.codeBlocks[0]).toEqual({
      code: 'const risk = "moderate";\nconsole.log(risk);\n',
      language: "ts"
    });
    expect(assistant.text).not.toContain("Need to compare source quality");
    expect(assistant.markdown).not.toContain("Need to compare source quality");
    expect(assistant.sources).toEqual([
      {
        id: "dr-citation-1",
        kind: "citation",
        snippet:
          "Genome-wide evidence supports a cautious interpretation 1 while current web results show updated guidance.",
        title: "1",
        url: "https://example.org/genome-paper"
      },
      {
        id: "deep-source-1",
        kind: "deep_research",
        snippet: "Genome Paper Peer-reviewed source for the Deep Research report.",
        title: "Genome Paper",
        url: "https://example.org/genome-paper"
      },
      {
        id: "web-source-1",
        kind: "web_search",
        snippet: "Current Guidance Web Search source captured from visible source links.",
        title: "Current Guidance",
        url: "https://example.com/current-guidance"
      }
    ]);
    expect(assistant.thinkingBlocks).toEqual([
      {
        text: "Need to compare source quality before finalizing.",
        title: "Thinking"
      }
    ]);
    expect(assistant.canvas).toEqual([
      {
        title: "Canvas draft",
        url: "https://chatgpt.com/canvas/local-canvas",
        warning:
          "Canvas content was detected but could not be extracted from the current DOM. Open the canvas link or capture it manually."
      }
    ]);
  });

  test("extracts accessible anonymous ChatGPT-like conversations without account state", () => {
    const messages = extractVisibleChatGptMessages(
      loadFixture("advanced-content.html", "https://example.com/share/local")
    );

    expect(messages.map((message) => message.id)).toEqual([
      "user-advanced-1",
      "assistant-advanced-1"
    ]);
  });
});
