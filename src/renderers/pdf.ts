import type {
  ConversationExport,
  ExportedCodeBlock,
  ExportedImageRef,
  ExportedMessage
} from "../core/schema";
import {
  renderImageReferenceText,
  sanitizeConversationImagesForOutput
} from "../core/image-safety";
import { renderFilenameTemplate } from "../utils/filename-template";
import { formatCanvasPlain, formatSourcePlain, formatThinkingPlain } from "./advanced-content";
import { renderHtml } from "./html";
import { normalizePdfText, PdfFontRegistry, type PdfEmbeddedFont, type PdfFont } from "./pdf-font";
import { DEFAULT_PDF_SETTINGS, normalizePdfSettings, type PdfSettings } from "./pdf-settings";
import type { RenderedFile, RendererOptions } from "./types";

interface PdfTheme {
  readonly background: PdfColor;
  readonly border: PdfColor;
  readonly codeBackground?: PdfColor;
  readonly heading: PdfColor;
  readonly muted: PdfColor;
  readonly text: PdfColor;
}

interface PdfColor {
  readonly b: number;
  readonly g: number;
  readonly r: number;
}

interface PdfPageSize {
  readonly height: number;
  readonly width: number;
}

interface PdfPage {
  readonly commands: string[];
}

interface PdfDocument {
  readonly fonts: PdfFontRegistry;
  readonly pages: readonly PdfPage[];
  readonly size: PdfPageSize;
}

interface PdfBlock {
  readonly kind: "paragraph" | "heading" | "list" | "code" | "table" | "page-break";
  readonly items?: readonly string[];
  readonly language?: string;
  readonly level?: number;
  readonly rows?: readonly (readonly string[])[];
  readonly text?: string;
}

type PdfByteGenerator = (
  conversation: ConversationExport,
  settings: PdfSettings,
  options: RendererOptions
) => Uint8Array;

const PAGE_SIZES: Readonly<Record<PdfSettings["pageSize"], PdfPageSize>> = {
  a4: { height: 841.89, width: 595.28 },
  letter: { height: 792, width: 612 }
};

const THEMES: Readonly<Record<PdfSettings["template"], PdfTheme>> = {
  dark: {
    background: { b: 0.153, g: 0.094, r: 0.067 },
    border: { b: 0.42, g: 0.322, r: 0.251 },
    codeBackground: { b: 0.22, g: 0.157, r: 0.118 },
    heading: { b: 1, g: 1, r: 1 },
    muted: { b: 0.839, g: 0.78, r: 0.702 },
    text: { b: 0.949, g: 0.949, r: 0.933 }
  },
  light: {
    background: { b: 1, g: 1, r: 1 },
    border: { b: 0.894, g: 0.871, r: 0.847 },
    codeBackground: { b: 0.969, g: 0.965, r: 0.949 },
    heading: { b: 0.196, g: 0.122, r: 0.075 },
    muted: { b: 0.431, g: 0.384, r: 0.341 },
    text: { b: 0.196, g: 0.122, r: 0.075 }
  },
  simple: {
    background: { b: 1, g: 1, r: 1 },
    border: { b: 0.78, g: 0.78, r: 0.78 },
    heading: { b: 0, g: 0, r: 0 },
    muted: { b: 0.25, g: 0.25, r: 0.25 },
    text: { b: 0, g: 0, r: 0 }
  }
};

export function renderPdf(
  conversation: ConversationExport,
  options: RendererOptions = {}
): RenderedFile<string | Uint8Array> {
  return renderPdfFromNormalizedConversation(conversation, options);
}

export function renderPdfFromNormalizedConversation(
  conversation: ConversationExport,
  options: RendererOptions = {},
  createPdfBytes: PdfByteGenerator = renderLocalPdfBytes
): RenderedFile<string | Uint8Array> {
  const settings = normalizePdfSettings(options.pdfSettings ?? DEFAULT_PDF_SETTINGS);
  const safeConversation = sanitizeConversationImagesForOutput(conversation);

  try {
    return {
      bytes: createPdfBytes(safeConversation, settings, options),
      encoding: "binary",
      filename: renderFilenameTemplate(options.filenameTemplate ?? "", {
        conversationId: safeConversation.conversationId,
        exportedAt: safeConversation.exportedAt,
        format: "pdf",
        platform: safeConversation.platform,
        title: safeConversation.title
      }),
      format: "pdf",
      mimeType: "application/pdf"
    };
  } catch (error) {
    return renderPdfReadyHtmlFallback(safeConversation, options, error);
  }
}

