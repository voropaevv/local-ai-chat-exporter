import { strFromU8, unzipSync } from "fflate";
import { describe, expect, test } from "vitest";

import type { ConversationExport, ExportedMessage } from "../../../src/core/schema";
import { renderDocx } from "../../../src/renderers/docx";

function makeMessage(overrides: Partial<ExportedMessage> = {}): ExportedMessage {
  return {
    id: "msg-1",
    index: 0,
    role: "assistant",
    authorLabel: "ChatGPT",
    text: "Here is a table and code.",
    markdown:
      "Here is a table.\n\n| Format | Use |\n| --- | --- |\n| DOCX | Review |\n\n```ts\nconst value = 1;\n```",
    codeBlocks: [{ language: "ts", code: "const value = 1;\n" }],
    images: [],
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
    sourceUrl: "https://chatgpt.com/c/docx",
    title: "DOCX Export",
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

describe("renderDocx", () => {
  test("creates a minimal local OpenXML document with headings, code, table, and metadata", () => {
    const rendered = renderDocx(makeConversation());

    expect(rendered.format).toBe("docx");
    expect(rendered.mimeType).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(rendered.bytes).toBeInstanceOf(Uint8Array);

    const zip = unzipSync(rendered.bytes);
    const documentXml = strFromU8(zip["word/document.xml"]);
    const coreXml = strFromU8(zip["docProps/core.xml"]);

    expect(Object.keys(zip).sort()).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "docProps/app.xml",
      "docProps/core.xml",
      "word/document.xml",
      "word/styles.xml"
    ]);
    expect(documentXml).toContain("DOCX Export");
    expect(documentXml).toContain("1. ChatGPT");
    expect(documentXml).toContain("const value = 1;");
    expect(documentXml).toContain("<w:tbl>");
    expect(documentXml).toContain("<w:t>DOCX</w:t>");
    expect(coreXml).toContain("<dc:title>DOCX Export</dc:title>");
    expect(coreXml).toContain("<cp:keywords>local-ai-chat-exporter</cp:keywords>");
  });
});
