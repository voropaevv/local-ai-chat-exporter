import { describe, expect, test } from "vitest";
import {
  normalizeChatGptCitations,
  UNAVAILABLE_CITATION_WARNING
} from "../../../../src/adapters/chatgpt/conversation-citations";
import { parseChatGptConversationData } from "../../../../src/adapters/chatgpt/conversation-data";
import { normalizeMessagesWithStats } from "../../../../src/core/normalize";
import { renderConversationFiles } from "../../../../src/core/export-options";
import type { ConversationExport } from "../../../../src/core/schema";

const citation = "\uE200cite\uE202turn0search0\uE201";
const fileCitation = "\uE200filecite\uE202turn0file0\uE201";

function message(role: "user" | "assistant", text: string, metadata: Record<string, unknown> = {}) {
  return {
    id: `test-${role}`,
    author: { role },
    channel: "final",
    recipient: "all",
    content: { content_type: "text", parts: [text] },
    metadata
  };
}

describe("ChatGPT API citation normalization", () => {
  test("marks unavailable citations explicitly without changing neighboring content or inventing a URL", () => {
    const result = normalizeChatGptCitations(
      `Before. ${citation} After [public](https://example.com/page).`,
      {}
    );
    expect(result.text).toBe(
      "Before. [Citation unavailable] After [public](https://example.com/page)."
    );
    expect(result.sources).toEqual([]);
    expect(result.warning).toBe(UNAVAILABLE_CITATION_WARNING);
  });

  test("keeps explicitly associated public metadata sources and deduplicates repeated references", () => {
    const source = {
      matched_text: citation,
      url: "https://example.com/source",
      title: "Public source"
    };
    const result = normalizeChatGptCitations(`First ${citation}. Again ${citation}.`, {
      content_references: [source, source]
    });
    expect(result.text).toBe(
      "First [Public source](https://example.com/source). Again [Public source](https://example.com/source)."
    );
    expect(result.sources).toEqual([
      { kind: "citation", title: "Public source", url: "https://example.com/source" }
    ]);
    expect(result.warning).toBeUndefined();
  });

  test("resolves only exact source marker offsets, including citation metadata wrappers", () => {
    const text = `Prefix ${citation} suffix.`;
    const result = normalizeChatGptCitations(text, {
      citations: [
        {
          start_ix: 7,
          end_ix: 7 + citation.length,
          metadata: { url: "https://example.com/page", title: "Source" }
        }
      ]
    });
    expect(result.text).toBe("Prefix [Source](https://example.com/page) suffix.");
    expect(result.warning).toBeUndefined();
    expect(
      normalizeChatGptCitations(text, {
        content_references: [
          { start_idx: 0, end_idx: text.length, url: "https://example.com/unrelated" }
        ]
      }).sources
    ).toEqual([]);
  });

  test("keeps all supplied links for a combined marker without guessing individual turn mappings", () => {
    const multiple = "\uE200cite\uE202turn0search0\uE202turn1view1\uE201";
    const result = normalizeChatGptCitations(`Claim ${multiple}.`, {
      content_references: [
        { matched_text: multiple, title: "One", url: "https://example.com/one" },
        { matched_text: multiple, title: "Two", url: "https://example.org/two" }
      ]
    });
    expect(result.text).toBe(
      "Claim [One](https://example.com/one) [Two](https://example.org/two)."
    );
    expect(result.sources).toHaveLength(2);
  });

  test.each([
    "javascript:alert(1)",
    "data:text/plain,secret",
    "file:///private/file",
    "https://user:password@example.com/",
    "/relative"
  ])("does not promote an unsafe or credential-bearing citation URL: %s", (url) => {
    const result = normalizeChatGptCitations(citation, {
      content_references: [{ matched_text: citation, url }]
    });
    expect(result.text).toBe("[Citation unavailable]");
    expect(result.sources).toEqual([]);
    expect(result.warning).toBe(UNAVAILABLE_CITATION_WARNING);
  });

  test("escapes supplied labels and URL parentheses without dropping their meaning", () => {
    const result = normalizeChatGptCitations(citation, {
      content_references: [
        { matched_text: citation, title: "Title [brackets]", url: "https://example.com/a_(b)" }
      ]
    });
    expect(result.text).toBe("[Title \\[brackets\\]](https://example.com/a_%28b%29)");
    expect(result.sources[0].url).toBe("https://example.com/a_(b)");
  });

  test("preserves literal provider syntax in inline, indented and fenced code", () => {
    const source = [
      "`" + citation + "`",
      "`` literal ` " + citation + " ``",
      "    " + citation,
      "```text",
      citation,
      "```",
      "~~~text",
      fileCitation,
      "~~~"
    ].join("\n");
    const result = normalizeChatGptCitations(source, {});
    expect(result.text).toBe(source);
    expect(result.warning).toBeUndefined();
  });

  test("handles unavailable file citations but does not erase other provider tags or arbitrary private-use text", () => {
    const other = "\uE200canvas\uE202substantive text\uE201 \uE055 custom";
    expect(normalizeChatGptCitations(`${fileCitation} ${other}`, {}).text).toBe(
      `[Citation unavailable] ${other}`
    );
  });

  test("applies to assistant output only and propagates missing-link warnings", () => {
    const parsed = parseChatGptConversationData({
      messages: [message("user", citation), message("assistant", citation)]
    });
    expect(parsed?.messages[0].text).toBe(citation);
    expect(parsed?.messages[1].text).toBe("[Citation unavailable]");
    expect(parsed?.messages[1].markdown).toBe("[Citation unavailable]");
    expect(parsed?.warnings).toEqual([UNAVAILABLE_CITATION_WARNING]);
  });

  test("retains the correction through production parser, normalization and export rendering", () => {
    const parsed = parseChatGptConversationData({
      messages: [message("assistant", `Visible claim ${citation}.`)]
    });
    expect(parsed).toBeDefined();
    const normalized = normalizeMessagesWithStats(parsed!.messages);
    const conversation: ConversationExport = {
      schemaVersion: "1.0",
      platform: "chatgpt",
      platformLabel: "ChatGPT",
      sourceUrl: "https://chatgpt.com/c/synthetic-regression",
      exportedAt: "2026-09-12T00:00:00Z",
      messageCount: normalized.messages.length,
      messages: normalized.messages,
      completeness: {
        status: "complete",
        messageCount: 1,
        warnings: parsed!.warnings ?? [],
        platformWarnings: [],
        reachedTop: true,
        reachedBottom: true,
        scrollSteps: 0,
        duplicateCount: 0
      }
    };
    const files = renderConversationFiles(conversation, {
      formats: ["md", "pdf"],
      includeMetadata: false
    });
    const markdown = files.find(({ format }) => format === "md")!.bytes;
    expect(markdown).toContain("Visible claim [Citation unavailable].");
    expect(markdown).not.toContain(citation);
    expect(files.find(({ format }) => format === "pdf")?.bytes).toBeInstanceOf(Uint8Array);
  });
});