function renderLocalPdfBytes(
  conversation: ConversationExport,
  settings: PdfSettings,
  options: RendererOptions
): Uint8Array {
  const layout = new PdfLayout(resolvePageSize(settings), settings);

  layout.title(conversation.title ?? "Untitled conversation");

  if (options.includeMetadata !== false) {
    layout.metadata([
      ["Platform", conversation.platformLabel],
      ...(conversation.sourceUrl.trim().length > 0
        ? [["Source", conversation.sourceUrl] as const]
        : []),
      ["Exported", conversation.exportedAt],
      ["Messages", String(conversation.messageCount)],
      ["Completeness", conversation.completeness.status]
    ]);
  }

  const warnings = [
    ...conversation.completeness.warnings,
    ...conversation.completeness.platformWarnings
  ];

  if (warnings.length > 0) {
    layout.heading("Warnings", 2);
    layout.list(warnings, false);
  }

  if (settings.includeToc) {
    layout.heading("Table of contents", 2);
    layout.list(
      conversation.messages.map(
        (message) => `${message.index + 1}. ${normalizeSingleLine(message.authorLabel)}`
      ),
      false
    );
  }

  conversation.messages.forEach((message) => renderMessage(layout, message));

  return writePdf(layout.toDocument());
}

function renderPdfReadyHtmlFallback(
  conversation: ConversationExport,
  options: RendererOptions,
  error: unknown
): RenderedFile<string> {
  const fallback = renderHtml(conversation, options);
  const reason = error instanceof Error ? error.message : "Unknown PDF generation failure.";
  const warning = `<p><strong>PDF generation failed locally.</strong> Falling back to PDF-ready HTML. No conversation content was uploaded or sent to a server. Reason: ${escapeHtml(reason)}</p>`;

  return {
    bytes: fallback.bytes.replace(
      "<p>This export was generated locally by extension.</p>",
      `<p>This export was generated locally by extension.</p>\n        ${warning}`
    ),
    encoding: "utf-8",
    filename: ensureHtmlExtension(
      renderFilenameTemplate(options.filenameTemplate ?? "", {
        conversationId: conversation.conversationId,
        exportedAt: conversation.exportedAt,
        format: "print-ready-html",
        platform: conversation.platform,
        title: conversation.title
      })
    ),
    format: "pdf",
    mimeType: "text/html;charset=utf-8"
  };
}

function renderMessage(layout: PdfLayout, message: ExportedMessage): void {
  layout.keepWithNext();
  layout.heading(`${message.index + 1}. ${normalizeSingleLine(message.authorLabel)}`, 2);
  layout.note(
    [
      `Role: ${message.role}`,
      ...(message.model !== undefined ? [`Model: ${message.model}`] : []),
      ...(message.createdAt !== undefined ? [`Created: ${message.createdAt}`] : [])
    ].join(" - ")
  );

  for (const block of parseMessageBlocks(message)) {
    renderBlock(layout, block);
  }

  if (message.images.length > 0) {
    layout.heading("Images", 3);
    layout.list(message.images.map(renderImageReference), false);
  }

  if ((message.sources?.length ?? 0) > 0) {
    layout.heading("Sources", 3);
    layout.list(message.sources!.map(formatSourcePlain), false);
  }

  if ((message.canvas?.length ?? 0) > 0) {
    layout.heading("Canvas", 3);
    layout.list(message.canvas!.map(formatCanvasPlain), false);
  }

  if ((message.thinkingBlocks?.length ?? 0) > 0) {
    layout.heading("Visible thinking / reasoning", 3);
    layout.list(message.thinkingBlocks!.map(formatThinkingPlain), false);
  }

  layout.space(6);
}

function renderBlock(layout: PdfLayout, block: PdfBlock): void {
  switch (block.kind) {
    case "code":
      layout.code(block.text ?? "", block.language);
      return;
    case "heading":
      layout.heading(block.text ?? "", block.level ?? 3);
      return;
    case "list":
      layout.list(block.items ?? [], false);
      return;
    case "page-break":
      layout.pageBreak();
      return;
    case "paragraph":
      layout.paragraph(block.text ?? "");
      return;
    case "table":
      layout.table(block.rows ?? []);
      return;
  }
}

