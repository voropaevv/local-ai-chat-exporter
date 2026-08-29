import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test, vi } from "vitest";

import type { ExportPipelineError } from "../../../src/core/export-options";
import type { ExportedMessage } from "../../../src/core/schema";
import { scanCurrentConversationExport } from "../../../src/content/scan";

const claudeFixturesDir = resolve(import.meta.dirname, "../../fixtures/claude");
const perplexityFixturesDir = resolve(import.meta.dirname, "../../fixtures/perplexity");

function loadClaudeFixture(): Document {
  const html = readFileSync(resolve(claudeFixturesDir, "simple-conversation.html"), "utf8");
  return new JSDOM(html, { url: "https://claude.ai/chat/example" }).window.document;
}

function loadPerplexityFixture(): Document {
  const html = readFileSync(resolve(perplexityFixturesDir, "answer-page-layout.html"), "utf8");
  return new JSDOM(html, { url: "https://www.perplexity.ai/search/example" }).window.document;
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
      "Claude support is beta. Verify first and last messages before relying on export."
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

  test("keeps visible-only Perplexity exports honest about completeness", async () => {
    const conversation = await scanCurrentConversationExport({
      document: loadPerplexityFixture(),
      exportedAt: "2026-06-06T18:20:30.000Z",
      hostname: "www.perplexity.ai",
      href: "https://www.perplexity.ai/search/example",
      title: "Perplexity fixture"
    });

    expect(conversation.platform).toBe("perplexity");
    expect(conversation.messageCount).toBe(2);
    expect(conversation.completeness).toMatchObject({
      duplicateCount: 0,
      reachedBottom: false,
      reachedTop: false,
      scrollSteps: 0,
      status: "partial"
    });
    expect(conversation.completeness.platformWarnings).toContain(
      "Perplexity support is experimental. Verify first and last messages before relying on export."
    );
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
      message: "Perplexity layout not recognized. Adapter update needed."
    } satisfies Partial<ExportPipelineError>);
  });

  test("uses authenticated ChatGPT history when the source tab becomes inactive", async () => {
    const document = new JSDOM(
      `<main>
        <article data-testid="conversation-turn-3">
          <div data-message-author-role="user" data-message-id="user-2">Recent question</div>
        </article>
        <article data-testid="conversation-turn-4">
          <div data-message-author-role="assistant" data-message-id="assistant-2">
            Recent answer
          </div>
        </article>
      </main>`,
      { pretendToBeVisual: true, url: "https://chatgpt.com/c/history-backed" }
    ).window.document;
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    const historyMessages = [
      historyMessage("user-1", "user", "First question"),
      historyMessage("assistant-1", "assistant", "First answer"),
      historyMessage("user-2", "user", "Recent question"),
      historyMessage("assistant-2", "assistant", "Recent answer")
    ];
    const historyLoader = vi.fn(async () => ({
      duplicateCount: 0,
      messages: historyMessages,
      pageCount: 2,
      reachedBottom: true,
      reachedTop: true,
      warnings: []
    }));

    const conversation = await scanCurrentConversationExport({
      chatGptHistoryLoader: historyLoader,
      document,
      exportedAt: "2026-08-29T10:00:00.000Z",
      hostname: "chatgpt.com",
      href: "https://chatgpt.com/c/history-backed",
      title: "Background history"
    });

    expect(historyLoader).toHaveBeenCalledOnce();
    expect(conversation.messages.map((message) => message.id)).toEqual([
      "user-1",
      "assistant-1",
      "user-2",
      "assistant-2"
    ]);
    expect(conversation.completeness).toMatchObject({
      knownTurnCount: 4,
      reachedBottom: true,
      reachedTop: true,
      scrollSteps: 0,
      status: "complete"
    });
    expect(conversation.completeness.platformWarnings).toContain(
      "ChatGPT history pages completed the export while the source tab was inactive; provider-only transient tool UI may be less detailed than in an active-tab capture."
    );
  });

  test("keeps active ChatGPT progress at or above the authenticated history inventory", async () => {
    const document = new JSDOM(
      `<main>
        <article data-testid="conversation-turn-3">
          <div data-message-author-role="user" data-message-id="user-2">Recent question</div>
        </article>
        <article data-testid="conversation-turn-4">
          <div data-message-author-role="assistant" data-message-id="assistant-2">
            Recent answer
          </div>
        </article>
      </main>`,
      { pretendToBeVisual: true, url: "https://chatgpt.com/c/history-backed" }
    ).window.document;
    const historyMessages = [
      historyMessage("user-1", "user", "First question"),
      historyMessage("assistant-1", "assistant", "First answer"),
      historyMessage("user-2", "user", "Recent question"),
      historyMessage("assistant-2", "assistant", "Recent answer")
    ];
    const progressKnownTurnCounts: number[] = [];

    await scanCurrentConversationExport({
      chatGptHistoryLoader: async () => ({
        duplicateCount: 0,
        messages: historyMessages,
        pageCount: 1,
        reachedBottom: true,
        reachedTop: true,
        warnings: []
      }),
      document,
      hostname: "chatgpt.com",
      href: "https://chatgpt.com/c/history-backed",
      onProgress: (progress) => progressKnownTurnCounts.push(progress.knownTurnCount),
      waitForDomSettle: async () => undefined
    });

    expect(progressKnownTurnCounts.length).toBeGreaterThan(0);
    expect(progressKnownTurnCounts.every((count) => count >= historyMessages.length)).toBe(true);
  });
});

function historyMessage(
  id: string,
  role: "assistant" | "user",
  text: string
): ExportedMessage {
  return {
    authorLabel: role === "assistant" ? "ChatGPT" : "User",
    codeBlocks: [],
    id,
    images: [],
    index: 0,
    markdown: text,
    metadata: { captureSource: "chatgpt-history-api" },
    role,
    text
  };
}
