import { describe, expect, test } from "vitest";

import type { ConversationExport, ExportedMessage } from "../../../src/core/schema";
import { renderPdf } from "../../../src/renderers/pdf";

function makeMessage(overrides: Partial<ExportedMessage> = {}): ExportedMessage {
  return {
    id: "msg-1",
    index: 0,
    role: "assistant",
    authorLabel: "ChatGPT",
    text: "Print-ready answer.",
    markdown: "Print-ready answer.\n\n```ts\nconsole.log('local');\n```",
    codeBlocks: [{ language: "ts", code: "console.log('local');\n" }],
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
    sourceUrl: "https://chatgpt.com/c/pdf",
    title: "PDF Export",
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

describe("renderPdf", () => {
  test("creates a local print-ready HTML flow with save-as-PDF instructions", () => {
    const rendered = renderPdf(makeConversation());

    expect(rendered.format).toBe("pdf");
    expect(rendered.filename).toBe("2026-05-31T10-20-30Z_chatgpt_PDF-Export.pdf.html");
    expect(rendered.mimeType).toBe("text/html;charset=utf-8");
    expect(rendered.bytes).toContain("Use your browser print dialog to save this page as PDF.");
    expect(rendered.bytes).toContain("@media print");
    expect(rendered.bytes).toContain("<pre><code");
    expect(rendered.bytes).not.toContain("https://fonts.");
    expect(rendered.bytes).not.toContain("<script");
  });
});