function parseMessageBlocks(message: ExportedMessage): readonly PdfBlock[] {
  if (message.markdown === undefined || message.markdown.trim().length === 0) {
    return parsePlainTextBlocks(message.text, message.codeBlocks);
  }

  return parseMarkdownBlocks(message.markdown, message.codeBlocks);
}

function parsePlainTextBlocks(
  text: string,
  codeBlocks: readonly ExportedCodeBlock[]
): readonly PdfBlock[] {
  return [
    ...text
      .replace(/\r\n?/g, "\n")
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length > 0)
      .map((paragraph): PdfBlock => ({ kind: "paragraph", text: paragraph })),
    ...codeBlocks.map(
      (codeBlock): PdfBlock => ({
        kind: "code",
        language: codeBlock.language,
        text: codeBlock.code
      })
    )
  ];
}

function parseMarkdownBlocks(
  markdown: string,
  codeBlocks: readonly ExportedCodeBlock[]
): readonly PdfBlock[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: PdfBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    if (line.trim() === "---" || line.trim() === "\\pagebreak") {
      blocks.push({ kind: "page-break" });
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const parsed = parseFencedCode(lines, index);
      blocks.push({ kind: "code", language: parsed.language, text: parsed.code });
      index = parsed.nextIndex;
      continue;
    }

    if (isTableStart(lines, index)) {
      const parsed = parseTable(lines, index);
      blocks.push({ kind: "table", rows: parsed.rows });
      index = parsed.nextIndex;
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/u);

    if (heading !== null) {
      blocks.push({
        kind: "heading",
        level: heading[1].length + 1,
        text: stripInlineMarkdown(heading[2])
      });
      index += 1;
      continue;
    }

    if (isListItem(line)) {
      const items: string[] = [];

      while (index < lines.length && isListItem(lines[index])) {
        items.push(stripInlineMarkdown(lines[index].replace(/^\s*(?:[-*]|\d+[.)])\s+/u, "")));
        index += 1;
      }

      blocks.push({ items, kind: "list" });
      continue;
    }

    const paragraph: string[] = [];

    while (
      index < lines.length &&
      lines[index].trim().length > 0 &&
      !lines[index].startsWith("```") &&
      !isTableStart(lines, index) &&
      !isListItem(lines[index]) &&
      lines[index].trim() !== "---" &&
      lines[index].trim() !== "\\pagebreak"
    ) {
      paragraph.push(stripInlineMarkdown(lines[index]));
      index += 1;
    }

    blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
  }

  if (codeBlocks.length > 0 && !/^```/mu.test(markdown)) {
    blocks.push(
      ...codeBlocks.map(
        (codeBlock): PdfBlock => ({
          kind: "code",
          language: codeBlock.language,
          text: codeBlock.code
        })
      )
    );
  }

  return blocks;
}

class PdfLayout {
  private readonly contentWidth: number;
  private readonly fonts = new PdfFontRegistry();
  private readonly lineHeight: number;
  private readonly margin: number;
  private readonly pages: PdfPage[] = [];
  private readonly settings: PdfSettings;
  private readonly size: PdfPageSize;
  private readonly theme: PdfTheme;
  private y = 0;

  constructor(size: PdfPageSize, settings: PdfSettings) {
    this.margin = settings.marginPt;
    this.contentWidth = Math.max(120, size.width - this.margin * 2);
    this.lineHeight = settings.fontSizePt * 1.35;
    this.settings = settings;
    this.size = size;
    this.theme = THEMES[settings.template];
    this.addPage();
  }

  title(text: string): void {
    this.drawWrappedText(text, {
      color: this.theme.heading,
      font: "bold",
      size: this.settings.fontSizePt * 1.8
    });
    this.space(8);
  }

  heading(text: string, level: number): void {
    const size = level <= 2 ? this.settings.fontSizePt * 1.35 : this.settings.fontSizePt * 1.15;

    this.space(4);
    this.drawWrappedText(text, {
      color: this.theme.heading,
      font: "bold",
      size
    });
    this.space(3);
  }

  metadata(rows: readonly (readonly [string, string])[]): void {
    rows.forEach(([label, value]) => {
      this.drawWrappedText(`${label}: ${value}`, {
        color: this.theme.muted,
        font: "regular",
        size: this.settings.fontSizePt * 0.92
      });
    });
    this.space(8);
  }

  paragraph(text: string): void {
    text
      .split(/\n{2,}/u)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length > 0)
      .forEach((paragraph) => {
        this.drawWrappedText(paragraph, {
          color: this.theme.text,
          font: "regular",
          size: this.settings.fontSizePt
        });
        this.space(4);
      });
  }

  note(text: string): void {
    this.drawWrappedText(text, {
      color: this.theme.muted,
      font: "regular",
      size: this.settings.fontSizePt * 0.9
    });
    this.space(4);
  }

  list(items: readonly string[], ordered: boolean): void {
    items.forEach((item, index) => {
      this.drawWrappedText(`${ordered ? `${index + 1}.` : "-"} ${item}`, {
        color: this.theme.text,
        font: "regular",
        indent: 12,
        size: this.settings.fontSizePt
      });
    });
    this.space(4);
  }

  code(code: string, language: string | undefined): void {
    const label =
      language !== undefined && language.trim().length > 0 ? `Code (${language})` : "Code";
    const lines = code.replace(/\r\n?/g, "\n").replace(/\n+$/u, "").split("\n");
    const size = Math.max(8, this.settings.fontSizePt * 0.88);
    const lineHeight = size * 1.35;
    const wrappedLines = lines.flatMap((line) =>
      wrapText(line.length > 0 ? line : " ", this.contentWidth - 16, size, "mono")
    );
    const codeAreaHeight = lineHeight * wrappedLines.length;
    const blockHeight = lineHeight + codeAreaHeight + size + 18;

    this.ensureSpace(blockHeight);
    this.drawWrappedText(label, {
      color: this.theme.muted,
      font: "bold",
      size: this.settings.fontSizePt * 0.9
    });

    if (this.theme.codeBackground !== undefined) {
      const codeBottom = this.y - codeAreaHeight - 3;
      const codeTop = this.y + size + 5;

      this.fillRect(
        this.margin,
        codeBottom,
        this.contentWidth,
        codeTop - codeBottom,
        this.theme.codeBackground
      );
    }

    wrappedLines.forEach((line) => {
      this.line(line, this.margin + 8, "mono", size, this.theme.text);
    });
    this.space(size + 6);
  }

  table(rows: readonly (readonly string[])[]): void {
    if (rows.length === 0) {
      return;
    }

    const columnCount = Math.max(...rows.map((row) => row.length), 1);
    const columnWidth = this.contentWidth / columnCount;
    const size = Math.max(8, this.settings.fontSizePt * 0.9);
    const lineHeight = size * 1.35;

    rows.forEach((row) => {
      const cellLines = Array.from({ length: columnCount }, (_value, columnIndex) =>
        wrapText(stripInlineMarkdown(row[columnIndex] ?? ""), columnWidth - 8, size, "regular")
      );
      const rowHeight = Math.max(...cellLines.map((lines) => lines.length), 1) * lineHeight + 8;

      this.ensureSpace(rowHeight + 2);
      const rowTop = this.y;

      cellLines.forEach((lines, columnIndex) => {
        const x = this.margin + columnIndex * columnWidth;
        this.strokeRect(x, rowTop - rowHeight, columnWidth, rowHeight, this.theme.border);
        lines.forEach((line, lineIndex) => {
          this.drawText(
            line,
            x + 4,
            rowTop - lineHeight * (lineIndex + 1),
            "regular",
            size,
            this.theme.text
          );
        });
      });

      this.y -= rowHeight;
    });

    this.space(6);
  }

  keepWithNext(): void {
    this.ensureSpace(this.lineHeight * 5);
  }

  pageBreak(): void {
    this.addPage();
  }

  space(amount: number): void {
    this.ensureSpace(amount);
    this.y -= amount;
  }

  toDocument(): PdfDocument {
    return {
      fonts: this.fonts,
      pages: this.pages,
      size: this.size
    };
  }

  private addPage(): void {
    const commands: string[] = [];
    this.pages.push({ commands });
    this.y = this.size.height - this.margin;

    if (this.settings.template === "dark") {
      commands.push(
        `q ${colorOperator(this.theme.background, "fill")} 0 0 ${formatNumber(this.size.width)} ${formatNumber(this.size.height)} re f Q`
      );
    }
  }

  private ensureSpace(height: number): void {
    if (this.y - height < this.margin) {
      this.addPage();
    }
  }

  private drawWrappedText(
    text: string,
    options: {
      readonly color: PdfColor;
      readonly font: PdfFont;
      readonly indent?: number;
      readonly size: number;
    }
  ): void {
    const indent = options.indent ?? 0;
    const lines = wrapText(text, this.contentWidth - indent, options.size, options.font);

    lines.forEach((line) => {
      this.line(line, this.margin + indent, options.font, options.size, options.color);
    });
  }

  private line(text: string, x: number, font: PdfFont, size: number, color: PdfColor): void {
    this.ensureSpace(size * 1.35);
    this.drawText(text, x, this.y, font, size, color);
    this.y -= size * 1.35;
  }

  private drawText(
    text: string,
    x: number,
    y: number,
    font: PdfFont,
    size: number,
    color: PdfColor
  ): void {
    const encodedText = this.fonts.encodeText(font, text);

    this.currentPage.commands.push(
      `BT ${colorOperator(color, "fill")} /${fontResource(font)} ${formatNumber(size)} Tf ${formatNumber(x)} ${formatNumber(y)} Td <${encodedText}> Tj ET`
    );
  }

  private fillRect(x: number, y: number, width: number, height: number, color: PdfColor): void {
    this.currentPage.commands.push(
      `q ${colorOperator(color, "fill")} ${formatNumber(x)} ${formatNumber(y)} ${formatNumber(width)} ${formatNumber(height)} re f Q`
    );
  }

  private strokeRect(x: number, y: number, width: number, height: number, color: PdfColor): void {
    this.currentPage.commands.push(
      `q ${colorOperator(color, "stroke")} ${formatNumber(x)} ${formatNumber(y)} ${formatNumber(width)} ${formatNumber(height)} re S Q`
    );
  }

  private get currentPage(): PdfPage {
    return this.pages[this.pages.length - 1];
  }
}

type PdfObject = string | Uint8Array;

interface EmbeddedFontObjectIds {
  readonly cidFont: number;
  readonly descriptor: number;
  readonly fontFile: number;
  readonly toUnicode: number;
  readonly type0: number;
}

const REGULAR_FONT_OBJECTS: EmbeddedFontObjectIds = {
  cidFont: 4,
  descriptor: 5,
  fontFile: 6,
  toUnicode: 7,
  type0: 3
};
const BOLD_FONT_OBJECTS: EmbeddedFontObjectIds = {
  cidFont: 9,
  descriptor: 10,
  fontFile: 11,
  toUnicode: 12,
  type0: 8
};
const MONO_FONT_OBJECTS: EmbeddedFontObjectIds = {
  cidFont: 14,
  descriptor: 15,
  fontFile: 16,
  toUnicode: 17,
  type0: 13
};

function writePdf(document: PdfDocument): Uint8Array {
  const objects: PdfObject[] = [];
  const pageRefs: string[] = [];
  const usesMonoFont = document.fonts.hasUsedGlyphs("mono");

  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = "";
  addEmbeddedFontObjects(objects, document.fonts.snapshot("regular"), REGULAR_FONT_OBJECTS);
  addEmbeddedFontObjects(objects, document.fonts.snapshot("bold"), BOLD_FONT_OBJECTS);
  if (usesMonoFont) {
    addEmbeddedFontObjects(objects, document.fonts.snapshot("mono"), MONO_FONT_OBJECTS);
  }

  let nextObjectId = usesMonoFont ? 18 : 13;
  const monoFontObjectId = usesMonoFont ? MONO_FONT_OBJECTS.type0 : REGULAR_FONT_OBJECTS.type0;

  for (const page of document.pages) {
    const content = new TextEncoder().encode(`${page.commands.join("\n")}\n`);
    const contentId = nextObjectId;
    const pageId = nextObjectId + 1;

    objects[contentId - 1] = createStreamObject(content);
    objects[pageId - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${formatNumber(document.size.width)} ${formatNumber(document.size.height)}] ` +
      `/Resources << /Font << /F1 ${REGULAR_FONT_OBJECTS.type0} 0 R /F2 ${BOLD_FONT_OBJECTS.type0} 0 R /F3 ${monoFontObjectId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    pageRefs.push(`${pageId} 0 R`);
    nextObjectId += 2;
  }

  objects[1] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageRefs.length} >>`;

  return serializePdfObjects(objects);
}

