import type {
  ConversationExport,
  ExportedAttachmentRef,
  ExportedCodeBlock,
  ExportedImageRef,
  ExportedMessage
} from "../core/schema";
import {
  renderImageReferenceText,
  sanitizeConversationImagesForVisualOutput
} from "../core/image-safety";
import { renderFilenameTemplate } from "../utils/filename-template";
import { formatCanvasPlain, formatSourcePlain, formatThinkingPlain } from "./advanced-content";
import { renderHtml } from "./html";
import { normalizePdfText, PdfFontRegistry, type PdfEmbeddedFont, type PdfFont } from "./pdf-font";
import { DEFAULT_PDF_SETTINGS, normalizePdfSettings, type PdfSettings } from "./pdf-settings";
import {
  type AttachmentVisualKind,
  formatAttachmentBadge,
  formatAttachmentLabel,
  formatDisplayDateTime,
  formatFileSize,
  getAttachmentVisualKind,
  getMessageDisplayTimestamp,
  shouldShowCaptureStatus
} from "./presentation";
import type { RenderedFile, RendererOptions } from "./types";

interface PdfTheme {
  readonly background: PdfColor;
  readonly border: PdfColor;
  readonly cardBackground: PdfColor;
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
  readonly annotations: PdfLinkAnnotation[];
  readonly commands: string[];
}

interface PdfLinkAnnotation {
  readonly height: number;
  readonly url: string;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

interface PdfEmbeddedImage {
  readonly bytes: Uint8Array;
  readonly height: number;
  readonly name: string;
  readonly width: number;
}

interface PdfDocument {
  readonly fonts: PdfFontRegistry;
  readonly images: readonly PdfEmbeddedImage[];
  readonly language: string;
  readonly pages: readonly PdfPage[];
  readonly size: PdfPageSize;
  readonly title: string;
}

interface PdfBlock {
  readonly kind:
    | "paragraph"
    | "heading"
    | "list"
    | "code"
    | "table"
    | "blockquote"
    | "display-math"
    | "thematic-break"
    | "page-break";
  readonly language?: string;
  readonly level?: number;
  readonly list?: PdfListBlock;
  readonly rows?: readonly (readonly string[])[];
  readonly text?: string;
}

interface PdfListBlock {
  readonly items: readonly PdfListItem[];
  readonly ordered: boolean;
  readonly start?: number;
}

interface PdfListItem {
  readonly parts: readonly PdfListItemPart[];
}

interface PdfInlineRun {
  readonly font: PdfFont;
  readonly text: string;
  readonly url?: string;
}

type PdfListItemPart =
  | {
      readonly kind: "text";
      readonly text: string;
    }
  | {
      readonly kind: "list";
      readonly list: PdfListBlock;
    };

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
    cardBackground: { b: 0.2, g: 0.133, r: 0.09 },
    codeBackground: { b: 0.22, g: 0.157, r: 0.118 },
    heading: { b: 1, g: 1, r: 1 },
    muted: { b: 0.839, g: 0.78, r: 0.702 },
    text: { b: 0.949, g: 0.949, r: 0.933 }
  },
  light: {
    background: { b: 1, g: 1, r: 1 },
    border: { b: 0.894, g: 0.871, r: 0.847 },
    cardBackground: { b: 0.988, g: 0.976, r: 0.957 },
    codeBackground: { b: 0.969, g: 0.965, r: 0.949 },
    heading: { b: 0.196, g: 0.122, r: 0.075 },
    muted: { b: 0.431, g: 0.384, r: 0.341 },
    text: { b: 0.196, g: 0.122, r: 0.075 }
  },
  simple: {
    background: { b: 1, g: 1, r: 1 },
    border: { b: 0.78, g: 0.78, r: 0.78 },
    cardBackground: { b: 0.98, g: 0.98, r: 0.98 },
    heading: { b: 0, g: 0, r: 0 },
    muted: { b: 0.25, g: 0.25, r: 0.25 },
    text: { b: 0, g: 0, r: 0 }
  }
};

const PDF_WHITE: PdfColor = { b: 1, g: 1, r: 1 };

