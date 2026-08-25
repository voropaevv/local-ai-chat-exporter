import type { ConversationExport, ExportedAttachmentRef, ExportedMessage } from "../core/schema";

export type HtmlTheme = "dark" | "light" | "system";

export type AttachmentVisualKind = "archive" | "code" | "document" | "image" | "other" | "website";

export function getMessageAttachments(message: ExportedMessage): readonly ExportedAttachmentRef[] {
  return message.attachments ?? [];
}

export function formatDisplayDateTime(value: string): string {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "short",
      timeZone: "UTC",
      timeZoneName: "short",
      year: "numeric"
    }).format(parsed);
  } catch {
    return value;
  }
}

export function getMessageDisplayTimestamp(message: ExportedMessage): string | undefined {
  const displayTimestamp = message.metadata.displayTimestamp;

  if (typeof displayTimestamp === "string" && displayTimestamp.trim().length > 0) {
    return displayTimestamp.trim();
  }

  return message.createdAt !== undefined && message.createdAt.trim().length > 0
    ? formatDisplayDateTime(message.createdAt)
    : undefined;
}

export function shouldShowCaptureStatus(conversation: ConversationExport): boolean {
  return (
    conversation.completeness.status !== "complete" ||
    conversation.completeness.warnings.length > 0 ||
    conversation.completeness.platformWarnings.length > 0
  );
}

export function formatAttachmentLabel(attachment: ExportedAttachmentRef): string {
  if (attachment.description !== undefined && attachment.description.trim().length > 0) {
    return attachment.description.trim();
  }

  if (attachment.mimeType !== undefined && attachment.mimeType.trim().length > 0) {
    return attachment.mimeType.trim();
  }

  const extension = attachment.name.split(".").pop()?.toLocaleUpperCase();

  if (extension !== undefined && extension !== attachment.name.toLocaleUpperCase()) {
    return `${extension} file`;
  }

  switch (attachment.kind) {
    case "image":
      return "Image";
    case "website":
      return "Website";
    case "other":
      return "Attachment";
    default:
      return "File";
  }
}

export function formatFileSize(sizeBytes: number | undefined): string | undefined {
  if (sizeBytes === undefined || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return undefined;
  }

  if (sizeBytes < 1_000) {
    return `${Math.round(sizeBytes)} B`;
  }

  if (sizeBytes < 1_000_000) {
    return `${formatDecimal(sizeBytes / 1_000)} KB`;
  }

  if (sizeBytes < 1_000_000_000) {
    return `${formatDecimal(sizeBytes / 1_000_000)} MB`;
  }

  return `${formatDecimal(sizeBytes / 1_000_000_000)} GB`;
}

export function getAttachmentVisualKind(attachment: ExportedAttachmentRef): AttachmentVisualKind {
  if (attachment.kind === "website") {
    return "website";
  }

  if (
    attachment.kind === "image" ||
    attachment.mimeType?.toLocaleLowerCase().startsWith("image/")
  ) {
    return "image";
  }

  const extension = fileExtension(attachment.name);
  const mimeType = attachment.mimeType?.toLocaleLowerCase() ?? "";

  if (
    ["7z", "bz2", "gz", "rar", "tar", "tgz", "xz", "zip"].includes(extension) ||
    /\b(?:7z|gzip|rar|tar|zip)\b/u.test(mimeType)
  ) {
    return "archive";
  }

  if (
    [
      "css",
      "csv",
      "html",
      "htm",
      "js",
      "json",
      "jsx",
      "md",
      "py",
      "sh",
      "sql",
      "ts",
      "tsx",
      "xml",
      "yaml",
      "yml"
    ].includes(extension) ||
    /\b(?:csv|html|javascript|json|markdown|shell|sql|xml|yaml)\b/u.test(mimeType)
  ) {
    return "code";
  }

  if (attachment.kind === "file") {
    return "document";
  }

  return "other";
}

export function formatAttachmentBadge(attachment: ExportedAttachmentRef): string {
  const extension = fileExtension(attachment.name).toLocaleUpperCase();

  if (extension.length > 0 && extension.length <= 5 && /^[A-Z0-9]+$/u.test(extension)) {
    return extension;
  }

  switch (getAttachmentVisualKind(attachment)) {
    case "archive":
      return "ZIP";
    case "code":
      return "CODE";
    case "document":
      return "FILE";
    case "image":
      return "IMG";
    case "website":
      return "WEB";
    case "other":
      return "ATT";
  }
}

