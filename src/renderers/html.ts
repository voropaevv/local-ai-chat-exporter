import type {
  ConversationExport,
  ExportedCodeBlock,
  ExportedImageRef,
  ExportedMessage
} from "../core/schema";
import {
  isSafeExternalImageUrl,
  renderImageReferenceText,
  sanitizeConversationImagesForOutput
} from "../core/image-safety";
import { formatSourceKindLabel } from "./advanced-content";
import { createRenderedFile, type RenderedFile, type RendererOptions } from "./types";

const HTML_CSS = `:root { color-scheme: light; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
body { margin: 0; color: #1f2328; background: #ffffff; line-height: 1.55; }
main { max-width: 920px; margin: 0 auto; padding: 32px 20px 48px; }
header { border-bottom: 1px solid #d8dee4; margin-bottom: 28px; padding-bottom: 20px; }
h1 { font-size: 2rem; line-height: 1.2; margin: 0 0 12px; }
h2 { font-size: 1.25rem; margin: 0 0 12px; }
p { margin: 0 0 12px; }
a { color: #0969da; }
.meta { display: grid; gap: 6px; margin: 16px 0; }
.meta div { overflow-wrap: anywhere; }
.warnings { border: 1px solid #f0c36d; background: #fff8c5; padding: 12px 16px; margin: 16px 0; }
.message { border-top: 1px solid #d8dee4; padding: 22px 0; }
.message-meta { color: #57606a; font-size: 0.92rem; margin-bottom: 12px; }
.image-refs { background: #f6f8fa; border: 1px solid #d8dee4; margin: 14px 0 0; padding: 10px 12px; }
.image-refs h3 { font-size: 0.95rem; margin: 0 0 8px; }
.image-refs ul { margin: 0; padding-left: 20px; }
.image-refs li { overflow-wrap: anywhere; }
.image-refs img { display: block; height: auto; max-width: min(100%, 640px); }
.advanced-section { background: #f6f8fa; border: 1px solid #d8dee4; margin: 14px 0 0; padding: 10px 12px; }
.advanced-section h3 { font-size: 0.95rem; margin: 0 0 8px; }
.advanced-section ul { margin: 0; padding-left: 20px; }
.advanced-section li { overflow-wrap: anywhere; }
pre { background: #f6f8fa; border: 1px solid #d8dee4; overflow: auto; padding: 12px; }
code { font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", monospace; font-size: 0.92em; }
table { border-collapse: collapse; display: block; margin: 12px 0; overflow-x: auto; width: 100%; }
th, td { border: 1px solid #d8dee4; padding: 6px 10px; text-align: left; }
footer { border-top: 1px solid #d8dee4; color: #57606a; font-size: 0.9rem; margin-top: 28px; padding-top: 16px; }
@media print {
  body { color: #000000; }
  main { max-width: none; padding: 0; }
  a { color: #000000; text-decoration: underline; }
  .message { break-inside: avoid; }
  pre, table { break-inside: avoid; }
}`;

export function renderHtml(
  conversation: ConversationExport,
  options: RendererOptions = {}
): RenderedFile {
  const safeConversation = sanitizeConversationImagesForOutput(conversation);
  const title = normalizeSingleLine(safeConversation.title ?? "Untitled conversation");
  const warnings = collectWarnings(safeConversation);
  const warningsSection = renderWarningsSection(warnings);
  const messages = safeConversation.messages.map(renderMessage).join("\n");
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
${HTML_CSS}
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(title)}</h1>
      <p>This export was generated locally by extension.</p>
      <section class="meta" aria-label="Export metadata">
        <div><strong>Platform:</strong> ${escapeHtml(safeConversation.platformLabel)}</div>
        <div><strong>Source:</strong> <a href="${safeHref(safeConversation.sourceUrl)}" rel="noreferrer">${escapeHtml(
          safeConversation.sourceUrl
        )}</a></div>
        <div><strong>Exported:</strong> ${escapeHtml(safeConversation.exportedAt)}</div>
        <div><strong>Messages:</strong> ${safeConversation.messageCount}</div>
        <div><strong>Completeness:</strong> ${escapeHtml(safeConversation.completeness.status)}</div>
      </section>${warningsSection}
    </header>
${messages}
    <footer>This file was generated locally by extension from content visible in the current conversation.</footer>
  </main>
</body>
</html>
`;

  return createRenderedFile(safeConversation, "html", "text/html;charset=utf-8", html, options);
}

function renderWarningsSection(warnings: readonly string[]): string {
  if (warnings.length === 0) {
    return "";
  }

  return `
      <section class="warnings" aria-label="Completeness warnings">
        <strong>Warnings</strong>
        <ul>
