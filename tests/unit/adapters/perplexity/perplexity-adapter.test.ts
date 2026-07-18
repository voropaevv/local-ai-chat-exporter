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
    expect(perplexitySelectors.message).toContain("[class~='group/query']");
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

    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant"
    ]);
    expect(messages[0].text).toBe("Jelluvi live QA Perplexity 2026.");
    expect(messages[1].text).toContain("Начало Perplexity: ёж, Юникод, ₽, —");
    expect(messages[1].codeBlocks).toEqual([
      {
        code: "const perplexity = 42;",
        language: "javascript"
      }
    ]);
    expect(messages[2].text).toBe("Продолжи live QA Perplexity.");
    expect(messages[3].markdown).toContain("| Элемент | Значение |");
    expect(messages[3].markdown).toContain("1. Строка 1");
    expect(messages[3].text).toContain("E = mc^2");
    expect(messages[3].text).not.toContain("E=mc2E = mc^2");
    expect(messages[3].text).toContain("Конец проверки Perplexity 2026");
  });

  test("extracts visible messages from the current Perplexity answer page layout", () => {
    const messages = extractVisiblePerplexityMessages(loadFixture("answer-page-layout.html"));

    expect(messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(messages[0].text).toBe("Предложи лучшие практики для каждого элемента моего сайта");
    expect(messages[1].text).toContain("Отлично, у меня достаточно данных");
    expect(messages[1].text).toContain("Command Palette");
    expect(messages.map((message) => message.text)).not.toContain("Answer Links Images");
  });
});
