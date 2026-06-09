import { describe, expect, test } from "vitest";

import type { ConversationExport, ExportedMessage } from "../../../src/core/schema";
import { DEFAULT_PDF_SETTINGS, normalizePdfSettings } from "../../../src/renderers/pdf-settings";
import { renderPdf, renderPdfFromNormalizedConversation } from "../../../src/renderers/pdf";

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

describe("renderPdf", () => {
  test("creates a local real PDF from semantic conversation content", () => {
    const rendered = renderPdf(
      makeConversation({
        messages: [
          makeMessage({
            markdown:
              "Print-ready answer.\n\n- First item\n- Second item\n\n| Format | Use |\n| --- | --- |\n| PDF | Archive |\n\n```ts\nconsole.log('local');\n```"
          })
        ]
      })
    );
    const body = textFromBytes(rendered.bytes);

    expect(rendered.format).toBe("pdf");
    expect(rendered.filename).toBe("2026-05-31T10-20-30Z_chatgpt_PDF-Export.pdf");
    expect(rendered.mimeType).toBe("application/pdf");
    expect(rendered.encoding).toBe("binary");
    expect(rendered.bytes).toBeInstanceOf(Uint8Array);
    expect(body).toMatch(/^%PDF-1\.[34]/u);
    expect(body).toContain("%%EOF");
    expect(body).toContain("PDF Export");
    expect(body).toContain("ChatGPT");
    expect(body).toContain("First item");
    expect(body).toContain("Format");
    expect(body).toContain("console.log");
    expect(body).not.toContain("<html");
    expect(body).not.toContain("<script");
    expect(body).not.toContain("data-testid");
    expect(body).not.toContain("markdown prose");
    expect(body).not.toContain("flex w-full");
    expect(body).not.toContain("user-message-bubble-color");
  });

  test("applies normalized PDF settings including page size, orientation, template, and TOC", () => {
    const rendered = renderPdf(makeConversation(), {
      pdfSettings: {
        fontSizePt: 10,
        includeToc: true,
        marginPt: 36,
        orientation: "landscape",
        pageSize: "letter",
        template: "dark"
      }
    });
    const body = textFromBytes(rendered.bytes);

    expect(body).toContain("/MediaBox [0 0 792 612]");
    expect(body).toContain("Table of contents");
    expect(body).toContain("PDF Export");
    expect(body).toContain("0.067 0.094 0.153 rg");
  });

  test("adds pages automatically for long conversations", () => {
    const messages = Array.from({ length: 35 }, (_, index) =>
      makeMessage({
        id: `msg-${index + 1}`,
        index,
        markdown: `Long paragraph ${index + 1}. ${"This is local PDF content. ".repeat(12)}`
      })
    );
    const rendered = renderPdf(makeConversation({ messages }));
    const pageCount = textFromBytes(rendered.bytes).match(/\/Type \/Page\b/gu)?.length ?? 0;

    expect(pageCount).toBeGreaterThan(1);
  });

  test("can omit source metadata when metadata is disabled", () => {
    const rendered = renderPdf(makeConversation(), { includeMetadata: false });
    const body = textFromBytes(rendered.bytes);

    expect(body).not.toContain("Source:");
    expect(body).not.toContain("https://chatgpt.com/c/pdf");
    expect(body).toContain("Print-ready answer");
  });

  test("renders advanced sources, canvas fallback, and visible thinking in local PDF", () => {
    const rendered = renderPdf(
      makeConversation({
        messages: [
          makeMessage({
            canvas: [
              {
                title: "Canvas draft",
                url: "https://chatgpt.com/canvas/local",
                warning:
                  "Canvas content was detected but could not be extracted from the current DOM. Open the canvas link or capture it manually."
              }
            ],
            sources: [
              {
                kind: "deep_research",
                snippet: "Peer-reviewed source.",
                title: "Genome Paper",
                url: "https://example.org/genome-paper"
              }
            ],
            thinkingBlocks: [{ text: "Visible reasoning text.", title: "Thinking" }]
          })
        ]
      })
    );
    const body = textFromBytes(rendered.bytes);

    expect(body).toContain("Sources");
    expect(body).toContain("Deep Research source");
    expect(body).toContain("Genome Paper");
    expect(body).toContain("Canvas");
    expect(body).toContain("Canvas content was detected");
    expect(body).toContain("Visible thinking / reasoning");
    expect(body).toContain("Visible reasoning text.");
  });

  test("falls back to local PDF-ready HTML with a visible warning if PDF generation fails", () => {
    const rendered = renderPdfFromNormalizedConversation(makeConversation(), {}, () => {
      throw new Error("synthetic pdf failure");
    });

    expect(rendered.format).toBe("pdf");
    expect(rendered.filename).toBe("2026-05-31T10-20-30Z_chatgpt_PDF-Export.print-ready-html.html");
    expect(rendered.mimeType).toBe("text/html;charset=utf-8");
    expect(rendered.encoding).toBe("utf-8");
    expect(rendered.bytes).toContain("PDF generation failed locally.");
    expect(rendered.bytes).toContain("No conversation content was uploaded or sent to a server.");
    expect(rendered.bytes).toContain("synthetic pdf failure");
  });
});

describe("normalizePdfSettings", () => {
  test("normalizes PDF settings conservatively", () => {
    expect(normalizePdfSettings()).toEqual(DEFAULT_PDF_SETTINGS);
    expect(
      normalizePdfSettings({
        fontSizePt: 40,
        includeToc: true,
        marginPt: -1,
        orientation: "sideways",
        pageSize: "poster",
        template: "dark"
      })
    ).toEqual({
      ...DEFAULT_PDF_SETTINGS,
      fontSizePt: DEFAULT_PDF_SETTINGS.fontSizePt,
      includeToc: true,
      marginPt: DEFAULT_PDF_SETTINGS.marginPt,
      template: "dark"
    });
  });
});

function makeConversation(overrides: Partial<ConversationExport> = {}): ConversationExport {
  const messages = overrides.messages ?? [makeMessage()];

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
    messages,
    ...overrides
  };
}

function textFromBytes(bytes: string | Uint8Array): string {
  expect(bytes).toBeInstanceOf(Uint8Array);

  return new TextDecoder("latin1").decode(bytes as Uint8Array);
}
