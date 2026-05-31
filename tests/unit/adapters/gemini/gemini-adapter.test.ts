import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";

import { detectGemini } from "../../../../src/adapters/gemini/detect";
import { extractVisibleGeminiMessages } from "../../../../src/adapters/gemini/extract-visible";
import { geminiSelectors } from "../../../../src/adapters/gemini/selectors";

const fixturesDir = resolve(import.meta.dirname, "../../../fixtures/gemini");

function loadFixture(name: string, url = "https://gemini.google.com/app/example"): Document {
  const html = readFileSync(resolve(fixturesDir, name), "utf8");
  return new JSDOM(html, { url }).window.document;
}

describe("Gemini adapter", () => {
  test("detects Gemini by hostname or visible message selectors", () => {
    const document = loadFixture("simple-conversation.html", "https://example.com/local");

    expect(detectGemini({ hostname: "gemini.google.com" })).toBe(true);
    expect(detectGemini({ document, hostname: "example.com" })).toBe(true);
    expect(detectGemini({ hostname: "chatgpt.com" })).toBe(false);
  });

  test("defines selectors and extraction limitations", () => {
    expect(geminiSelectors.message).toContain("user-query");
    expect(geminiSelectors.message).toContain("model-response");
  });

  test("extracts visible user and assistant messages from fixture DOM", () => {
    const messages = extractVisibleGeminiMessages(loadFixture("simple-conversation.html"));

    expect(messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(messages.map((message) => message.authorLabel)).toEqual(["User", "Gemini"]);
    expect(messages.map((message) => message.id)).toEqual(["gemini-user-1", "gemini-assistant-1"]);
    expect(messages[0].text).toBe("Draft a privacy note.");
    expect(messages[1].text).toBe("Privacy note: exports stay on this device.");
  });
});