${warnings.map((warning) => `          <li>${escapeHtml(warning)}</li>`).join("\n")}
        </ul>
      </section>`;
}

function renderMessage(message: ExportedMessage): string {
  const messageMeta = renderMessageMeta(message);

  return `    <article class="message">
      <h2>${message.index + 1}. ${escapeHtml(normalizeSingleLine(message.authorLabel))}</h2>
      <div class="message-meta">${escapeHtml(messageMeta)}</div>
      <div class="message-body">${renderMessageBody(message)}</div>
    </article>`;
}

function renderMessageMeta(message: ExportedMessage): string {
  const parts = [`Role: ${message.role}`];

  if (message.model !== undefined) {
    parts.push(`Model: ${message.model}`);
  }

  if (message.createdAt !== undefined) {
    parts.push(`Created: ${message.createdAt}`);
  }

  return parts.join(" - ");
}

function renderMessageBody(message: ExportedMessage): string {
  const imageRefs = renderImageRefs(message.images);
  const advancedContent = renderAdvancedSections(message);
  let body: string;

  if (message.markdown !== undefined && message.markdown.trim().length > 0) {
    body = markdownToHtml(message.markdown, message.codeBlocks);
  } else {
    body = textToHtml(message.text, message.codeBlocks);
  }

  return `${body}${imageRefs}${advancedContent}`;
}

function renderAdvancedSections(message: ExportedMessage): string {
  return [
    renderSourcesSection(message),
    renderCanvasSection(message),
    renderThinkingSection(message)
  ].join("");
}

function renderSourcesSection(message: ExportedMessage): string {
  const sources = message.sources ?? [];

  if (sources.length === 0) {
    return "";
  }

  return `<section class="advanced-section" aria-label="Sources"><h3>Sources</h3><ul>${sources
    .map(
      (source) =>
        `<li>${escapeHtml(formatSourceKindLabel(source.kind))}: <a href="${safeHref(
          source.url
        )}" rel="noreferrer">${escapeHtml(source.title)}</a>${source.snippet ? ` - ${escapeHtml(source.snippet)}` : ""}</li>`
    )
    .join("")}</ul></section>`;
}

function renderCanvasSection(message: ExportedMessage): string {
  const canvases = message.canvas ?? [];

  if (canvases.length === 0) {
    return "";
  }

  return `<section class="advanced-section" aria-label="Canvas"><h3>Canvas</h3><ul>${canvases
    .map((canvas) => {
      const title = escapeHtml(canvas.title ?? "Canvas");
      const link =
        canvas.url !== undefined
          ? ` <a href="${safeHref(canvas.url)}" rel="noreferrer">Open canvas</a>`
          : "";
      const body = [canvas.text, canvas.warning]
        .filter((part): part is string => part !== undefined && part.length > 0)
        .map(escapeHtml)
        .join(" ");

      return `<li>${title}${link}${body.length > 0 ? ` - ${body}` : ""}</li>`;
    })
    .join("")}</ul></section>`;
}

function renderThinkingSection(message: ExportedMessage): string {
  const blocks = message.thinkingBlocks ?? [];

  if (blocks.length === 0) {
    return "";
  }

  return `<section class="advanced-section" aria-label="Visible thinking or reasoning"><h3>Visible thinking / reasoning</h3><ul>${blocks
    .map((block) => {
      const title = block.title !== undefined ? `${block.title}: ` : "";
      return `<li>${escapeHtml(`${title}${block.text}`)}</li>`;
    })
    .join("")}</ul></section>`;
}

function markdownToHtml(markdown: string, codeBlocks: readonly ExportedCodeBlock[]): string {
  const normalized = markdown.replace(/\r\n?/g, "\n").trim();
  const lines = normalized.split("\n");
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    if (lines[index].trim() === "") {
      index += 1;
      continue;
    }

    if (lines[index].startsWith("```")) {
      const parsed = parseFencedCode(lines, index);
      blocks.push(renderCodeBlock(parsed.language, parsed.code));
      index = parsed.nextIndex;
      continue;
    }

    if (isTableStart(lines, index)) {
      const parsed = parseTable(lines, index);
      blocks.push(parsed.html);
      index = parsed.nextIndex;
      continue;
    }

    const paragraph: string[] = [];

    while (
      index < lines.length &&
      lines[index].trim() !== "" &&
      !lines[index].startsWith("```") &&
      !isTableStart(lines, index)
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }

    blocks.push(`<p>${renderInlineMarkdown(paragraph.join("\n"))}</p>`);
  }

  if (codeBlocks.length > 0 && !containsFence(normalized)) {
    blocks.push(
      ...codeBlocks.map((codeBlock) => renderCodeBlock(codeBlock.language, codeBlock.code))
    );
  }

  return blocks.join("");
}