function addEmbeddedFontObjects(
  objects: PdfObject[],
  font: PdfEmbeddedFont,
  ids: EmbeddedFontObjectIds
): void {
  const widths = font.glyphs.map((glyph) => `${glyph.glyphId} [${glyph.width}]`).join(" ");

  objects[ids.type0 - 1] =
    `<< /Type /Font /Subtype /Type0 /BaseFont /${font.baseFontName} /Encoding /Identity-H ` +
    `/DescendantFonts [${ids.cidFont} 0 R] /ToUnicode ${ids.toUnicode} 0 R >>`;
  objects[ids.cidFont - 1] =
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${font.baseFontName} ` +
    `/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> ` +
    `/FontDescriptor ${ids.descriptor} 0 R /DW ${font.defaultWidth} ` +
    `${widths.length > 0 ? `/W [${widths}] ` : ""}/CIDToGIDMap /Identity >>`;
  objects[ids.descriptor - 1] =
    `<< /Type /FontDescriptor /FontName /${font.baseFontName} /Flags 32 ` +
    `/FontBBox [${font.bbox.join(" ")}] /ItalicAngle 0 /Ascent ${font.ascent} ` +
    `/Descent ${font.descent} /CapHeight ${font.capHeight} /StemV 80 ` +
    `/MissingWidth ${font.defaultWidth} /FontFile2 ${ids.fontFile} 0 R >>`;
  objects[ids.fontFile - 1] = createStreamObject(font.compressedBytes, {
    filter: "FlateDecode",
    length1: font.fontBytesLength
  });
  objects[ids.toUnicode - 1] = createStreamObject(
    new TextEncoder().encode(buildToUnicodeCmap(font))
  );
}

function buildToUnicodeCmap(font: PdfEmbeddedFont): string {
  const mappingSections = chunkArray(font.glyphs, 100)
    .map(
      (glyphs) =>
        `${glyphs.length} beginbfchar\n${glyphs
          .map(
            (glyph) =>
              `<${glyph.glyphId.toString(16).padStart(4, "0")}> <${unicodeCodePointHex(glyph.unicodeCodePoint)}>`
          )
          .join("\n")}\nendbfchar`
    )
    .join("\n");

  return `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /${font.baseFontName}-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
${mappingSections}
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;
}