export function renderSemanticMarkdown(markdown: string): string {
  const normalized = markdown.replace(/\r\n?/gu, "\n").trim();

  if (normalized.length === 0) {
    return "";
  }

  return renderMarkdownBlocks(normalized.split("\n"));
}

function fileExtension(name: string): string {
  const normalized = name.trim();
  const extension = normalized.includes(".") ? normalized.split(".").pop() : undefined;

  return extension === undefined || extension === normalized ? "" : extension.toLocaleLowerCase();
}

export function renderInlineMarkdown(input: string): string {
  let cursor = 0;
  let output = "";

  while (cursor < input.length) {
    const character = input[cursor];

    if (input.startsWith("\\(", cursor)) {
      const closingIndex = input.indexOf("\\)", cursor + 2);

      if (closingIndex !== -1) {
        output += renderMathMarkup(input.slice(cursor + 2, closingIndex), false);
        cursor = closingIndex + 2;
        continue;
      }
    }

    if (character === "\\" && cursor + 1 < input.length) {
      output += escapeHtml(input[cursor + 1]);
      cursor += 2;
      continue;
    }

    if (character === "\n") {
      output += "<br>";
      cursor += 1;
      continue;
    }

    if (character === "`") {
      const fenceLength = countRun(input, cursor, "`");
      const fence = "`".repeat(fenceLength);
      const closingIndex = input.indexOf(fence, cursor + fenceLength);

      if (closingIndex !== -1) {
        const code = input.slice(cursor + fenceLength, closingIndex).replace(/^\s|\s$/gu, "");
        output += `<code>${escapeHtml(code)}</code>`;
        cursor = closingIndex + fenceLength;
        continue;
      }
    }

    if (input.startsWith("![", cursor) || character === "[") {
      const parsedLink = parseMarkdownLink(input, cursor, input.startsWith("![", cursor));

      if (parsedLink !== undefined) {
        const label = renderInlineMarkdown(parsedLink.label);
        const href = safeHref(parsedLink.url);

        if (href !== undefined) {
          output += parsedLink.image
            ? `<a class="inline-media-link" href="${href}" rel="noopener noreferrer" target="_blank">${label}</a>`
            : `<a href="${href}" rel="noopener noreferrer" target="_blank">${label}</a>`;
          cursor = parsedLink.nextIndex;
          continue;
        }
      }
    }

    const strongMarker = input.startsWith("**", cursor)
      ? "**"
      : input.startsWith("__", cursor)
        ? "__"
        : undefined;

    if (strongMarker !== undefined) {
      const closingIndex = findUnescaped(input, strongMarker, cursor + strongMarker.length);

      if (closingIndex !== -1) {
        output += `<strong>${renderInlineMarkdown(
          input.slice(cursor + strongMarker.length, closingIndex)
        )}</strong>`;
        cursor = closingIndex + strongMarker.length;
        continue;
      }
    }

    if (input.startsWith("~~", cursor)) {
      const closingIndex = findUnescaped(input, "~~", cursor + 2);

      if (closingIndex !== -1) {
        output += `<del>${renderInlineMarkdown(input.slice(cursor + 2, closingIndex))}</del>`;
        cursor = closingIndex + 2;
        continue;
      }
    }

    if ((character === "*" || character === "_") && canOpenEmphasis(input, cursor)) {
      const closingIndex = findClosingEmphasis(input, character, cursor + 1);

      if (closingIndex !== -1) {
        output += `<em>${renderInlineMarkdown(input.slice(cursor + 1, closingIndex))}</em>`;
        cursor = closingIndex + 1;
        continue;
      }
    }

    const nextSpecial = findNextInlineSpecial(input, cursor + 1);
    const end = nextSpecial === -1 ? input.length : nextSpecial;
    output += renderPlainTextWithAutolinks(input.slice(cursor, end));
    cursor = end;
  }

  return output;
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

export function escapeAttribute(input: string): string {
  return escapeHtml(input);
}

export function safeHref(input: string): string | undefined {
  try {
    const parsed = new URL(input);

    return parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
      parsed.protocol === "mailto:"
      ? escapeAttribute(input)
      : undefined;
  } catch {
    return undefined;
  }
}

function renderMarkdownBlocks(lines: readonly string[]): string {
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    if (line.trim().startsWith("$$")) {
      const parsed = parseDisplayMath(lines, index);
      blocks.push(renderMathMarkup(parsed.tex, true));
      index = parsed.nextIndex;
      continue;
    }

    const fence = /^(\s*)(`{3,}|~{3,})([^`]*)$/u.exec(line);

    if (fence !== null) {
      const parsed = parseFencedCode(lines, index, fence[2], fence[3]);
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

    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/u.exec(line.trim());

    if (heading !== null) {
      const level = Math.min(6, heading[1].length + 2);
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (isThematicBreak(line)) {
      blocks.push("<hr>");
      index += 1;
      continue;
    }

    if (/^\s*>\s?/u.test(line)) {
      const quoteLines: string[] = [];

      while (index < lines.length && /^\s*>\s?/u.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/u, ""));
        index += 1;
      }

      blocks.push(`<blockquote>${renderMarkdownBlocks(quoteLines)}</blockquote>`);
      continue;
    }

    const listMarker = parseListMarker(line);

    if (listMarker !== undefined) {
      const parsed = parseList(lines, index, listMarker.ordered);
      blocks.push(parsed.html);
      index = parsed.nextIndex;
      continue;
    }

    const paragraph: string[] = [];

    while (index < lines.length && lines[index].trim().length > 0 && !isBlockStart(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }

    if (paragraph.length === 0) {
      paragraph.push(line.trim());
      index += 1;
    }

    blocks.push(`<p>${renderInlineMarkdown(paragraph.join("\n"))}</p>`);
  }

  return blocks.join("");
}