function textToHtml(text: string, codeBlocks: readonly ExportedCodeBlock[]): string {
  const blocks = text
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .filter((paragraph) => paragraph.trim().length > 0)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim()).replace(/\n/g, "<br>")}</p>`);

  blocks.push(
    ...codeBlocks.map((codeBlock) => renderCodeBlock(codeBlock.language, codeBlock.code))
  );

  return blocks.join("");
}

function renderImageRefs(images: readonly ExportedImageRef[]): string {
  if (images.length === 0) {
    return "";
  }

  return `<section class="image-refs" aria-label="Image references"><h3>Images</h3><ul>${images
    .map((image) => `<li>${renderImageRef(image)}</li>`)
    .join("")}</ul></section>`;
}

function renderImageRef(image: ExportedImageRef): string {
  const label = escapeHtml(image.alt?.trim() || "Image");
  const source = image.src ?? image.localFilename;
  const dimensions = renderDimensions(image);

  if (source !== undefined && isSafeExternalImageUrl(source)) {
    return `${label}: <a href="${safeHref(source)}" rel="noreferrer">${escapeHtml(
      source
    )}</a>${dimensions}`;
  }

  return escapeHtml(renderImageReferenceText(image));
}

function renderDimensions(image: ExportedImageRef): string {
  if (image.width === undefined || image.height === undefined) {
    return "";
  }

  return ` (${image.width}x${image.height})`;
}

function parseFencedCode(
  lines: readonly string[],
  startIndex: number
): { readonly language: string | undefined; readonly code: string; readonly nextIndex: number } {
  const openingFence = lines[startIndex];
  const language = openingFence.replace(/^```/, "").trim() || undefined;
  const codeLines: string[] = [];
  let index = startIndex + 1;

  while (index < lines.length && !lines[index].startsWith("```")) {
    codeLines.push(lines[index]);
    index += 1;
  }

  return {
    language,
    code: codeLines.join("\n"),
    nextIndex: index < lines.length ? index + 1 : index
  };
}

function renderCodeBlock(language: string | undefined, code: string): string {
  const classAttribute =
    language === undefined || language.trim().length === 0
      ? ""
      : ` class="language-${escapeAttribute(language.replace(/[^A-Za-z0-9_-]/g, ""))}"`;

  return `<pre><code${classAttribute}>${escapeHtml(code.replace(/\r\n?/g, "\n").replace(/\n*$/g, ""))}</code></pre>`;
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
): { readonly html: string; readonly nextIndex: number } {
  const header = parseTableRow(lines[startIndex]);
  const bodyRows: string[][] = [];
  let index = startIndex + 2;

  while (index < lines.length && lines[index].trim().startsWith("|")) {
    bodyRows.push(parseTableRow(lines[index]));
    index += 1;
  }

  const headerHtml = header.map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`).join("");
  const bodyHtml = bodyRows
    .map(
      (row) => `<tr>${row.map((cell) => `<td>${renderInlineMarkdown(cell)}</td>`).join("")}</tr>`
    )
    .join("");

  return {
    html: `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`,
    nextIndex: index
  };
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderInlineMarkdown(input: string): string {
  const linkPattern = /\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let output = "";
  let lastIndex = 0;
  let match = linkPattern.exec(input);

  while (match !== null) {
    output += escapeHtml(input.slice(lastIndex, match.index));
    output += `<a href="${safeHref(match[2])}" rel="noreferrer">${escapeHtml(match[1])}</a>`;
    lastIndex = match.index + match[0].length;
    match = linkPattern.exec(input);
  }

  output += escapeHtml(input.slice(lastIndex));

  return output;
}

function containsFence(markdown: string): boolean {
  return /^```/m.test(markdown);
}

function normalizeSingleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function collectWarnings(conversation: ConversationExport): readonly string[] {
  return [...conversation.completeness.warnings, ...conversation.completeness.platformWarnings];
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(input: string): string {
  return escapeHtml(input);
}

function safeHref(input: string): string {
  return isSafeHrefValue(input) ? escapeAttribute(input) : "#";
}

function isSafeHrefValue(input: string): boolean {
  try {
    const parsed = new URL(input);
    return (
      parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:"
    );
  } catch {
    return false;
  }
}
