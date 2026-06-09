import type { ChatPlatform, ExportFormat } from "../core/schema";

const INVALID_FILENAME_CHARS = new Set(["<", ">", ":", '"', "/", "\\", "|", "?", "*"]);
const DEFAULT_TEMPLATE = "{datetime}_{platform}_{title}.{format}";
const UNTITLED_TITLE = "untitled-conversation";

export interface FilenameTemplateContext {
  readonly conversationId?: string;
  readonly exportedAt: string;
  readonly format: ExportFormat | string;
  readonly platform: ChatPlatform | string;
  readonly title?: string;
}

export function renderFilenameTemplate(template: string, context: FilenameTemplateContext): string {
  const date = parseExportDate(context.exportedAt);
  const variables: Record<string, string> = {
    conversationId: sanitizeFilenamePart(context.conversationId ?? ""),
    date: formatDate(date),
    datetime: formatDateTime(date),
    format: sanitizeFilenamePart(context.format),
    platform: sanitizeFilenamePart(context.platform),
    time: formatTime(date),
    title: sanitizeFilenamePart(context.title) || UNTITLED_TITLE
  };

  const rendered = (template.trim() || DEFAULT_TEMPLATE).replace(
    /\{([A-Za-z][A-Za-z0-9]*)\}/g,
    (match, variableName: string) => variables[variableName] ?? match
  );

  return sanitizeFilename(rendered);
}

export function sanitizeFilenamePart(value: string | undefined): string {
  return (value ?? "")
    .trim()
    .split("")
    .map(replaceInvalidFilenameChar)
    .join("")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
}

export function sanitizeFilename(value: string): string {
  const sanitized = value
    .trim()
    .split("")
    .map(replaceInvalidFilenameChar)
    .join("")
    .replace(/\.\.+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+/g, "")
    .replace(/[.-]+$/g, "");

  return sanitized || `${UNTITLED_TITLE}.md`;
}

function parseExportDate(exportedAt: string): Date {
  const date = new Date(exportedAt);

  if (Number.isNaN(date.getTime())) {
    return new Date(0);
  }

  return date;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatTime(date: Date): string {
  return date.toISOString().slice(11, 19).replaceAll(":", "-");
}

function formatDateTime(date: Date): string {
  return `${formatDate(date)}T${formatTime(date)}Z`;
}

function replaceInvalidFilenameChar(character: string): string {
  return character.charCodeAt(0) < 32 || INVALID_FILENAME_CHARS.has(character) ? "-" : character;
}