function unicodeCodePointHex(codePoint: number): string {
  if (codePoint <= 0xffff) {
    return codePoint.toString(16).padStart(4, "0");
  }

  const adjusted = codePoint - 0x10000;
  const high = 0xd800 + (adjusted >> 10);
  const low = 0xdc00 + (adjusted & 0x3ff);

  return `${high.toString(16).padStart(4, "0")}${low.toString(16).padStart(4, "0")}`;
}

function createStreamObject(
  bytes: Uint8Array,
  options: { readonly filter?: "FlateDecode"; readonly length1?: number } = {}
): Uint8Array {
  const attributes = [
    `/Length ${bytes.length}`,
    ...(options.length1 !== undefined ? [`/Length1 ${options.length1}`] : []),
    ...(options.filter !== undefined ? [`/Filter /${options.filter}`] : [])
  ].join(" ");

  return concatenateBytes(
    new TextEncoder().encode(`<< ${attributes} >>\nstream\n`),
    bytes,
    new TextEncoder().encode("\nendstream")
  );
}

function serializePdfObjects(objects: readonly PdfObject[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [
    concatenateBytes(
      encoder.encode("%PDF-1.4\n%"),
      new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3]),
      encoder.encode("\n")
    )
  ];
  const offsets = [0];
  let outputLength = chunks[0].length;

  objects.forEach((object, index) => {
    offsets.push(outputLength);
    const objectBytes = typeof object === "string" ? encoder.encode(object) : object;
    const chunk = concatenateBytes(
      encoder.encode(`${index + 1} 0 obj\n`),
      objectBytes,
      encoder.encode("\nendobj\n")
    );

    chunks.push(chunk);
    outputLength += chunk.length;
  });

  const xrefOffset = outputLength;
  let trailer = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

  for (let index = 1; index < offsets.length; index += 1) {
    trailer += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }

  trailer += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(encoder.encode(trailer));

  return concatenateBytes(...chunks);
}

