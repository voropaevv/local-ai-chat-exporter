import type {
  ConversationExport,
  ExportedCodeBlock,
  ExportedImageRef,
  ExportedMessage
} from "../core/schema";
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
  const title = normalizeSingleLine(conversation.title ?? "Untitled conversation");
  const warnings = collectWarnings(conversation);
  const warningsSection = renderWarningsSection(warnings);
  const messages = conversation.messages.map(renderMessage).join("\n");
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
        <div><strong>Platform:</strong> ${escapeHtml(conversation.platformLabel)}</div>
        <div><strong>Source:</strong> <a href="${safeHref(conversation.sourceUrl)}" rel="noreferrer">${escapeHtml(
          conversation.sourceUrl
        )}</a></div>
        <div><strong>Exported:</strong> ${escapeHtml(conversation.exportedAt)}</div>
        <div><strong>Messages:</strong> ${conversation.messageCount}</div>
        <div><strong>Completeness:</strong> ${escapeHtml(conversation.completeness.status)}</div>
      </section>${warningsSection}
    </header>
${messages}
    <footer>This file was generated locally by extension from content visible in the current conversation.</footer>
  </main>
</body>
</html>
`;

  return createRenderedFile(conversation, "html", "text/html;charset=utf-8", html, options);
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

  return `    <article class="message" data-role="${escapeAttribute(message.role)}" data-message-id="${escapeAttribute(
    message.id
  )}">
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
  let body: string;

  if (message.html !== undefined && message.html.trim().length > 0) {
    body = sanitizeMessageHtml(message.html);
  } else if (message.markdown !== undefined && message.markdown.trim().length > 0) {
    body = markdownToHtml(message.markdown, message.codeBlocks);
  } else {
    body = textToHtml(message.text, message.codeBlocks);
  }

  return `${body}${imageRefs}`;
}

function sanitizeMessageHtml(input: string): string {
  return addRelToLinks(
    neutralizeUnsafeUrls(
      input
        .replace(
          /<\s*(script|style|iframe|object|embed|svg|math|link|meta|base|form|button|audio|video|picture|canvas)\b[\s\S]*?<\s*\/\s*\1\s*>/gi,
          ""
        )
        .replace(
          /<\s*(script|style|iframe|object|embed|svg|math|link|meta|base|form|input|button|img|source|track|audio|video|picture|canvas)\b[^>]*>/gi,
          ""
        )
        .replace(/\s+style\s*=\s*"[^"]*"/gi, "")
        .replace(/\s+style\s*=\s*'[^']*'/gi, "")
        .replace(/\s+(srcset|poster)\s*=\s*"[^"]*"/gi, "")
        .replace(/\s+(srcset|poster)\s*=\s*'[^']*'/gi, "")
        .replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, "")
        .replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, "")
        .replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, "")
    )
  ).trim();
}

function neutralizeUnsafeUrls(input: string): string {
  return input.replace(
    /\s(href|src)=("|')([^"']*)\2/gi,
    (_match: string, attributeName: string, quote: string, attributeValue: string) => {
      const normalizedAttribute = attributeName.toLocaleLowerCase();

      if (normalizedAttribute === "href") {
        return ` href=${quote}${safeHref(attributeValue)}${quote}`;
      }

      if (normalizedAttribute === "src" && isSafeDataImage(attributeValue)) {
        return ` src=${quote}${escapeAttribute(attributeValue)}${quote}`;
      }

      return "";
    }
  );
}

function addRelToLinks(input: string): string {
  return input.replace(/<a\b([^>]*)>/gi, (_match: string, attributes: string) => {
    if (/\srel\s*=/i.test(attributes)) {
      return `<a${attributes}>`;
    }

    return `<a${attributes} rel="noreferrer">`;
  });
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
  const source = image.src ?? image.localFilename ?? image.dataUri;
  const dimensions = renderDimensions(image);

  if (image.dataUri !== undefined && isSafeDataImage(image.dataUri)) {
    return `<figure><img src="${escapeAttribute(image.dataUri)}" alt="${escapeAttribute(
      image.alt ?? "Image"
    )}"${renderImageSizeAttributes(image)}>${dimensions ? `<figcaption>${dimensions}</figcaption>` : ""}</figure>`;
  }

  if (source !== undefined && isSafeHrefValue(source)) {
    return `${label}: <a href="${safeHref(source)}" rel="noreferrer">${escapeHtml(
      source
    )}</a>${dimensions}`;
  }

  return `${label}${source ? `: ${escapeHtml(source)}` : ""}${dimensions}`;
}

function renderDimensions(image: ExportedImageRef): string {
  if (image.width === undefined || image.height === undefined) {
    return "";
  }

  return ` (${image.width}x${image.height})`;
}

function renderImageSizeAttributes(image: ExportedImageRef): string {
  const width = image.width !== undefined ? ` width="${image.width}"` : "";
  const height = image.height !== undefined ? ` height="${image.height}"` : "";

  return `${width}${height}`;
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

function isSafeDataImage(input: string): boolean {
  return /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(input.trim());
}