function attachmentAccentColor(kind: AttachmentVisualKind): PdfColor {
  switch (kind) {
    case "archive":
      return { b: 0.95, g: 0.32, r: 0.55 };
    case "code":
      return { b: 0.93, g: 0.65, r: 0.06 };
    case "document":
      return { b: 0.96, g: 0.51, r: 0.23 };
    case "image":
      return { b: 0.7, g: 0.28, r: 0.93 };
    case "website":
      return { b: 0.6, g: 0.72, r: 0.06 };
    case "other":
      return { b: 0.66, g: 0.58, r: 0.5 };
  }
}

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
  const safeConversation = sanitizeConversationImagesForVisualOutput(conversation);

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
  const documentTitle = conversation.title ?? "Untitled conversation";

  layout.title(documentTitle);

  if (options.includeMetadata !== false) {
    layout.metadata([
      ["Platform", conversation.platformLabel],
      ...(conversation.sourceUrl.trim().length > 0
        ? [["Source", conversation.sourceUrl] as const]
        : []),
      ["Exported", formatDisplayDateTime(conversation.exportedAt)],
      ["Messages", String(conversation.messageCount)],
      ...(shouldShowCaptureStatus(conversation)
        ? [["Capture status", conversation.completeness.status.replace(/_/gu, " ")] as const]
        : [])
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

  return writePdf(
    layout.toDocument(
      documentTitle,
      inferPdfLanguage(conversation.messages.map((message) => message.text).join("\n"))
    )
  );
}

function renderPdfReadyHtmlFallback(
  conversation: ConversationExport,
  options: RendererOptions,
  error: unknown
): RenderedFile<string> {
  const fallback = renderHtml(conversation, options);
  const reason = error instanceof Error ? error.message : "Unknown PDF generation failure.";
  const warning = `<section class="capture-status" aria-label="PDF fallback"><strong>PDF generation failed locally.</strong> Falling back to PDF-ready HTML. No conversation content was uploaded or sent to a server. Reason: ${escapeHtml(reason)}</section>`;

  return {
    bytes: fallback.bytes.replace("</header>", `${warning}\n    </header>`),
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
  const displayTimestamp = getMessageDisplayTimestamp(message);
  const messageDetails = [
    ...(message.reasoningSummary !== undefined ? [message.reasoningSummary.label] : []),
    ...(message.model !== undefined ? [`Model: ${message.model}`] : []),
    ...(displayTimestamp !== undefined ? [displayTimestamp] : [])
  ];

  if (messageDetails.length > 0) {
    layout.note(messageDetails.join(" - "));
  }

  if ((message.attachments?.length ?? 0) > 0) {
    layout.attachmentCards(message.attachments!);
  }

  for (const block of parseMessageBlocks(message)) {
    renderBlock(layout, block);
  }

  if (message.images.length > 0) {
    layout.keepWithNext();
    layout.heading("Images", 3);
    message.images.forEach((image) => {
      if (!layout.image(image)) {
        layout.list([renderImageReference(image)], false);
      }
    });
  }

  const sources = (message.sources ?? []).filter(
    (source) => !markdownContainsSourceUrl(message.markdown ?? "", source.url)
  );
  if (sources.length > 0) {
    layout.keepWithNext();
    layout.heading("Sources", 3);
    layout.list(sources.map(formatSourcePlain), false);
  }

  const sourceCaptureWarning = message.metadata.sourceCaptureWarning;
  if (typeof sourceCaptureWarning === "string" && sourceCaptureWarning.trim().length > 0) {
    layout.note(sourceCaptureWarning);
  }

  if ((message.canvas?.length ?? 0) > 0) {
    layout.keepWithNext();
    layout.heading("Canvas", 3);
    layout.list(message.canvas!.map(formatCanvasPlain), false);
  }

  if ((message.thinkingBlocks?.length ?? 0) > 0) {
    layout.keepWithNext();
    layout.heading("Visible thinking / reasoning", 3);
    layout.list(message.thinkingBlocks!.map(formatThinkingPlain), false);
  }

  if ((message.toolInvocations?.length ?? 0) > 0) {
    layout.keepWithNext();
    layout.heading("Invoked apps and tools", 3);
    layout.list(
      message.toolInvocations!.map((tool) =>
        [tool.name, tool.status, tool.inputSummary, tool.outputSummary]
          .filter((value): value is string => value !== undefined && value.trim().length > 0)
          .join(" — ")
      ),
      false
    );
  }

  layout.space(6);
}

function renderBlock(layout: PdfLayout, block: PdfBlock): void {
  switch (block.kind) {
    case "code":
      layout.code(block.text ?? "", block.language);
      return;
    case "blockquote":
      layout.blockquote(block.text ?? "");
      return;
    case "display-math":
      layout.displayMath(block.text ?? "");
      return;
    case "heading":
      layout.heading(block.text ?? "", block.level ?? 3);
      return;
    case "list": {
      if (block.list !== undefined) {
        layout.nestedList(block.list);
      }
      return;
    }
    case "thematic-break":
      layout.thematicBreak();
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

    if (line.trim() === "---") {
      blocks.push({ kind: "thematic-break" });
      index += 1;
      continue;
    }

    if (line.trim() === "\\pagebreak") {
      blocks.push({ kind: "page-break" });
      index += 1;
      continue;
    }

    if (line.trim().startsWith("$$")) {
      const parsed = parsePdfDisplayMath(lines, index);
      blocks.push({ kind: "display-math", text: parsed.tex });
      index = parsed.nextIndex;
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
      const firstMarker = parsePdfListMarker(line);
      const ordered = firstMarker?.ordered ?? false;
      const parsed = parsePdfList(lines, index, ordered);

      blocks.push({ kind: "list", list: parsed.list });
      index = parsed.nextIndex;
      continue;
    }

    if (/^\s*>\s?/u.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*>\s?/u.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/u, ""));
        index += 1;
      }
      blocks.push({ kind: "blockquote", text: quoteLines.join("\n") });
      continue;
    }

    const paragraph: string[] = [];

    while (
      index < lines.length &&
      lines[index].trim().length > 0 &&
      !lines[index].startsWith("```") &&
      !isTableStart(lines, index) &&
      !isListItem(lines[index]) &&
      !/^\s*>\s?/u.test(lines[index]) &&
      !lines[index].trim().startsWith("$$") &&
      lines[index].trim() !== "---" &&
      lines[index].trim() !== "\\pagebreak"
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }

    blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
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

function parsePdfList(
  lines: readonly string[],
  startIndex: number,
  ordered: boolean,
  baseIndent = parsePdfListMarker(lines[startIndex])?.indent ?? 0
): { readonly list: PdfListBlock; readonly nextIndex: number } {
  const items: PdfListItem[] = [];
  let index = startIndex;
  let start = 1;

  while (index < lines.length) {
    const marker = parsePdfListMarker(lines[index]);

    if (marker === undefined || marker.ordered !== ordered || marker.indent !== baseIndent) {
      break;
    }

    if (items.length === 0 && marker.start !== undefined) {
      start = marker.start;
    }

    let paragraphLines = [marker.body];
    const parts: PdfListItemPart[] = [];
    index += 1;

    while (index < lines.length && lines[index].trim().length > 0) {
      const nestedMarker = parsePdfListMarker(lines[index]);

      if (nestedMarker !== undefined) {
        if (nestedMarker.indent <= baseIndent) {
          break;
        }

        flushPdfListItemText(parts, paragraphLines);
        paragraphLines = [];
        const nested = parsePdfList(lines, index, nestedMarker.ordered, nestedMarker.indent);
        parts.push({ kind: "list", list: nested.list });
        index = nested.nextIndex;
        continue;
      }

      if (countPdfIndent(lines[index]) <= baseIndent) {
        break;
      }

      paragraphLines.push(lines[index].trim());
      index += 1;
    }

    flushPdfListItemText(parts, paragraphLines);
    items.push({ parts });
  }

  return {
    list: {
      items,
      ordered,
      ...(ordered && start !== 1 ? { start } : {})
    },
    nextIndex: index
  };
}

function flushPdfListItemText(parts: PdfListItemPart[], lines: readonly string[]): void {
  if (lines.length > 0) {
    parts.push({ kind: "text", text: lines.join("\n") });
  }
}

class PdfLayout {
  private readonly contentWidth: number;
  private readonly fonts = new PdfFontRegistry();
  private readonly images: PdfEmbeddedImage[] = [];
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
      this.drawRichWrappedText(`**${label}:** ${value}`, {
        color: this.theme.muted,
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
        this.drawRichWrappedText(paragraph, {
          color: this.theme.text,
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

  blockquote(markdown: string): void {
    const size = this.settings.fontSizePt;
    this.ensureSpace(size * 1.35);
    const startPageIndex = this.pages.length - 1;
    const startY = this.y;
    this.drawRichWrappedText(markdown, {
      color: this.theme.muted,
      indent: 16,
      size
    });
    const endPageIndex = this.pages.length - 1;
    const bottomY = this.y + size * 0.35;
    const topY = startY + size * 0.8;
    const lineX = this.margin + 4;

    if (startPageIndex === endPageIndex) {
      this.strokeLineOnPage(startPageIndex, lineX, bottomY, lineX, topY, this.theme.heading);
    } else {
      const pageTopY = this.size.height - this.margin + size * 0.8;

      for (let pageIndex = startPageIndex; pageIndex <= endPageIndex; pageIndex += 1) {
        const segmentBottomY = pageIndex === endPageIndex ? bottomY : this.margin;
        const segmentTopY = pageIndex === startPageIndex ? topY : pageTopY;
        this.strokeLineOnPage(
          pageIndex,
          lineX,
          segmentBottomY,
          lineX,
          segmentTopY,
          this.theme.heading
        );
      }
    }
    this.space(5);
  }

  displayMath(tex: string): void {
    const normalized = normalizeTexForPdf(tex);
    const size = this.settings.fontSizePt * 1.08;
    const lines = this.wrapExact(normalized, this.contentWidth - 28, size, "regular");
    this.space(5);
    lines.forEach((line) => {
      this.ensureSpace(size * 1.5);
      const width = this.measureText(line, "regular", size);
      this.drawText(
        line,
        this.margin + Math.max(0, (this.contentWidth - width) / 2),
        this.y,
        "regular",
        size,
        this.theme.text
      );
      this.y -= size * 1.5;
    });
    this.space(5);
  }

  image(image: ExportedImageRef): boolean {
    const decoded = decodeJpegDataUri(image.dataUri);
    if (decoded === undefined) {
      return false;
    }

    const sourceWidth = image.width ?? decoded.width;
    const sourceHeight = image.height ?? decoded.height;
    const maxHeight = Math.min(340, this.size.height - this.margin * 2);
    const scale = Math.min(1, this.contentWidth / sourceWidth, maxHeight / sourceHeight);
    const width = Math.max(1, sourceWidth * scale);
    const height = Math.max(1, sourceHeight * scale);
    this.ensureSpace(height + 12);
    const name = `Im${this.images.length + 1}`;
    this.images.push({ bytes: decoded.bytes, height: decoded.height, name, width: decoded.width });
    const x = this.margin + Math.max(0, (this.contentWidth - width) / 2);
    const y = this.y - height;
    this.currentPage.commands.push(
      `q ${formatNumber(width)} 0 0 ${formatNumber(height)} ${formatNumber(x)} ${formatNumber(
        y
      )} cm /${name} Do Q`
    );
    this.y = y - 10;
    if (image.alt?.trim()) {
      this.note(image.alt.trim());
    }
    return true;
  }

  list(items: readonly string[], ordered: boolean, start = 1): void {
    items.forEach((item, index) => {
      this.drawListItem(ordered ? `${start + index}.` : "•", item, 12, {
        color: this.theme.text,
        size: this.settings.fontSizePt
      });
    });
    this.space(4);
  }

  attachmentCards(attachments: readonly ExportedAttachmentRef[]): void {
    const titleSize = Math.max(9, this.settings.fontSizePt * 0.98);
    const detailSize = Math.max(7.5, this.settings.fontSizePt * 0.82);
    const titleLineHeight = titleSize * 1.28;
    const detailLineHeight = detailSize * 1.3;
    const cardGap = 8;
    const cardPadding = 7;
    const cardWidth = Math.min(this.contentWidth, 420);
    const badgeWidth = 38;
    const copyX = this.margin + cardPadding + badgeWidth + 10;
    const copyWidth = cardWidth - cardPadding * 2 - badgeWidth - 10;

    attachments.forEach((attachment) => {
      const badge = formatAttachmentBadge(attachment);
      const accentColor = attachmentAccentColor(getAttachmentVisualKind(attachment));
      const typeLabel = formatAttachmentLabel(attachment);
      const details = [typeLabel, formatFileSize(attachment.sizeBytes)]
        .filter((value): value is string => value !== undefined && value.trim().length > 0)
        .join(" · ");
      const supportingText = [attachment.url, attachment.warning]
        .filter((value): value is string => value !== undefined && value.trim().length > 0)
        .join(" · ");
      const titleLines = this.wrapExact(attachment.name, copyWidth, titleSize, "bold");
      const detailLines =
        details.length === 0 ? [] : this.wrapExact(details, copyWidth, detailSize, "regular");
      const supportingLines =
        supportingText.length === 0
          ? []
          : this.wrapExact(supportingText, copyWidth, detailSize, "regular");
      const copyHeight =
        titleLines.length * titleLineHeight +
        detailLines.length * detailLineHeight +
        supportingLines.length * detailLineHeight +
        (detailLines.length > 0 ? 2 : 0) +
        (supportingLines.length > 0 ? 2 : 0);
      const cardHeight = Math.max(48, copyHeight + cardPadding * 2);

      this.ensureSpace(cardHeight + cardGap);

      const cardTop = this.y;
      const cardBottom = cardTop - cardHeight;
      const badgeHeight = 36;
      const badgeBottom = cardTop - (cardHeight + badgeHeight) / 2;

      this.fillAndStrokeRoundedRect(
        this.margin,
        cardBottom,
        cardWidth,
        cardHeight,
        9,
        this.theme.cardBackground,
        this.theme.border
      );
      this.fillRoundedRect(
        this.margin + cardPadding,
        badgeBottom,
        badgeWidth,
        badgeHeight,
        8,
        accentColor
      );

      const badgeSize = Math.max(7, Math.min(9, detailSize));
      const measuredBadgeWidth = this.measureText(badge, "bold", badgeSize);
      this.drawText(
        badge,
        this.margin + cardPadding + Math.max(4, (badgeWidth - measuredBadgeWidth) / 2),
        badgeBottom + (badgeHeight - badgeSize) / 2 + 1,
        "bold",
        badgeSize,
        PDF_WHITE
      );

      let baseline = cardTop - cardPadding - titleSize;

      titleLines.forEach((line) => {
        this.drawText(line, copyX, baseline, "bold", titleSize, this.theme.text);
        baseline -= titleLineHeight;
      });

      if (detailLines.length > 0) {
        baseline -= 2;
        detailLines.forEach((line) => {
          this.drawText(line, copyX, baseline, "regular", detailSize, this.theme.muted);
          baseline -= detailLineHeight;
        });
      }

      if (supportingLines.length > 0) {
        baseline -= 2;
        supportingLines.forEach((line) => {
          this.drawText(line, copyX, baseline, "regular", detailSize, this.theme.muted);
          baseline -= detailLineHeight;
        });
      }

      this.y = cardBottom - cardGap;
    });

    this.space(Math.max(10, this.settings.fontSizePt));
  }

  nestedList(list: PdfListBlock): void {
    this.renderNestedList(list, 0);
    this.space(4);
  }

  thematicBreak(): void {
    this.ensureSpace(16);
    this.y -= 8;
    this.strokeLine(
      this.margin,
      this.y,
      this.margin + this.contentWidth,
      this.y,
      this.theme.border
    );
    this.y -= 8;
  }

  code(code: string, language: string | undefined): void {
    void language;
    const lines = code.replace(/\r\n?/g, "\n").replace(/\n+$/u, "").split("\n");
    const size = Math.max(8, this.settings.fontSizePt * 0.88);
    const lineHeight = size * 1.35;
    const wrappedLines = lines.flatMap((line) =>
      this.wrapExact(line.length > 0 ? line : " ", this.contentWidth - 16, size, "mono")
    );
    const codeAreaHeight = lineHeight * wrappedLines.length;
    const topGap = 11;
    const blockHeight = topGap + codeAreaHeight + size + 14;

    this.ensureSpace(blockHeight);
    this.space(topGap);

    if (this.theme.codeBackground !== undefined) {
      const codeBottom = this.y - codeAreaHeight - 3;
      const codeTop = this.y + size * 0.9;

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
    const size = Math.max(8, this.settings.fontSizePt * 0.9);
    const lineHeight = size * 1.35;
    const columnWidths = allocateTableColumnWidths(rows, this.contentWidth, size, (value) =>
      this.measureText(value, "regular", size)
    );

    const renderRow = (row: readonly string[], header: boolean): void => {
      const cellLines = Array.from({ length: columnCount }, (_value, columnIndex) =>
        this.wrapExact(
          stripInlineMarkdown(row[columnIndex] ?? ""),
          columnWidths[columnIndex] - 10,
          size,
          header ? "bold" : "regular"
        )
      );
      const rowHeight = Math.max(...cellLines.map((lines) => lines.length), 1) * lineHeight + 8;

      if (this.y - rowHeight < this.margin) {
        this.addPage();
        if (!header) {
          renderRow(rows[0] ?? [], true);
        }
      }
      const rowTop = this.y;
      if (header) {
        this.fillRect(
          this.margin,
          rowTop - rowHeight,
          this.contentWidth,
          rowHeight,
          this.theme.cardBackground
        );
      }

      let currentX = this.margin;
      cellLines.forEach((lines, columnIndex) => {
        const columnWidth = columnWidths[columnIndex];
        const x = currentX;
        this.strokeRect(x, rowTop - rowHeight, columnWidth, rowHeight, this.theme.border);
        lines.forEach((line, lineIndex) => {
          this.drawText(
            line,
            x + 4,
            rowTop - lineHeight * (lineIndex + 1),
            header ? "bold" : "regular",
            size,
            this.theme.text
          );
        });
        currentX += columnWidth;
      });

      this.y -= rowHeight;
    };

    rows.forEach((row, index) => renderRow(row, index === 0));

    // `this.y` is the bottom border of the final row, while normal text starts at a
    // baseline. Reserve a full table line before the next block so its glyph ascent
    // cannot cross the border (especially for bold paragraphs).
    this.space(lineHeight);
  }

  keepWithNext(): void {
    this.ensureSpace(this.lineHeight * 5);
  }

  pageBreak(): void {
    this.addPage();
  }

  space(amount: number): void {
    this.y -= amount;
  }

  toDocument(title: string, language: string): PdfDocument {
    return {
      fonts: this.fonts,
      images: this.images,
      language,
      pages: this.pages,
      size: this.size,
      title
    };
  }

  private addPage(): void {
    const commands: string[] = [];
    this.pages.push({ annotations: [], commands });
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
    const lines = this.wrapExact(text, this.contentWidth - indent, options.size, options.font);

    lines.forEach((line) => {
      this.line(line, this.margin + indent, options.font, options.size, options.color);
    });
  }

  private drawRichWrappedText(
    markdown: string,
    options: {
      readonly color: PdfColor;
      readonly indent?: number;
      readonly size: number;
    }
  ): void {
    const indent = options.indent ?? 0;
    const runs = parsePdfInlineRuns(markdown);
    const lines = wrapPdfInlineRuns(runs, this.contentWidth - indent, (run) =>
      this.measureText(run.text, run.font, options.size)
    );

    lines.forEach((lineRuns) => {
      this.ensureSpace(options.size * 1.35);
      let currentX = this.margin + indent;

      lineRuns.forEach((run) => {
        const width = this.drawText(
          run.text,
          currentX,
          this.y,
          run.font,
          options.size,
          run.url === undefined ? options.color : this.theme.heading
        );
        if (run.url !== undefined && width > 0) {
          this.currentPage.annotations.push({
            height: options.size * 1.2,
            url: run.url,
            width,
            x: currentX,
            y: this.y - options.size * 0.2
          });
        }
        currentX += width;
      });
      this.y -= options.size * 1.35;
    });
  }

  private drawListItem(
    marker: string,
    markdown: string,
    indent: number,
    options: { readonly color: PdfColor; readonly size: number }
  ): void {
    const markerGap = marker.length > 2 ? 24 : 18;
    this.ensureSpace(options.size * 1.35);
    if (marker.length > 0) {
      this.drawText(marker, this.margin + indent, this.y, "regular", options.size, options.color);
    }
    if (markdown.length === 0) {
      this.y -= options.size * 1.35;
      return;
    }
    this.drawRichWrappedText(markdown, {
      color: options.color,
      indent: indent + markerGap,
      size: options.size
    });
  }

  private measureText(text: string, font: PdfFont, size: number): number {
    return this.fonts
      .encodeTextRuns(font, text)
      .reduce((width, run) => width + (run.width * size) / 1000, 0);
  }

  private wrapExact(
    text: string,
    maxWidth: number,
    size: number,
    font: PdfFont
  ): readonly string[] {
    return wrapExactText(text, maxWidth, (value) => this.measureText(value, font, size));
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
  ): number {
    const runs = this.fonts.encodeTextRuns(font, text);
    let currentX = x;

    runs.forEach((run) => {
      this.currentPage.commands.push(
        `BT ${colorOperator(color, "fill")} /${fontResource(run.font)} ${formatNumber(size)} Tf ${formatNumber(currentX)} ${formatNumber(y)} Td <${run.encodedText}> Tj ET`
      );
      currentX += (run.width * size) / 1000;
    });

    return currentX - x;
  }

  private fillRect(x: number, y: number, width: number, height: number, color: PdfColor): void {
    this.currentPage.commands.push(
      `q ${colorOperator(color, "fill")} ${formatNumber(x)} ${formatNumber(y)} ${formatNumber(width)} ${formatNumber(height)} re f Q`
    );
  }

  private fillRoundedRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    color: PdfColor
  ): void {
    this.currentPage.commands.push(
      `q ${colorOperator(color, "fill")} ${roundedRectPath(x, y, width, height, radius)} f Q`
    );
  }

  private fillAndStrokeRoundedRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill: PdfColor,
    stroke: PdfColor
  ): void {
    this.currentPage.commands.push(
      `q ${colorOperator(fill, "fill")} ${colorOperator(stroke, "stroke")} 0.8 w ${roundedRectPath(
        x,
        y,
        width,
        height,
        radius
      )} B Q`
    );
  }

  private strokeRect(x: number, y: number, width: number, height: number, color: PdfColor): void {
    this.currentPage.commands.push(
      `q ${colorOperator(color, "stroke")} ${formatNumber(x)} ${formatNumber(y)} ${formatNumber(width)} ${formatNumber(height)} re S Q`
    );
  }

  private strokeLine(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    color: PdfColor
  ): void {
    this.strokeLineOnPage(this.pages.length - 1, startX, startY, endX, endY, color);
  }

  private strokeLineOnPage(
    pageIndex: number,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    color: PdfColor
  ): void {
    this.pages[pageIndex].commands.push(
      `q ${colorOperator(color, "stroke")} 0.8 w ${formatNumber(startX)} ${formatNumber(startY)} m ${formatNumber(endX)} ${formatNumber(endY)} l S Q`
    );
  }

  private renderNestedList(list: PdfListBlock, depth: number): void {
    const markerIndent = 12 + depth * 16;
    const continuationIndent = markerIndent + 14;
    const start = list.start ?? 1;

    list.items.forEach((item, itemIndex) => {
      let markerRendered = false;

      item.parts.forEach((part) => {
        if (part.kind === "list") {
          if (!markerRendered) {
            this.drawListItem(list.ordered ? `${start + itemIndex}.` : "•", "", markerIndent, {
              color: this.theme.text,
              size: this.settings.fontSizePt
            });
            markerRendered = true;
          }

          this.renderNestedList(part.list, depth + 1);
          return;
        }

        const marker = list.ordered ? `${start + itemIndex}.` : "•";
        this.drawListItem(
          markerRendered ? "" : marker,
          part.text,
          markerRendered ? continuationIndent : markerIndent,
          {
            color: this.theme.text,
            size: this.settings.fontSizePt
          }
        );
        markerRendered = true;
      });
    });
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
function writePdf(document: PdfDocument): Uint8Array {
  const objects: PdfObject[] = [];
  const pageRefs: string[] = [];
  const structureRefs: string[] = [];
  const parentTreeEntries: string[] = [];
  const usesMonoFont = document.fonts.hasUsedGlyphs("mono");
  const usesEmojiFont = document.fonts.hasUsedGlyphs("emoji");
  let nextObjectId = 13;
  const monoFontObjects = usesMonoFont ? embeddedFontObjectIds(nextObjectId) : undefined;
  nextObjectId += monoFontObjects === undefined ? 0 : 5;
  const emojiFontObjects = usesEmojiFont ? embeddedFontObjectIds(nextObjectId) : undefined;
  nextObjectId += emojiFontObjects === undefined ? 0 : 5;

  objects[0] = "";
  objects[1] = "";
  addEmbeddedFontObjects(objects, document.fonts.snapshot("regular"), REGULAR_FONT_OBJECTS);
  addEmbeddedFontObjects(objects, document.fonts.snapshot("bold"), BOLD_FONT_OBJECTS);
  if (monoFontObjects !== undefined) {
    addEmbeddedFontObjects(objects, document.fonts.snapshot("mono"), monoFontObjects);
  }
  if (emojiFontObjects !== undefined) {
    addEmbeddedFontObjects(objects, document.fonts.snapshot("emoji"), emojiFontObjects);
  }

  const monoFontObjectId = monoFontObjects?.type0 ?? REGULAR_FONT_OBJECTS.type0;
  const emojiFontObjectId = emojiFontObjects?.type0 ?? REGULAR_FONT_OBJECTS.type0;
  const imageObjectIds = new Map<string, number>();

  for (const image of document.images) {
    const imageId = nextObjectId;
    nextObjectId += 1;
    imageObjectIds.set(image.name, imageId);
    objects[imageId - 1] = createStreamObject(image.bytes, {
      dictionary: [
        "/Type /XObject",
        "/Subtype /Image",
        `/Width ${image.width}`,
        `/Height ${image.height}`,
        "/ColorSpace /DeviceRGB",
        "/BitsPerComponent 8"
      ],
      filter: "DCTDecode"
    });
  }

  const xObjects = [...imageObjectIds.entries()]
    .map(([name, id]) => `/${name} ${id} 0 R`)
    .join(" ");
  const structureRootId = nextObjectId;
  const parentTreeId = nextObjectId + 1;
  const infoId = nextObjectId + 2;
  nextObjectId += 3;

  objects[infoId - 1] =
    `<< /Title (${escapePdfLiteral(document.title)}) /Creator (Jelluvi) ` +
    `/Producer (Jelluvi local PDF renderer) >>`;

  for (const [pageIndex, page] of document.pages.entries()) {
    const annotationIds = page.annotations.flatMap((annotation) => {
      const safeUrl = sanitizePdfLinkUrl(annotation.url);
      if (safeUrl === undefined) {
        return [];
      }

      const annotationId = nextObjectId;
      nextObjectId += 1;
      objects[annotationId - 1] =
        `<< /Type /Annot /Subtype /Link /Rect [${formatNumber(annotation.x)} ${formatNumber(
          annotation.y
        )} ${formatNumber(annotation.x + annotation.width)} ${formatNumber(
          annotation.y + annotation.height
        )}] /Border [0 0 0] /A << /S /URI /URI (${escapePdfLiteral(safeUrl)}) >> >>`;
      return [annotationId];
    });
    const content = new TextEncoder().encode(
      `/Sect <</MCID 0>> BDC\n${page.commands.join("\n")}\nEMC\n`
    );
    const contentId = nextObjectId;
    const pageId = nextObjectId + 1;
    const structureElementId = nextObjectId + 2;

    objects[contentId - 1] = createStreamObject(content);
    objects[pageId - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${formatNumber(document.size.width)} ${formatNumber(document.size.height)}] ` +
      `/Resources << /Font << /F1 ${REGULAR_FONT_OBJECTS.type0} 0 R /F2 ${BOLD_FONT_OBJECTS.type0} 0 R /F3 ${monoFontObjectId} 0 R /F4 ${emojiFontObjectId} 0 R >> ` +
      `${xObjects.length > 0 ? `/XObject << ${xObjects} >> ` : ""}>> ` +
      `${annotationIds.length > 0 ? `/Annots [${annotationIds.map((id) => `${id} 0 R`).join(" ")}] ` : ""}` +
      `/StructParents ${pageIndex} /Contents ${contentId} 0 R >>`;
    objects[structureElementId - 1] =
      `<< /Type /StructElem /S /Sect /P ${structureRootId} 0 R /Pg ${pageId} 0 R /K 0 >>`;
    pageRefs.push(`${pageId} 0 R`);
    structureRefs.push(`${structureElementId} 0 R`);
    parentTreeEntries.push(`${pageIndex} [${structureElementId} 0 R]`);
    nextObjectId += 3;
  }

  objects[1] = `<< /Type /Pages /Kids [${pageRefs.join(" ")}] /Count ${pageRefs.length} >>`;
  objects[structureRootId - 1] =
    `<< /Type /StructTreeRoot /K [${structureRefs.join(" ")}] ` +
    `/ParentTree ${parentTreeId} 0 R /ParentTreeNextKey ${document.pages.length} >>`;
  objects[parentTreeId - 1] = `<< /Nums [${parentTreeEntries.join(" ")}] >>`;
  objects[0] =
    `<< /Type /Catalog /Pages 2 0 R /Lang (${escapePdfLiteral(document.language)}) ` +
    `/MarkInfo << /Marked true >> /StructTreeRoot ${structureRootId} 0 R ` +
    `/ViewerPreferences << /DisplayDocTitle true >> >>`;

  return serializePdfObjects(objects, infoId);
}

function embeddedFontObjectIds(type0: number): EmbeddedFontObjectIds {
  return {
    cidFont: type0 + 1,
    descriptor: type0 + 2,
    fontFile: type0 + 3,
    toUnicode: type0 + 4,
    type0
  };
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
  options: {
    readonly dictionary?: readonly string[];
    readonly filter?: "DCTDecode" | "FlateDecode";
    readonly length1?: number;
  } = {}
): Uint8Array {
  const attributes = [
    `/Length ${bytes.length}`,
    ...(options.dictionary ?? []),
    ...(options.length1 !== undefined ? [`/Length1 ${options.length1}`] : []),
    ...(options.filter !== undefined ? [`/Filter /${options.filter}`] : [])
  ].join(" ");

  return concatenateBytes(
    new TextEncoder().encode(`<< ${attributes} >>\nstream\n`),
    bytes,
    new TextEncoder().encode("\nendstream")
  );
}

function sanitizePdfLinkUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function escapePdfLiteral(value: string): string {
  return value
    .replace(/\\/gu, "\\\\")
    .replace(/\(/gu, "\\(")
    .replace(/\)/gu, "\\)")
    .replace(/\r/gu, "")
    .replace(/\n/gu, "");
}

function serializePdfObjects(objects: readonly PdfObject[], infoId?: number): Uint8Array {
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

  trailer +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ` +
    `${infoId !== undefined ? `/Info ${infoId} 0 R ` : ""}>>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  chunks.push(encoder.encode(trailer));

  return concatenateBytes(...chunks);
}

function inferPdfLanguage(text: string): string {
  const cyrillicCharacters = text.match(/[\p{Script=Cyrillic}]/gu)?.length ?? 0;
  const latinCharacters = text.match(/[A-Za-z]/gu)?.length ?? 0;
  return cyrillicCharacters > latinCharacters ? "ru" : "en";
}

function markdownContainsSourceUrl(markdown: string, sourceUrl: string): boolean {
  const sourceKey = canonicalSourceUrl(sourceUrl);
  const urls = [
    ...markdown.matchAll(/\]\((https?:\/\/[^)\s]+)\)/gu),
    ...markdown.matchAll(/(?:^|[\s<])(https?:\/\/[^\s<>)]+)/gu)
  ].map((match) => match[1].replace(/[.,;:!?]+$/u, ""));

  return urls.some((url) => canonicalSourceUrl(url) === sourceKey);
}

function canonicalSourceUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.hostname = parsed.hostname.toLowerCase();

    for (const key of [...parsed.searchParams.keys()]) {
      if (
        key.toLowerCase().startsWith("utm_") ||
        ["fbclid", "gclid", "mc_cid", "mc_eid", "ref_src"].includes(key.toLowerCase()) ||
        (["ref", "source"].includes(key.toLowerCase()) &&
          /^(?:chatgpt(?:\.com)?|openai)$/iu.test(parsed.searchParams.get(key) ?? ""))
      ) {
        parsed.searchParams.delete(key);
      }
    }

    parsed.searchParams.sort();
    if (parsed.pathname.length > 1) {
      parsed.pathname = parsed.pathname.replace(/\/+$/u, "");
    }

    return parsed.toString();
  } catch {
    return value;
  }
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

function parsePdfDisplayMath(
  lines: readonly string[],
  startIndex: number
): { readonly nextIndex: number; readonly tex: string } {
  const first = lines[startIndex].trim();
  const inline = /^\$\$(.*)\$\$$/u.exec(first);
  if (inline !== null) {
    return { nextIndex: startIndex + 1, tex: inline[1].trim() };
  }

  const content = [first.replace(/^\$\$/u, "")];
  let index = startIndex + 1;
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim().endsWith("$$")) {
      content.push(line.replace(/\$\$\s*$/u, ""));
      index += 1;
      break;
    }
    content.push(line);
    index += 1;
  }
  return { nextIndex: index, tex: content.join(" ").trim() };
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
  return parsePdfListMarker(line) !== undefined;
}

function parsePdfListMarker(line: string):
  | {
      readonly body: string;
      readonly indent: number;
      readonly ordered: boolean;
      readonly start?: number;
    }
  | undefined {
  const unordered = /^(\s*)[-*]\s+(.+)$/u.exec(line);

  if (unordered !== null) {
    return {
      body: unordered[2],
      indent: countPdfIndentCharacters(unordered[1]),
      ordered: false
    };
  }

  const ordered = /^(\s*)(\d+)[.)]\s+(.+)$/u.exec(line);

  if (ordered === null) {
    return undefined;
  }

  return {
    body: ordered[3],
    indent: countPdfIndentCharacters(ordered[1]),
    ordered: true,
    start: Number.parseInt(ordered[2], 10)
  };
}

function countPdfIndent(line: string): number {
  return countPdfIndentCharacters(/^(\s*)/u.exec(line)?.[1] ?? "");
}

function countPdfIndentCharacters(value: string): number {
  return [...value].reduce((total, character) => total + (character === "\t" ? 4 : 1), 0);
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

function parsePdfInlineRuns(
  input: string,
  inheritedFont: PdfFont = "regular",
  inheritedUrl?: string
): readonly PdfInlineRun[] {
  const runs: PdfInlineRun[] = [];
  let cursor = 0;
  let plainStart = 0;
  const pushPlain = (end: number) => {
    if (end > plainStart) {
      runs.push({
        font: inheritedFont,
        text: normalizePdfText(input.slice(plainStart, end)),
        ...(inheritedUrl !== undefined ? { url: inheritedUrl } : {})
      });
    }
  };

  while (cursor < input.length) {
    if (input[cursor] === "\\" && input[cursor + 1] === "(") {
      const close = input.indexOf("\\)", cursor + 2);
      if (close !== -1) {
        pushPlain(cursor);
        runs.push({
          font: "regular",
          text: normalizeTexForPdf(input.slice(cursor + 2, close)),
          ...(inheritedUrl !== undefined ? { url: inheritedUrl } : {})
        });
        cursor = close + 2;
        plainStart = cursor;
        continue;
      }
    }

    if (input[cursor] === "`") {
      const close = input.indexOf("`", cursor + 1);
      if (close !== -1) {
        pushPlain(cursor);
        runs.push({
          font: "mono",
          text: input.slice(cursor + 1, close),
          ...(inheritedUrl !== undefined ? { url: inheritedUrl } : {})
        });
        cursor = close + 1;
        plainStart = cursor;
        continue;
      }
    }

    const strongMarker = input.startsWith("**", cursor)
      ? "**"
      : input.startsWith("__", cursor)
        ? "__"
        : undefined;
    if (strongMarker !== undefined) {
      const close = input.indexOf(strongMarker, cursor + 2);
      if (close !== -1) {
        pushPlain(cursor);
        runs.push(...parsePdfInlineRuns(input.slice(cursor + 2, close), "bold", inheritedUrl));
        cursor = close + 2;
        plainStart = cursor;
        continue;
      }
    }

    const emphasisMarker =
      input[cursor] === "*" && !input.startsWith("**", cursor)
        ? "*"
        : input[cursor] === "_" && !input.startsWith("__", cursor)
          ? "_"
          : undefined;
    if (emphasisMarker !== undefined) {
      const previous = cursor === 0 ? undefined : input[cursor - 1];
      const next = input[cursor + 1];
      const canOpen =
        next !== undefined &&
        !/\s/u.test(next) &&
        (emphasisMarker === "*" || previous === undefined || !/[\p{L}\p{N}]/u.test(previous));
      const close = canOpen ? input.indexOf(emphasisMarker, cursor + 1) : -1;
      const afterClose = close === -1 ? undefined : input[close + 1];
      const canClose =
        close > cursor + 1 &&
        !/\s/u.test(input[close - 1]) &&
        (emphasisMarker === "*" || afterClose === undefined || !/[\p{L}\p{N}]/u.test(afterClose));

      if (canClose) {
        pushPlain(cursor);
        // The bundled PDF font set has no italic face. Preserve the semantic emphasis and
        // remove Markdown delimiters while rendering with the inherited readable face.
        runs.push(
          ...parsePdfInlineRuns(input.slice(cursor + 1, close), inheritedFont, inheritedUrl)
        );
        cursor = close + 1;
        plainStart = cursor;
        continue;
      }
    }

    if (input[cursor] === "[") {
      const link = /^\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/u.exec(input.slice(cursor));
      if (link !== null) {
        pushPlain(cursor);
        runs.push(...parsePdfInlineRuns(link[1], inheritedFont, link[2]));
        cursor += link[0].length;
        plainStart = cursor;
        continue;
      }
    }

    const autoLink = /^https?:\/\/[^\s<]+/u.exec(input.slice(cursor));
    if (autoLink !== null) {
      pushPlain(cursor);
      const url = autoLink[0].replace(/[),.;:!?]+$/u, "");
      runs.push({ font: inheritedFont, text: url, url });
      cursor += url.length;
      plainStart = cursor;
      continue;
    }

    cursor += 1;
  }

  pushPlain(input.length);
  return mergePdfInlineRuns(runs);
}

function mergePdfInlineRuns(runs: readonly PdfInlineRun[]): readonly PdfInlineRun[] {
  const merged: PdfInlineRun[] = [];
  runs.forEach((run) => {
    const previous = merged[merged.length - 1];
    if (previous?.font === run.font && previous.url === run.url) {
      merged[merged.length - 1] = { ...previous, text: previous.text + run.text };
    } else if (run.text.length > 0) {
      merged.push(run);
    }
  });
  return merged;
}

function wrapPdfInlineRuns(
  runs: readonly PdfInlineRun[],
  maxWidth: number,
  measure: (run: PdfInlineRun) => number
): readonly (readonly PdfInlineRun[])[] {
  const lines: PdfInlineRun[][] = [];
  let line: PdfInlineRun[] = [];
  let lineWidth = 0;
  const flush = () => {
    while (line[0]?.text.trim().length === 0) {
      line.shift();
    }
    lines.push(mergePdfInlineRuns(line) as PdfInlineRun[]);
    line = [];
    lineWidth = 0;
  };

  for (const run of runs) {
    for (const segment of run.text.split(/(\n|\s+)/u).filter((value) => value.length > 0)) {
      if (segment === "\n") {
        flush();
        continue;
      }
      const piece: PdfInlineRun = { ...run, text: segment };
      const width = measure(piece);
      if (line.length > 0 && lineWidth + width > maxWidth && segment.trim().length > 0) {
        flush();
      }
      if (width <= maxWidth || segment.trim().length === 0) {
        if (line.length > 0 || segment.trim().length > 0) {
          line.push(piece);
          lineWidth += width;
        }
        continue;
      }

      let chunk = "";
      for (const character of segment) {
        const next = chunk + character;
        if (chunk.length > 0 && measure({ ...piece, text: next }) > maxWidth) {
          line.push({ ...piece, text: chunk });
          flush();
          chunk = character;
        } else {
          chunk = next;
        }
      }
      if (chunk.length > 0) {
        line.push({ ...piece, text: chunk });
        lineWidth = measure({ ...piece, text: chunk });
      }
    }
  }

  if (line.length > 0 || lines.length === 0) {
    flush();
  }
  return lines;
}

function wrapExactText(
  input: string,
  maxWidth: number,
  measure: (value: string) => number
): readonly string[] {
  const lines: string[] = [];
  for (const sourceLine of normalizePdfText(input).split("\n")) {
    let current = "";
    for (const token of sourceLine.split(/(\s+)/u).filter(Boolean)) {
      const next = current + token;
      if (current.trim().length > 0 && measure(next) > maxWidth && token.trim().length > 0) {
        lines.push(current.trimEnd());
        current = token.trimStart();
      } else if (measure(token) > maxWidth && token.trim().length > 0) {
        for (const character of token) {
          if (current.length > 0 && measure(current + character) > maxWidth) {
            lines.push(current);
            current = character;
          } else {
            current += character;
          }
        }
      } else {
        current = next;
      }
    }
    lines.push(current.trimEnd());
  }
  return lines.length > 0 ? lines : [""];
}

function normalizeTexForPdf(tex: string): string {
  return tex
    .replace(/\\times\b/gu, "×")
    .replace(/\\cdot\b/gu, "·")
    .replace(/\\leq?\b/gu, "≤")
    .replace(/\\geq?\b/gu, "≥")
    .replace(/\\neq\b/gu, "≠")
    .replace(/\\pm\b/gu, "±")
    .replace(/\\%/gu, "%")
    .replace(/[{}]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function allocateTableColumnWidths(
  rows: readonly (readonly string[])[],
  contentWidth: number,
  fontSize: number,
  measureText: (value: string) => number = (value) => [...value].length * fontSize * 0.55
): readonly number[] {
  const columnCount = Math.max(...rows.map((row) => row.length), 1);
  const baseMinimum = Math.min(Math.max(fontSize * 4.5, 42), contentWidth / columnCount);
  const metrics = Array.from({ length: columnCount }, (_value, columnIndex) => {
    const values = rows.map((row) => stripInlineMarkdown(row[columnIndex] ?? ""));
    const numeric = values.slice(1).every((value) => value.length === 0 || isNumericPdfCell(value));
    const longest = Math.max(...values.map((value) => Math.min(48, [...value].length)), 4);
    const naturalWidth = Math.max(...values.map((value) => measureText(value)), 0) + 10;
    const compact = numeric || longest <= 24;
    const requiredWidth = compact
      ? Math.min(Math.max(baseMinimum, naturalWidth), contentWidth * 0.32)
      : baseMinimum;

    return {
      requiredWidth,
      weight: numeric ? Math.max(10, longest * 1.15) : Math.max(8, longest)
    };
  });
  const requiredTotal = metrics.reduce((total, metric) => total + metric.requiredWidth, 0);

  if (requiredTotal >= contentWidth) {
    const scale = contentWidth / requiredTotal;
    return metrics.map((metric) => metric.requiredWidth * scale);
  }

  const remainingWidth = contentWidth - requiredTotal;
  const totalWeight = metrics.reduce((total, metric) => total + metric.weight, 0);
  const widths = metrics.map(
    (metric) => metric.requiredWidth + (remainingWidth * metric.weight) / totalWeight
  );
  widths[widths.length - 1] += contentWidth - widths.reduce((total, width) => total + width, 0);
  return widths;
}

function isNumericPdfCell(value: string): boolean {
  return /^\s*(?:[$€£₽₸]\s*)?[+-]?[\d\s.,]+(?:\s*[-–—]\s*(?:[$€£₽₸]\s*)?[\d\s.,]+)?(?:\s*[%$€£₽₸])?\s*$/u.test(
    value
  );
}

function decodeJpegDataUri(
  dataUri: string | undefined
): { readonly bytes: Uint8Array; readonly height: number; readonly width: number } | undefined {
  const match = /^data:image\/jpe?g;base64,([a-z0-9+/=\s]+)$/iu.exec(dataUri ?? "");
  if (match === null) {
    return undefined;
  }
  try {
    const binary = globalThis.atob(match[1].replace(/\s+/gu, ""));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const dimensions = readJpegDimensions(bytes);
    return dimensions === undefined ? undefined : { bytes, ...dimensions };
  } catch {
    return undefined;
  }
}

function readJpegDimensions(
  bytes: Uint8Array
): { readonly height: number; readonly width: number } | undefined {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return undefined;
  }
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2) {
      return undefined;
    }
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: (bytes[offset + 5] << 8) | bytes[offset + 6],
        width: (bytes[offset + 7] << 8) | bytes[offset + 8]
      };
    }
    offset += length + 2;
  }
  return undefined;
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

  if (font === "emoji") {
    return "F4";
  }

  return "F1";
}

function colorOperator(color: PdfColor, operation: "fill" | "stroke"): string {
  return `${formatNumber(color.r)} ${formatNumber(color.g)} ${formatNumber(color.b)} ${operation === "fill" ? "rg" : "RG"}`;
}

function roundedRectPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): string {
  const resolvedRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  const controlOffset = resolvedRadius * 0.552_284_75;
  const right = x + width;
  const top = y + height;

  return [
    `${formatNumber(x + resolvedRadius)} ${formatNumber(y)} m`,
    `${formatNumber(right - resolvedRadius)} ${formatNumber(y)} l`,
    `${formatNumber(right - resolvedRadius + controlOffset)} ${formatNumber(y)} ${formatNumber(
      right
    )} ${formatNumber(y + resolvedRadius - controlOffset)} ${formatNumber(right)} ${formatNumber(
      y + resolvedRadius
    )} c`,
    `${formatNumber(right)} ${formatNumber(top - resolvedRadius)} l`,
    `${formatNumber(right)} ${formatNumber(top - resolvedRadius + controlOffset)} ${formatNumber(
      right - resolvedRadius + controlOffset
    )} ${formatNumber(top)} ${formatNumber(right - resolvedRadius)} ${formatNumber(top)} c`,
    `${formatNumber(x + resolvedRadius)} ${formatNumber(top)} l`,
    `${formatNumber(x + resolvedRadius - controlOffset)} ${formatNumber(top)} ${formatNumber(
      x
    )} ${formatNumber(top - resolvedRadius + controlOffset)} ${formatNumber(x)} ${formatNumber(
      top - resolvedRadius
    )} c`,
    `${formatNumber(x)} ${formatNumber(y + resolvedRadius)} l`,
    `${formatNumber(x)} ${formatNumber(y + resolvedRadius - controlOffset)} ${formatNumber(
      x + resolvedRadius - controlOffset
    )} ${formatNumber(y)} ${formatNumber(x + resolvedRadius)} ${formatNumber(y)} c`,
    "h"
  ].join(" ");
}

function formatNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(3).replace(/0+$/u, "").replace(/\.$/u, "");
}
