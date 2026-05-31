import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";

import { getBestAdapter, platformAdapters } from "../../../src/adapters/registry";

describe("adapter registry", () => {
  test("returns the best adapter by supported hostname", () => {
    expect(getBestAdapter({ hostname: "chatgpt.com" })?.id).toBe("chatgpt");
    expect(getBestAdapter({ hostname: "chat.openai.com" })?.id).toBe("chatgpt");
    expect(getBestAdapter({ hostname: "claude.ai" })?.id).toBe("claude");
    expect(getBestAdapter({ hostname: "gemini.google.com" })?.id).toBe("gemini");
    expect(getBestAdapter({ hostname: "www.perplexity.ai" })?.id).toBe("perplexity");
    expect(getBestAdapter({ hostname: "notebooklm.google.com" })?.id).toBe("notebooklm");
    expect(getBestAdapter({ hostname: "example.com" })).toBeNull();
  });

  test("can fall back to platform DOM detection when no supported hostname is available", () => {
    const document = new JSDOM(
      '<main><div data-testid="assistant-message">Hello from Claude.</div></main>',
      { url: "https://example.com/local" }
    ).window.document;

    expect(getBestAdapter({ document, hostname: "example.com" })?.id).toBe("claude");
  });

  test("exposes hostnames, selectors, and platform warnings for every adapter", () => {
    expect(platformAdapters.map((adapter) => adapter.id)).toEqual([
      "chatgpt",
      "claude",
      "gemini",
      "perplexity",
      "notebooklm"
    ]);

    for (const adapter of platformAdapters) {
      expect(adapter.hostnames.length).toBeGreaterThan(0);
      expect(adapter.selectors.message).toContain("[");
      expect(adapter.limitations).toBeDefined();
    }

    expect(getBestAdapter({ hostname: "claude.ai" })?.experimentalWarning).toBe(
      "Claude support is experimental. Verify first and last messages before relying on export."
    );
  });
});
