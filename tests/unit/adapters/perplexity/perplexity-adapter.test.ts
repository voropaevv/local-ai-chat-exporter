import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";

import { detectPerplexity } from "../../../../src/adapters/perplexity/detect";
import { extractVisiblePerplexityMessages } from "../../../../src/adapters/perplexity/extract-visible";
import { perplexitySelectors } from "../../../../src/adapters/perplexity/selectors";

const fixturesDir = resolve(import.meta.dirname, "../../../fixtures/perplexity");

function loadFixture(name: string, url = "https://www.perplexity.ai/search/example"): Document {
  const html = readFileSync(resolve(fixturesDir, name), "utf8");
  return new JSDOM(html, { url }).window.document;
}

describe("Perplexity adapter", () => {
  test("detects Perplexity by hostname or visible message selectors", () => {
    const document = loadFixture("simple-conversation.html", "https://example.com/local");

    expect(detectPerplexity({ hostname: "www.perplexity.ai" })).toBe(true);
    expect(detectPerplexity({ hostname: "perplexity.ai" })).toBe(true);
    expect(detectPerplexity({ document, hostname: "example.com" })).toBe(true);
    expect(detectPerplexity({ hostname: "chatgpt.com" })).toBe(false);
  });

  test("defines selectors and extraction limitations", () => {
    expect(perplexitySelectors.message).toContain("[data-testid='query-text']");
    expect(perplexitySelectors.message).toContain("[data-testid='answer']");
    expect(perplexitySelectors.message).toContain("[data-testid='thread-question']");
    expect(perplexitySelectors.message).toContain("[data-testid='thread-answer']");
  });

  test("extracts visible user and assistant messages from fixture DOM", () => {
    const messages = extractVisiblePerplexityMessages(loadFixture("simple-conversation.html"));

    expect(messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(messages.map((message) => message.authorLabel)).toEqual(["User", "Perplexity"]);
    expect(messages.map((message) => message.id)).toEqual([
      "perplexity-user-1",
      "perplexity-assistant-1"
    ]);
    expect(messages[0].text).toBe("What should the CSV include?");
    expect(messages[1].text).toContain("The CSV should include role, author, and text columns.");
    expect(messages[1].codeBlocks).toEqual([{ code: "role,author,text", language: "csv" }]);
  });

  test("extracts visible messages from a current Perplexity-style thread layout", () => {
    const messages = extractVisiblePerplexityMessages(loadFixture("current-layout.html"));

    expect(messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(messages[0].text).toBe("How should HTML exports handle ChatGPT classes?");
    expect(messages[1].text).toContain("clean semantic HTML");
    expect(messages[1].codeBlocks).toEqual([
      {
        code: "no internal class names",
        language: undefined
      }
    ]);
  });
});
