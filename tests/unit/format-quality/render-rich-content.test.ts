import { strFromU8, unzipSync } from "fflate";
import { describe, expect, test } from "vitest";

import type { ConversationExport, ExportedMessage } from "../../../src/core/schema";
import { renderDocx, renderHtml, renderMarkdown } from "../../../src/renderers";

function makeMessage(overrides: Partial<ExportedMessage> = {}): ExportedMessage {
  return {
    id: "rich-msg-1",
    index: 0,
    role: "assistant",
    authorLabel: "ChatGPT",
    text: "Review the export docs and keep inline math \\(a^2 + b^2 = c^2\\).",
    markdown:
      'Review the [export docs](https://example.com/docs?topic=exports&safe=1).\n\n| Format | Use |\n| --- | --- |\n| Markdown | Archive |\n\n```ts\n  const value = "<tag>";\n\n  console.log(value);\n```\n\nDisplay math stays raw: $$E = mc^2$$.',
    html: '<p>Review the <a href="https://example.com/docs?topic=exports&amp;safe=1">export docs</a>.</p><table><tbody><tr><td>Markdown</td><td>Archive</td></tr></tbody></table>',
    codeBlocks: [
      {
        code: '  const value = "<tag>";\n\n  console.log(value);\n',
        language: "ts"
      }
    ],
    images: [
      {
        alt: "Architecture diagram",
        height: 360,
        src: "https://example.com/diagram.png",
        width: 640
      }
    ],
    metadata: {},
    ...overrides
  };
}

function makeConversation(): ConversationExport {
  const messages = [makeMessage()];

  return {
    schemaVersion: "1.0",
    platform: "chatgpt",
    platformLabel: "ChatGPT",
    sourceUrl: "https://chatgpt.com/c/rich",
    title: "Rich content",
    exportedAt: "2026-05-31T10:20:30.000Z",
    messageCount: messages.length,
    completeness: {
      status: "complete",
      warnings: [],
      messageCount: messages.length,
      reachedTop: true,
      reachedBottom: true,
      scrollSteps: 1,
      duplicateCount: 0,
      platformWarnings: []
    },
    messages
  };
}

describe("rich content renderers", () => {
  test("markdown and html keep links, tables, code, raw math, and image metadata readable", () => {
    const conversation = makeConversation();
    const markdown = renderMarkdown(conversation).bytes;
    const html = renderHtml(conversation).bytes;

    expect(markdown).toContain("[export docs](https://example.com/docs?topic=exports&safe=1)");
    expect(markdown).toContain("| Markdown | Archive |");
    expect(markdown).toContain('```ts\n  const value = "<tag>";\n\n  console.log(value);\n```');
    expect(markdown).toContain("$$E = mc^2$$");
    expect(html).toContain("<table>");
    expect(html).toContain("Architecture diagram");
    expect(html).toContain("https://example.com/diagram.png");
    expect(html).not.toContain('<img src="https://example.com/diagram.png"');
  });

  test("docx includes readable table, code, math, and image metadata", () => {
    const rendered = renderDocx(makeConversation());
    const documentXml = strFromU8(unzipSync(rendered.bytes)["word/document.xml"]);

    expect(documentXml).toContain("<w:tbl>");
    expect(documentXml).toContain("const value = &quot;&lt;tag&gt;&quot;;");
    expect(documentXml).toContain("$$E = mc^2$$");
    expect(documentXml).toContain("Image: Architecture diagram");
  });
});
