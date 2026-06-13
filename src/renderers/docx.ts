import { strToU8, zipSync } from "fflate";

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
import { renderAdvancedTextLines } from "./advanced-content";
import { createRenderedFile, type RenderedFile, type RendererOptions } from "./types";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function renderDocx(
  conversation: ConversationExport,
  options: RendererOptions = {}
): RenderedFile<Uint8Array> {
  const safeConversation = sanitizeConversationImagesForOutput(conversation);

  return createRenderedFile(
    safeConversation,
    "docx",
    DOCX_MIME,
    zipSync({
      "[Content_Types].xml": strToU8(renderContentTypesXml()),
      "_rels/.rels": strToU8(renderRootRelationshipsXml()),
      "docProps/app.xml": strToU8(renderAppPropertiesXml()),
      "docProps/core.xml": strToU8(renderCorePropertiesXml(safeConversation)),
      "word/document.xml": strToU8(renderDocumentXml(safeConversation)),
      "word/styles.xml": strToU8(renderStylesXml())
    }),
    options
  );
}

function renderDocumentXml(conversation: ConversationExport): string {
  const body = [
    renderParagraph(conversation.title ?? "Untitled conversation", "Title"),
    renderParagraph(`Platform: ${conversation.platformLabel}`),
    renderParagraph(`Source: ${conversation.sourceUrl}`),
    renderParagraph(`Exported: ${conversation.exportedAt}`),
    renderParagraph(`Messages: ${conversation.messageCount}`),
    renderParagraph(`Completeness: ${conversation.completeness.status}`),
    ...renderWarnings(conversation),
    ...conversation.messages.flatMap(renderMessage),
    `<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>`
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>${body}</w:body>
</w:document>`;
}

function renderMessage(message: ExportedMessage): readonly string[] {
  const bodyParagraphs =
    message.markdown !== undefined
      ? extractMarkdownParagraphs(message.markdown)
      : splitParagraphs(message.text);

  return [
    renderParagraph(`${message.index + 1}. ${message.authorLabel}`, "Heading1"),
    renderParagraph(`Role: ${message.role}${message.model ? ` | Model: ${message.model}` : ""}`),
    ...renderMarkdownTables(message.markdown),
    ...bodyParagraphs.map((paragraph) => renderParagraph(paragraph)),
    ...message.codeBlocks.map(renderCodeBlock),
    ...renderImageRefs(message.images),
    ...renderAdvancedTextLines(message)
      .filter((line) => line.length > 0)
      .map((line) => renderParagraph(line))
  ];
}

function renderWarnings(conversation: ConversationExport): readonly string[] {
  const warnings = [
    ...conversation.completeness.warnings,
    ...conversation.completeness.platformWarnings
  ];

  if (warnings.length === 0) {
    return [];
  }

  return [
    renderParagraph("Warnings", "Heading2"),
    ...warnings.map((warning) => renderParagraph(warning))
  ];
}

function renderCodeBlock(codeBlock: ExportedCodeBlock): string {
  const label = codeBlock.language ? `Code (${codeBlock.language})` : "Code";

  return `${renderParagraph(label, "Heading2")}${renderParagraph(
    codeBlock.code.replace(/\n*$/g, ""),
    "CodeBlock"
  )}`;
}

function renderMarkdownTables(markdown: string | undefined): readonly string[] {
  if (markdown === undefined) {
    return [];
  }

  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const tables: string[] = [];
  let index = 0;

  while (index < lines.length) {
    if (isTableStart(lines, index)) {
      const parsed = parseTable(lines, index);
      tables.push(renderTable(parsed.rows));
      index = parsed.nextIndex;
      continue;
    }

    index += 1;
  }

  return tables;
}

function extractMarkdownParagraphs(markdown: string): readonly string[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const paragraphs: string[] = [];
  let currentParagraph: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.startsWith("```")) {
      flushParagraph(paragraphs, currentParagraph);
      currentParagraph = [];
      index += 1;

      while (index < lines.length && !lines[index].startsWith("```")) {
        index += 1;
      }

      index += index < lines.length ? 1 : 0;
      continue;
    }

    if (isTableStart(lines, index)) {
      flushParagraph(paragraphs, currentParagraph);
      currentParagraph = [];
      index += 2;

      while (index < lines.length && lines[index].trim().startsWith("|")) {
        index += 1;
      }

      continue;
    }

    if (line.trim().length === 0) {
      flushParagraph(paragraphs, currentParagraph);
      currentParagraph = [];
      index += 1;
      continue;
    }

    currentParagraph.push(stripInlineMarkdown(line));
    index += 1;
  }

  flushParagraph(paragraphs, currentParagraph);
  return paragraphs;
}

