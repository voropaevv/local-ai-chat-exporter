import { describe, expect, test } from "vitest";

import type { ConversationExport, ExportedMessage } from "../../../src/core/schema";
import { DEFAULT_PDF_SETTINGS, normalizePdfSettings } from "../../../src/renderers/pdf-settings";
import { renderPdf, renderPdfFromNormalizedConversation } from "../../../src/renderers/pdf";
import { extractPdfText, pdfBodyFromBytes } from "../../helpers/pdf";

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
    const text = extractPdfText(rendered.bytes);

    expect(rendered.format).toBe("pdf");
    expect(rendered.filename).toBe("2026-05-31T10-20-30Z_chatgpt_PDF-Export.pdf");
    expect(rendered.mimeType).toBe("application/pdf");
    expect(rendered.encoding).toBe("binary");
    expect(rendered.bytes).toBeInstanceOf(Uint8Array);
    expect(body).toMatch(/^%PDF-1\.[34]/u);
    expect(body).toContain("%%EOF");
    expect(body).toContain("/BaseFont /NotoSans-Regular");
    expect(body).toContain("/BaseFont /NotoSans-Bold");
    expect(body).toContain("/BaseFont /NotoSansMono-Regular");
    expect(body).toContain("/Encoding /Identity-H");
    expect(body).toContain("/FontFile2");
    expect(body).toContain("/ToUnicode");
    expect(text).toContain("PDF Export");
    expect(text).toContain("ChatGPT");
    expect(text).toContain("First item");
    expect(text).toContain("Format");
    expect(text).toContain("console.log");
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
    const text = extractPdfText(rendered.bytes);

    expect(body).toContain("/MediaBox [0 0 792 612]");
    expect(text).toContain("Table of contents");
    expect(text).toContain("PDF Export");
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
    const text = extractPdfText(rendered.bytes);

    expect(text).not.toContain("Source:");
    expect(text).not.toContain("https://chatgpt.com/c/pdf");
    expect(text).toContain("Print-ready answer");
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
    const text = extractPdfText(rendered.bytes);

    expect(text).toContain("Sources");
    expect(text).toContain("Deep Research source");
    expect(text).toContain("Genome Paper");
    expect(text).toContain("Canvas");
    expect(text).toContain("Canvas content was detected");
    expect(text).toContain("Visible thinking / reasoning");
    expect(text).toContain("Visible reasoning text.");
  });

  test("preserves Cyrillic in embedded PDF text", () => {
    const rendered = renderPdf(
      makeConversation({
        title: "Спикеры мастер-класса YouTube",
        messages: [
          makeMessage({
            authorLabel: "Пользователь",
            markdown:
              'Кто будет выступать тут? Представители YouTube Academy.\n\n**Мероприятие:** 30 июля 2026 года.\n\n```ts\nconst привет = "мир";\n```'
          })
        ]
      })
    );
    const text = extractPdfText(rendered.bytes);

    expect(text).toContain("Спикеры мастер-класса YouTube");
    expect(text).toContain("Пользователь");
    expect(text).toContain("Кто будет выступать тут?");
    expect(text).toContain("Мероприятие: 30 июля 2026 года.");
    expect(text).toContain('const привет = "мир";');
    expect(text).not.toContain("????");
  });

  test("preserves mathematical relations in headings, paragraphs, and table cells", () => {
    const rendered = renderPdf(
      makeConversation({
        messages: [
          makeMessage({
            codeBlocks: [],
            markdown:
              "## Условия ≤ ≥ ≠\n\nПорог предложения ≥$120k, верхняя граница ≤$180k и значение ≠0.\n\n| Проверка | Значение |\n| --- | --- |\n| Диапазон | ≥$120k, ≤$180k, ≠0 |",
            text: "Условия ≤ ≥ ≠. Порог предложения ≥$120k, верхняя граница ≤$180k и значение ≠0."
          })
        ]
      })
    );
    const body = textFromBytes(rendered.bytes);
    const text = extractPdfText(rendered.bytes);

    expect(body).toContain("/BaseFont /NotoSansMono-Regular");
    expect(text.match(/≥/gu)).toHaveLength(3);
    expect(text.match(/≤/gu)).toHaveLength(3);
    expect(text.match(/≠/gu)).toHaveLength(3);
    expect(text).not.toContain("�");
  });

  test("uses readable dates and attachment labels without redundant role or complete status", () => {
    const rendered = renderPdf(
      makeConversation({
        messages: [
          makeMessage({
            attachments: [
              {
                description: "ZIP archive",
                kind: "file",
                name: "reference-assets.zip",
                sizeBytes: 2_400_000
              }
            ],
            createdAt: "2026-05-31T10:22:00.000Z",
            metadata: { displayTimestamp: "Thursday 9:52 AM" }
          })
        ]
      })
    );
    const body = textFromBytes(rendered.bytes);
    const text = extractPdfText(rendered.bytes);

    expect(text).toContain("Exported: 31 May 2026, 10:20 UTC");
    expect(text).toContain("Date: Thursday 9:52 AM");
    expect(text).toContain("Attachments");
    expect(text).toContain("ZIP");
    expect(text).toContain("reference-assets.zip");
    expect(text).toContain("2.4 MB");
    expect(body).toMatch(/\bre S\b/u);
    expect(text).not.toContain("- reference-assets.zip");
    expect(text).not.toContain("Role:");
    expect(text).not.toContain("Completeness:");
    expect(text).not.toContain("Capture status:");
  });

  test("preserves ordered-list numbering, including a non-default start marker", () => {
    const rendered = renderPdf(
      makeConversation({
        messages: [
          makeMessage({
            codeBlocks: [],
            markdown: "3. Third step\n4. Fourth step\n\n- Separate bullet",
            text: "Third step. Fourth step. Separate bullet."
          })
        ]
      })
    );
    const text = extractPdfText(rendered.bytes);

    expect(text).toContain("3. Third step");
    expect(text).toContain("4. Fourth step");
    expect(text).toContain("- Separate bullet");
  });

  test("keeps thematic separators on the current page and reserves page breaks for an explicit command", () => {
    const thematic = renderPdf(
      makeConversation({
        messages: [
          makeMessage({
            codeBlocks: [],
            markdown: "Before separator.\n\n---\n\nAfter separator.",
            text: "Before separator. After separator."
          })
        ]
      })
    );
    const explicitBreak = renderPdf(
      makeConversation({
        messages: [
          makeMessage({
            codeBlocks: [],
            markdown: "Before page break.\n\n\\pagebreak\n\nAfter page break.",
            text: "Before page break. After page break."
          })
        ]
      })
    );

    expect(textFromBytes(thematic.bytes).match(/\/Type \/Page\b/gu)).toHaveLength(1);
    expect(extractPdfText(thematic.bytes)).toContain("Before separator.");
    expect(extractPdfText(thematic.bytes)).toContain("After separator.");
    expect(textFromBytes(explicitBreak.bytes).match(/\/Type \/Page\b/gu)).toHaveLength(2);
  });

  test("preserves nested list hierarchy and continuation lines", () => {
    const rendered = renderPdf(
      makeConversation({
        messages: [
          makeMessage({
            codeBlocks: [],
            markdown:
              "- Parent introduction\n  continued parent detail\n  3. Nested third\n     continued nested detail\n  4. Nested fourth\n  trailing parent detail\n- Second parent",
            text: "Parent introduction. Nested third. Nested fourth. Second parent."
          })
        ]
      })
    );
    const body = textFromBytes(rendered.bytes);
    const text = extractPdfText(rendered.bytes);

    expect(text).toContain("- Parent introduction continued parent detail");
    expect(text).toContain("3. Nested third continued nested detail");
    expect(text).toContain("4. Nested fourth");
    expect(text).toContain("trailing parent detail");
    expect(text).toContain("- Second parent");
    expect(body).toMatch(/\b66 [\d.]+ Td\b/u);
    expect(body).toMatch(/\b82 [\d.]+ Td\b/u);
  });

  test("omits the monospaced font when the conversation has no code", () => {
    const rendered = renderPdf(
      makeConversation({
        messages: [
          makeMessage({
            codeBlocks: [],
            markdown: "Обычный текст без блока кода.",
            text: "Обычный текст без блока кода."
          })
        ]
      })
    );
    const body = textFromBytes(rendered.bytes);

    expect(body).not.toContain("/BaseFont /NotoSansMono-Regular");
    expect(body).toContain("/F3 3 0 R");
    expect(extractPdfText(rendered.bytes)).toContain("Обычный текст без блока кода.");
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

  return pdfBodyFromBytes(bytes as Uint8Array);
}