function concatenateBytes(...chunks: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

function chunkArray<T>(values: readonly T[], size: number): readonly (readonly T[])[] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function resolvePageSize(settings: PdfSettings): PdfPageSize {
  const size = PAGE_SIZES[settings.pageSize];

  return settings.orientation === "landscape" ? { height: size.width, width: size.height } : size;
}

function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  font: PdfFont
): readonly string[] {
  const sanitized = normalizePdfText(text);
  const averageWidth = font === "mono" ? fontSize * 0.6 : fontSize * 0.52;
  const maxCharacters = Math.max(8, Math.floor(maxWidth / averageWidth));
  const lines: string[] = [];

  for (const sourceLine of sanitized.split("\n")) {
    if (font === "mono") {
      lines.push(...chunkText(sourceLine, maxCharacters));
      continue;
    }

    let current = "";

    for (const word of sourceLine.split(/\s+/u)) {
      if (word.length === 0) {
        continue;
      }

      if (word.length > maxCharacters) {
        if (current.length > 0) {
          lines.push(current);
          current = "";
        }

        lines.push(...chunkText(word, maxCharacters));
        continue;
      }

      const next = current.length === 0 ? word : `${current} ${word}`;

      if (next.length > maxCharacters) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }

    if (current.length > 0) {
      lines.push(current);
    }
  }

  return lines.length > 0 ? lines : [""];
}

