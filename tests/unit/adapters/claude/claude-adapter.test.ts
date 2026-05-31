import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";

import { detectClaude } from "../../../../src/adapters/claude/detect";
import { extractVisibleClaudeMessages } from "../../../../src/adapters/claude/extract-visible";
import { claudeSelectors } from "../../../../src/adapters/claude/selectors";

const fixturesDir = resolve(import.meta.dirname, "../../../fixtures/claude");

function loadFixture(name: string, url = "https://claude.ai/chat/example"): Document {
  const html = readFileSync(resolve(fixturesDir, name), "utf8");
  return new JSDOM(html, { url }).window.document;
}

describe("Claude adapter", () => {
  test("detects Claude by hostname or visible message selectors", () => {
    const document = loadFixture("simple-conversation.html", "https://example.com/local");

    expect(detectClaude({ hostname: "claude.ai" })).toBe(true);
    expect(detectClaude({ document, hostname: "example.com" })).toBe(true);
    expect(detectClaude({ hostname: "chatgpt.com" })).toBe(false);
  });

  test("defines selectors and extraction limitations", () => {
    expect(claudeSelectors.message).toContain("[data-testid='user-message']");
    expect(claudeSelectors.message).toContain("[data-testid='assistant-message']");
  });

  test("extracts visible user and assistant messages from fixture DOM", () => {
    const messages = extractVisibleClaudeMessages(loadFixture("simple-conversation.html"));

    expect(messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(messages.map((message) => message.authorLabel)).toEqual(["User", "Claude"]);
    expect(messages.map((message) => message.id)).toEqual(["claude-user-1", "claude-assistant-1"]);
    expect(messages[0].text).toBe("Can you outline the launch checklist?");
    expect(messages[1].text).toContain("Use a short checklist:");
    expect(messages[1].markdown).toContain("- Confirm permissions.");
  });

  test("does not use repeated data-testid values as fallback message ids", () => {
    const document = new JSDOM(`
      <main>
        <div data-testid="assistant-message"><p>First answer.</p></div>
        <div data-testid="assistant-message"><p>Second answer.</p></div>
      </main>
    `).window.document;
    const messages = extractVisibleClaudeMessages(document);

    expect(messages).toHaveLength(2);
    expect(messages[0].id).not.toBe("assistant-message");
    expect(messages[1].id).not.toBe("assistant-message");
    expect(messages[0].id).not.toBe(messages[1].id);
  });
});
