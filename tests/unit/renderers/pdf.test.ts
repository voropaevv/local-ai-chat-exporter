import { describe, expect, test } from "vitest";

import type { ConversationExport, ExportedMessage } from "../../../src/core/schema";
import { DEFAULT_PDF_SETTINGS, normalizePdfSettings } from "../../../src/renderers/pdf-settings";
import { renderPdf, renderPdfFromNormalizedConversation } from "../../../src/renderers/pdf";
import { extractPdfPositionedTextRuns, extractPdfText, pdfBodyFromBytes } from "../../helpers/pdf";

const onePixelJpeg =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAEf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABAf/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPxB//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPxB//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxB//9k=";

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

  test("embeds JPEG images, clickable links, document metadata, and a tagged structure tree", () => {
    const rendered = renderPdf(
      makeConversation({
        title: "Доступный архив",
        messages: [
          makeMessage({
            codeBlocks: [],
            images: [{ alt: "Диаграмма", dataUri: onePixelJpeg, height: 1, width: 1 }],
            markdown: "Откройте [источник](https://example.com/research?q=pdf).",
            text: "Откройте источник."
          })
        ]
      })
    );
    const body = textFromBytes(rendered.bytes);

    expect(body).toContain("/Subtype /Image");
    expect(body).toContain("/Filter /DCTDecode");
    expect(body).toContain("/XObject << /Im1");
    expect(body).toContain("/Subtype /Link");
    expect(body).toContain("/URI (https://example.com/research?q=pdf)");
    expect(body).toContain("/StructTreeRoot");
    expect(body).toContain("/MarkInfo << /Marked true >>");
    expect(body).toContain("/StructParents 0");
    expect(body).toContain("/Lang (ru)");
    expect(body).toContain("/Title (");
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

  test("segments a multi-page blockquote border across every occupied page", () => {
    const rendered = renderPdf(
      makeConversation({
        messages: [
          makeMessage({
            codeBlocks: [],
            markdown: `> ${"Long quoted evidence remains inside its page boundary. ".repeat(900)}\n\nAfter quote.`,
            text: "Long quoted evidence. After quote."
          })
        ]
      })
    );
    const body = textFromBytes(rendered.bytes);
    const pageCount = body.match(/\/Type \/Page\b/gu)?.length ?? 0;
    const quoteBorders = [...body.matchAll(/0\.8 w 58 [-\d.]+ m 58 [-\d.]+ l S/gu)];

    expect(pageCount).toBeGreaterThan(2);
    expect(quoteBorders).toHaveLength(pageCount);
    expect(extractPdfText(rendered.bytes)).toContain("After quote.");
  });

  test("does not create a trailing blank page when final spacing reaches the margin", () => {
    const rendered = renderPdf(
      makeConversation({
        messages: [
          makeMessage({
            attachments: [
              {
                description: "Markdown document",
                kind: "file",
                name: "launch-brief.md",
                sizeBytes: 18_420
              },
              {
                description: "ZIP archive",
                kind: "file",
                name: "reference-assets.zip",
                sizeBytes: 3_480_000
              }
            ],
            codeBlocks: [],
            id: "msg-1",
            index: 0,
            markdown: undefined,
            role: "user",
            authorLabel: "User",
            text: "Create a concise launch checklist using the attached brief and reference assets."
          }),
          makeMessage({
            codeBlocks: [],
            id: "msg-2",
            index: 1,
            markdown:
              "## Launch priorities\n\nStart with **reliability** and preserve the conversation structure:\n\n- Verify capture completeness without duplicate scans.\n- Keep attached files visually distinct from the message body.\n- Render source links clearly.\n\n> The export remains local and self-contained.",
            text: "Launch priorities. Start with reliability and preserve the conversation structure."
          }),
          makeMessage({
            attachments: [
              {
                description: "Interactive HTML report",
                kind: "website",
                name: "release-dashboard.html",
                url: "https://example.com/jelluvi/release-dashboard"
              }
            ],
            codeBlocks: [],
            id: "msg-3",
            index: 2,
            markdown: undefined,
            role: "user",
            authorLabel: "User",
            text: "Include the final visual and privacy checks in Preview."
          }),
          makeMessage({
            id: "msg-4",
            index: 3,
            markdown:
              "## Final checks\n\n1. Compare dark and light Preview states.\n2. Confirm files, sources, and code remain readable.\n3. Run the release checks:\n\n```sh\npnpm check\n```\n\nNo transcript upload is required.",
            text: "Final checks. Compare Preview states and run the release checks."
          })
        ]
      })
    );
    const pageCount = textFromBytes(rendered.bytes).match(/\/Type \/Page\b/gu)?.length ?? 0;

    expect(pageCount).toBe(1);
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

  test("does not append a duplicate source when its tracked URL is already inline", () => {
    const rendered = renderPdf(
      makeConversation({
        messages: [
          makeMessage({
            markdown: "[Primary source](https://example.org/report/?utm_source=chatgpt.com#result)",
            sources: [
              {
                kind: "citation",
                title: "Duplicate citation card",
                url: "https://example.org/report"
              }
            ]
          })
        ]
      })
    );
    const text = extractPdfText(rendered.bytes);

    expect(text).not.toContain("Duplicate citation card");
    expect(text).not.toContain("Sources");
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

  test("preserves box-drawing glyphs in monospaced code blocks", () => {
    const tree = [
      "kazakhstan-child-safety-cv/",
      "├── README.md",
      "├── docs/",
      "│   ├── PROJECT_CHARTER.md",
      "│   └── RISK_REGISTER.md",
      "└── reports/"
    ].join("\n");
    const rendered = renderPdf(
      makeConversation({
        messages: [
          makeMessage({
            codeBlocks: [],
            markdown: `\`\`\`\n${tree}\n\`\`\``,
            text: tree
          })
        ]
      })
    );
    const text = extractPdfText(rendered.bytes);

    expect(text).toContain(tree);
    expect(text).not.toContain("�");
  });

  test("preserves common standalone emoji with a local embedded fallback font", () => {
    const emoji = "Ready 👍 ✅ ⚠ 😀 🚀";
    const rendered = renderPdf(
      makeConversation({
        messages: [
          makeMessage({
            codeBlocks: [],
            markdown: emoji,
            text: emoji
          })
        ]
      })
    );
    const body = textFromBytes(rendered.bytes);
    const text = extractPdfText(rendered.bytes);

    expect(body).toContain("/BaseFont /NotoEmoji-Regular");
    expect(body).not.toContain("/BaseFont /NotoSansMono-Regular");
    expect(text).toContain(emoji);
    expect(text).not.toContain("�");
  });

  test("keeps a following bold paragraph below the final table border", () => {
    const rendered = renderPdf(
      makeConversation({
        messages: [
          makeMessage({
            codeBlocks: [],
            markdown:
              "| Решение | Оценка |\n| --- | --- |\n| Начать discovery после подтверждения | 8/10 |\n| Отказаться от Казахстана сейчас | 3/10 |\n\n**Лучший следующий шаг — дождаться письменного подтверждения.**",
            text: "Решение. Лучший следующий шаг."
          })
        ]
      })
    );
    const body = pdfBodyFromBytes(rendered.bytes);
    const runs = extractPdfPositionedTextRuns(rendered.bytes);
    const paragraph = runs.find((run) => run.text.startsWith("Лучший следующий шаг"));
    const tableBottoms = [
      ...body.matchAll(/[-\d.]+\s+([-\d.]+)\s+[-\d.]+\s+[-\d.]+\s+re\s+S\s+Q/gu)
    ].map((match) => Number.parseFloat(match[1]));

    expect(paragraph).toBeDefined();
    expect(tableBottoms.length).toBeGreaterThan(0);
    expect(Math.min(...tableBottoms) - (paragraph?.y ?? Number.POSITIVE_INFINITY)).toBeGreaterThan(
      paragraph?.size ?? 0
    );
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
    expect(text).toContain("Thursday 9:52 AM");
    expect(text).toContain("ZIP");
    expect(text).toContain("reference-assets.zip");
    expect(text).toContain("2.4 MB");
    expect(body).toMatch(/\bc\b/u);
    expect(body).toMatch(/\bB\b/u);
    expect(text).not.toContain("- reference-assets.zip");
    expect(text).not.toContain("Attachments");
    expect(text).not.toContain("Date:");
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
    expect(text).toContain("• Separate bullet");
  });

  test("cleans emphasis markers, omits code-language labels, and keeps currency ranges intact", () => {
    const rendered = renderPdf(
      makeConversation({
        messages: [
          makeMessage({
            markdown:
              "*Курсив без маркеров* и `child_safety_physical_aggression_alert`.\n\n| Этап | Срок | Цена |\n| --- | --- | --- |\n| Масштабирование | 2–3 месяца | $12 000–17 000 |\n\n```ts\nconst alert_name = true;\n```",
            text: "Курсив без маркеров. Масштабирование."
          })
        ]
      })
    );
    const text = extractPdfText(rendered.bytes);

    expect(text).toContain("Курсив без маркеров");
    expect(text).not.toContain("*Курсив без маркеров*");
    expect(text).toContain("$12 000–17 000");
    expect(text).not.toMatch(/(?:^|\n)ts(?:\n|$)/u);
    expect(text).toContain("const alert_name = true;");
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

    expect(text).toContain("• Parent introduction\ncontinued parent detail");
    expect(text).toContain("3. Nested third\ncontinued nested detail");
    expect(text).toContain("4. Nested fourth");
    expect(text).toContain("trailing parent detail");
    expect(text).toContain("• Second parent");
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