function chunkText(text: string, size: number): readonly string[] {
  if (text.length <= size) {
    return [text];
  }

  const chunks: string[] = [];

  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }

  return chunks;
}

function parseFencedCode(
  lines: readonly string[],
  startIndex: number
): { readonly code: string; readonly language?: string; readonly nextIndex: number } {
  const language = lines[startIndex].replace(/^```/u, "").trim() || undefined;
  const codeLines: string[] = [];
  let index = startIndex + 1;

  while (index < lines.length && !lines[index].startsWith("```")) {
    codeLines.push(lines[index]);
    index += 1;
  }

  return {
    code: codeLines.join("\n"),
    language,
    nextIndex: index < lines.length ? index + 1 : index
  };
}

function isTableStart(lines: readonly string[], index: number): boolean {
  return lines[index]?.trim().startsWith("|") === true && isTableDivider(lines[index + 1]);
}

function isTableDivider(line: string | undefined): boolean {
  if (line === undefined || !line.trim().startsWith("|")) {
    return false;
  }

  return parseTableRow(line).every((cell) => /^:?-{3,}:?$/u.test(cell.replace(/\s+/gu, "")));
}

function parseTable(
  lines: readonly string[],
  startIndex: number
): { readonly nextIndex: number; readonly rows: readonly string[][] } {
  const rows = [parseTableRow(lines[startIndex])];
  let index = startIndex + 2;

  while (index < lines.length && lines[index].trim().startsWith("|")) {
    rows.push(parseTableRow(lines[index]));
    index += 1;
  }

  return { nextIndex: index, rows };
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isListItem(line: string): boolean {
  return /^\s*(?:[-*]|\d+[.)])\s+/u.test(line);
}

function renderImageReference(image: ExportedImageRef): string {
  const source = image.src ?? image.localFilename;
  const dimensions =
    image.width !== undefined && image.height !== undefined
      ? ` (${image.width}x${image.height})`
      : "";

  if (source !== undefined) {
    return `Image: ${image.alt?.trim() || "Image"} - ${source}${dimensions}`;
  }

  return renderImageReferenceText(image);
}

function stripInlineMarkdown(input: string): string {
  return input
    .replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/gu, "$1 ($2)")
    .replace(/`([^`\n]+)`/gu, "$1")
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .replace(/__([^_]+)__/gu, "$1")
    .replace(/\*([^*]+)\*/gu, "$1")
    .replace(/_([^_]+)_/gu, "$1");
}

function normalizeSingleLine(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function ensureHtmlExtension(filename: string): string {
  return filename.endsWith(".html") ? filename : `${filename}.html`;
}

function fontResource(font: PdfFont): string {
  if (font === "bold") {
    return "F2";
  }

  if (font === "mono") {
    return "F3";
  }

  return "F1";
}

function colorOperator(color: PdfColor, operation: "fill" | "stroke"): string {
  return `${formatNumber(color.r)} ${formatNumber(color.g)} ${formatNumber(color.b)} ${operation === "fill" ? "rg" : "RG"}`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(3).replace(/0+$/u, "").replace(/\.$/u, "");
}