function parseList(
  lines: readonly string[],
  startIndex: number,
  ordered: boolean,
  baseIndent = parseListMarker(lines[startIndex])?.indent ?? 0
): { readonly html: string; readonly nextIndex: number } {
  const items: string[] = [];
  let index = startIndex;
  let start = 1;

  while (index < lines.length) {
    const marker = parseListMarker(lines[index]);

    if (marker === undefined || marker.ordered !== ordered || marker.indent !== baseIndent) {
      break;
    }

    if (items.length === 0 && marker.start !== undefined) {
      start = marker.start;
    }

    let paragraphLines = [marker.body];
    const itemParts: string[] = [];
    index += 1;

    while (index < lines.length && lines[index].trim().length > 0) {
      const nestedMarker = parseListMarker(lines[index]);

      if (nestedMarker !== undefined) {
        if (nestedMarker.indent <= baseIndent) {
          break;
        }

        flushListItemParagraph(itemParts, paragraphLines);
        paragraphLines = [];
        const nested = parseList(lines, index, nestedMarker.ordered, nestedMarker.indent);
        itemParts.push(nested.html);
        index = nested.nextIndex;
        continue;
      }

      if (countLeadingIndent(lines[index]) <= baseIndent) {
        break;
      }

      paragraphLines.push(lines[index].trim());
      index += 1;
    }

    flushListItemParagraph(itemParts, paragraphLines);
    items.push(`<li>${itemParts.join("")}</li>`);
  }

  const tag = ordered ? "ol" : "ul";
  const startAttribute = ordered && start !== 1 ? ` start="${start}"` : "";

  return {
    html: `<${tag}${startAttribute}>${items.join("")}</${tag}>`,
    nextIndex: index
  };
}

function flushListItemParagraph(parts: string[], lines: readonly string[]): void {
  if (lines.length > 0) {
    parts.push(renderInlineMarkdown(lines.join("\n")));
  }
}

function parseListMarker(line: string):
  | {
      readonly body: string;
      readonly indent: number;
      readonly ordered: boolean;
      readonly start?: number;
    }
  | undefined {
  const unordered = /^(\s*)[-+*]\s+(.+)$/u.exec(line);

  if (unordered !== null) {
    return {
      body: unordered[2],
      indent: countIndentCharacters(unordered[1]),
      ordered: false
    };
  }

  const ordered = /^(\s*)(\d+)[.)]\s+(.+)$/u.exec(line);

  if (ordered !== null) {
    return {
      body: ordered[3],
      indent: countIndentCharacters(ordered[1]),
      ordered: true,
      start: Number.parseInt(ordered[2], 10)
    };
  }

  return undefined;
}

function countLeadingIndent(line: string): number {
  return countIndentCharacters(/^(\s*)/u.exec(line)?.[1] ?? "");
}

function countIndentCharacters(value: string): number {
  return [...value].reduce((total, character) => total + (character === "\t" ? 4 : 1), 0);
}

function parseFencedCode(
  lines: readonly string[],
  startIndex: number,
  fence: string,
  rawLanguage: string
): {
  readonly code: string;
  readonly language?: string;
  readonly nextIndex: number;
} {
  const codeLines: string[] = [];
  let index = startIndex + 1;

  while (index < lines.length && !lines[index].trimStart().startsWith(fence)) {
    codeLines.push(lines[index]);
    index += 1;
  }

  const language = rawLanguage.replace(/[^A-Za-z0-9_-]/gu, "").trim() || undefined;

  return {
    code: codeLines.join("\n"),
    ...(language !== undefined ? { language } : {}),
    nextIndex: index < lines.length ? index + 1 : index
  };
}

