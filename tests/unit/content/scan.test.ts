import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";

import type { ExportPipelineError } from "../../../src/core/export-options";
import { scanCurrentConversationExport } from "../../../src/content/scan";

const fixturesDir = resolve(import.meta.dirname, "../../fixtures/claude");

function loadClaudeFixture(): Document {
  const html = readFileSync(resolve(fixturesDir, "simple-conversation.html"), "utf8");
  return new JSDOM(html, { url: "https://claude.ai/chat/example" }).window.document;
}

describe("scanCurrentConversationExport", () => {
  test("uses secondary adapters for visible-message scans and surfaces platform warnings", async () => {
    const conversation = await scanCurrentConversationExport({
      document: loadClaudeFixture(),
      exportedAt: "2026-05-31T10:20:30.000Z",
      hostname: "claude.ai",
      href: "https://claude.ai/chat/example",
      title: "Claude fixture"
    });

    expect(conversation.platform).toBe("claude");
    expect(conversation.platformLabel).toBe("Claude");
    expect(conversation.messageCount).toBe(2);
    expect(conversation.exportedAt).toBe("2026-05-31T10:20:30.000Z");
    expect(conversation.completeness.status).toBe("partial");
    expect(conversation.completeness.platformWarnings).toContain(
      "Claude support is experimental. Verify first and last messages before relying on export."
    );
  });

  test("throws a clear unsupported-platform error when no adapter matches", async () => {
    const document = new JSDOM("<main><p>No supported chat here.</p></main>", {
      url: "https://example.com/"
    }).window.document;

    await expect(
      scanCurrentConversationExport({
        document,
        hostname: "example.com",
        href: "https://example.com/"
      })
    ).rejects.toMatchObject({
      code: "unsupported_platform",
      message: expect.stringContaining(
        "Supported platforms: ChatGPT, Claude, Gemini, Perplexity, NotebookLM"
      )
    } satisfies Partial<ExportPipelineError>);
  });

  test("deduplicates repeated secondary-platform messages during visible scans", async () => {
    const document = new JSDOM(
      `
        <main>
          <div data-testid="assistant-message"><p>Same visible answer.</p></div>
          <div data-testid="assistant-message"><p>Same visible answer.</p></div>
        </main>
      `,
      { url: "https://claude.ai/chat/duplicate" }
    ).window.document;

    const conversation = await scanCurrentConversationExport({
      document,
      hostname: "claude.ai",
      href: "https://claude.ai/chat/duplicate"
    });

    expect(conversation.messageCount).toBe(1);
    expect(conversation.completeness.duplicateCount).toBe(1);
  });

  test("throws a precise Perplexity adapter error when the layout is detected but no messages extract", async () => {
    const document = new JSDOM("<main><div data-testid='answer'></div></main>", {
      url: "https://www.perplexity.ai/search/example"
    }).window.document;

    await expect(
      scanCurrentConversationExport({
        document,
        hostname: "www.perplexity.ai",
        href: "https://www.perplexity.ai/search/example"
      })
    ).rejects.toMatchObject({
      code: "no_messages_found",
      message: expect.stringContaining("Perplexity layout was detected")
    } satisfies Partial<ExportPipelineError>);
  });
});