function renderTable(rows: readonly (readonly string[])[]): string {
  const renderedRows = rows
    .map(
      (row) =>
        `<w:tr>${row
          .map(
            (cell) =>
              `<w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/></w:tcPr>${renderParagraph(
                cell
              )}</w:tc>`
          )
          .join("")}</w:tr>`
    )
    .join("");

  return `<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>${renderedRows}</w:tbl>`;
}

function isTableStart(lines: readonly string[], index: number): boolean {
  return lines[index]?.trim().startsWith("|") === true && isTableDivider(lines[index + 1]);
}

function isTableDivider(line: string | undefined): boolean {
  if (line === undefined || !line.trim().startsWith("|")) {
    return false;
  }

  return parseTableRow(line).every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

function parseTable(
  lines: readonly string[],
  startIndex: number
): { readonly rows: readonly string[][]; readonly nextIndex: number } {
  const rows = [parseTableRow(lines[startIndex])];
  let index = startIndex + 2;

  while (index < lines.length && lines[index].trim().startsWith("|")) {
    rows.push(parseTableRow(lines[index]));
    index += 1;
  }

  return { rows, nextIndex: index };
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function splitParagraphs(text: string): readonly string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

function renderImageRefs(images: readonly ExportedImageRef[]): readonly string[] {
  if (images.length === 0) {
    return [];
  }

  return [
    renderParagraph("Images", "Heading2"),
    ...images.map((image) => renderParagraph(renderImageRef(image)))
  ];
}

function renderImageRef(image: ExportedImageRef): string {
  const label = image.alt?.trim() || "Image";
  const source = image.src ?? image.localFilename;
  const dimensions =
    image.width !== undefined && image.height !== undefined
      ? ` (${image.width}x${image.height})`
      : "";

  if (source !== undefined) {
    return `Image: ${label} - ${source}${dimensions}`;
  }

  return renderImageReferenceText(image);
}

function flushParagraph(paragraphs: string[], lines: readonly string[]): void {
  const paragraph = lines.join("\n").trim();

  if (paragraph.length > 0) {
    paragraphs.push(paragraph);
  }
}

function stripInlineMarkdown(input: string): string {
  return input
    .replace(/\[([^\]\n]+)\]\(([^)\n]+)\)/g, "$1 ($2)")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1");
}

function renderParagraph(text: string, style?: string): string {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${xmlEscape(style)}"/></w:pPr>` : "";

  return `<w:p>${styleXml}<w:r>${renderTextWithBreaks(text)}</w:r></w:p>`;
}

function renderTextWithBreaks(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line, index) => `${index > 0 ? "<w:br/>" : ""}<w:t>${xmlEscape(line)}</w:t>`)
    .join("");
}

function renderContentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function renderRootRelationshipsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function renderAppPropertiesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Jelluvi</Application>
</Properties>`;
}

function renderCorePropertiesXml(conversation: ConversationExport): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xmlEscape(conversation.title ?? "Untitled conversation")}</dc:title>
  <dc:creator>Jelluvi</dc:creator>
  <cp:keywords>jelluvi</cp:keywords>
  <dcterms:created xsi:type="dcterms:W3CDTF">${xmlEscape(conversation.exportedAt)}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${xmlEscape(conversation.exportedAt)}</dcterms:modified>
</cp:coreProperties>`;
}

function renderStylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="Heading 2"/><w:rPr><w:b/><w:sz w:val="22"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="20"/></w:rPr></w:style>
</w:styles>`;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