function renderCodeBlock(language: string | undefined, code: string): string {
  const languageClass =
    language === undefined ? "" : ` class="language-${escapeAttribute(language)}"`;

  const label = language === undefined ? "code" : language;
  return `<div class="copy-surface code-shell"><button aria-label="Copy ${escapeAttribute(
    label
  )}" class="copy-button" data-copy-target="code" type="button">${renderCopyIcon()}<span>Copy</span></button><pre><code${languageClass}>${escapeHtml(
    code.replace(/\n*$/gu, "")
  )}</code></pre></div>`;
}

function isTableStart(lines: readonly string[], index: number): boolean {
  return lines[index]?.trim().startsWith("|") === true && isTableDivider(lines[index + 1]);
}

function isTableDivider(line: string | undefined): boolean {
  return (
    line !== undefined &&
    line.trim().startsWith("|") &&
    parseTableRow(line).every((cell) => /^:?-{3,}:?$/u.test(cell.replace(/\s+/gu, "")))
  );
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

  return {
    html: `<div class="copy-surface table-shell"><button aria-label="Copy table" class="copy-button" data-copy-target="table" type="button">${renderCopyIcon()}<span>Copy</span></button><table><thead><tr>${header
      .map((cell) => `<th>${renderInlineMarkdown(cell)}</th>`)
      .join("")}</tr></thead><tbody>${bodyRows
      .map(
        (row) =>
          `<tr>${row
            .map(
              (cell) =>
                `<td${isNumericTableCell(cell) ? ' class="numeric-cell"' : ""}>${renderInlineMarkdown(
                  cell
                )}</td>`
            )
            .join("")}</tr>`
      )
      .join("")}</tbody></table></div>`,
    nextIndex: index
  };
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isBlockStart(lines: readonly string[], index: number): boolean {
  const line = lines[index];

  return (
    /^(\s*)(`{3,}|~{3,})/u.test(line) ||
    /^(#{1,6})\s+/u.test(line.trim()) ||
    line.trim().startsWith("$$") ||
    /^\s*>\s?/u.test(line) ||
    isThematicBreak(line) ||
    parseListMarker(line) !== undefined ||
    isTableStart(lines, index)
  );
}

function parseDisplayMath(
  lines: readonly string[],
  startIndex: number
): { readonly nextIndex: number; readonly tex: string } {
  const first = lines[startIndex].trim();
  const oneLine = /^\$\$(.*)\$\$$/u.exec(first);

  if (oneLine !== null) {
    return { nextIndex: startIndex + 1, tex: oneLine[1].trim() };
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

function renderMathMarkup(tex: string, display: boolean): string {
  const normalized = tex
    .replace(/\\times\b/gu, "×")
    .replace(/\\cdot\b/gu, "·")
    .replace(/\\leq?\b/gu, "≤")
    .replace(/\\geq?\b/gu, "≥")
    .replace(/\\neq\b/gu, "≠")
    .replace(/\\pm\b/gu, "±")
    .replace(/\\%/gu, "%")
    .replace(/\s+/gu, " ")
    .trim();
  const tokens = normalized.split(/(\s+|[=+×·÷≤≥≠±<>])/u).filter(Boolean);
  const body = tokens
    .map((token) => {
      if (/^\s+$/u.test(token)) {
        return '<mspace width="0.3em"></mspace>';
      }
      if (/^[=+×·÷≤≥≠±<>]$/u.test(token)) {
        return `<mo>${escapeHtml(token)}</mo>`;
      }
      const superscript = /^(.+?)\^\{?([^{}]+)\}?$/u.exec(token);
      if (superscript !== null) {
        return `<msup><mi>${escapeHtml(superscript[1])}</mi><mn>${escapeHtml(
          superscript[2]
        )}</mn></msup>`;
      }
      if (/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/u.test(token)) {
        return `<mn>${escapeHtml(token)}</mn>`;
      }
      return `<mi>${escapeHtml(token)}</mi>`;
    })
    .join("");

  return `<math${display ? ' class="display-math" display="block"' : ""} aria-label="${escapeAttribute(
    normalized
  )}"><mrow>${body}</mrow></math>`;
}

function isNumericTableCell(value: string): boolean {
  return /^\s*(?:[$€£₽₸]\s*)?[+-]?[\d\s.,]+(?:\s*[-–—]\s*(?:[$€£₽₸]\s*)?[\d\s.,]+)?(?:\s*[%$€£₽₸])?\s*$/u.test(
    value
  );
}

function renderCopyIcon(): string {
  return '<svg aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><rect height="13" rx="2" width="13" x="8" y="8"></rect><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"></path></svg>';
}

function isThematicBreak(line: string): boolean {
  return /^(?:\s*)(?:(?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/u.test(line);
}

function parseMarkdownLink(
  input: string,
  startIndex: number,
  image: boolean
):
  | {
      readonly image: boolean;
      readonly label: string;
      readonly nextIndex: number;
      readonly url: string;
    }
  | undefined {
  const labelStart = startIndex + (image ? 2 : 1);
  const labelEnd = findClosingBracket(input, labelStart);

  if (labelEnd === -1 || input[labelEnd + 1] !== "(") {
    return undefined;
  }

  let cursor = labelEnd + 2;
  let depth = 1;

  while (cursor < input.length) {
    if (input[cursor] === "\\") {
      cursor += 2;
      continue;
    }

    if (input[cursor] === "(") {
      depth += 1;
    } else if (input[cursor] === ")") {
      depth -= 1;

      if (depth === 0) {
        return {
          image,
          label: input.slice(labelStart, labelEnd),
          nextIndex: cursor + 1,
          url: input
            .slice(labelEnd + 2, cursor)
            .trim()
            .replace(/\\([()])/gu, "$1")
        };
      }
    }

    cursor += 1;
  }

  return undefined;
}

function findClosingBracket(input: string, startIndex: number): number {
  let depth = 1;

  for (let index = startIndex; index < input.length; index += 1) {
    if (input[index] === "\\") {
      index += 1;
      continue;
    }

    if (input[index] === "[") {
      depth += 1;
    } else if (input[index] === "]") {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function renderPlainTextWithAutolinks(input: string): string {
  const urlPattern = /https?:\/\/[^\s<]+/gu;
  let output = "";
  let lastIndex = 0;
  let match = urlPattern.exec(input);

  while (match !== null) {
    const { trailing, url } = trimUrlPunctuation(match[0]);
    output += escapeHtml(input.slice(lastIndex, match.index));
    const href = safeHref(url);
    output +=
      href === undefined
        ? escapeHtml(url)
        : `<a href="${href}" rel="noopener noreferrer" target="_blank">${escapeHtml(url)}</a>`;
    output += escapeHtml(trailing);
    lastIndex = match.index + match[0].length;
    match = urlPattern.exec(input);
  }

  output += escapeHtml(input.slice(lastIndex));
  return output;
}

function trimUrlPunctuation(input: string): { readonly trailing: string; readonly url: string } {
  let url = input;
  let trailing = "";

  while (/[.,;:!?]$/u.test(url)) {
    trailing = `${url.slice(-1)}${trailing}`;
    url = url.slice(0, -1);
  }

  return { trailing, url };
}

function canOpenEmphasis(input: string, index: number): boolean {
  const next = input[index + 1];
  const previous = input[index - 1];

  return (
    next !== undefined &&
    !/\s/u.test(next) &&
    !(input[index] === "_" && previous !== undefined && /\p{L}|\p{N}/u.test(previous))
  );
}

function findClosingEmphasis(input: string, marker: string, startIndex: number): number {
  let index = findUnescaped(input, marker, startIndex);

  while (index !== -1) {
    const previous = input[index - 1];
    const next = input[index + 1];

    if (
      previous !== undefined &&
      !/\s/u.test(previous) &&
      !(marker === "_" && next !== undefined && /\p{L}|\p{N}/u.test(next))
    ) {
      return index;
    }

    index = findUnescaped(input, marker, index + 1);
  }

  return -1;
}

function findUnescaped(input: string, token: string, startIndex: number): number {
  let index = input.indexOf(token, startIndex);

  while (index !== -1) {
    let slashCount = 0;

    for (let cursor = index - 1; cursor >= 0 && input[cursor] === "\\"; cursor -= 1) {
      slashCount += 1;
    }

    if (slashCount % 2 === 0) {
      return index;
    }

    index = input.indexOf(token, index + token.length);
  }

  return -1;
}

function findNextInlineSpecial(input: string, startIndex: number): number {
  for (let index = startIndex; index < input.length; index += 1) {
    if (["\\", "\n", "`", "[", "!", "*", "_", "~"].includes(input[index])) {
      return index;
    }
  }

  return -1;
}

function countRun(input: string, startIndex: number, character: string): number {
  let length = 0;

  while (input[startIndex + length] === character) {
    length += 1;
  }

  return length;
}

function formatDecimal(value: number): string {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1
  }).format(value);
}
