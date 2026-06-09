import type { ExportFormat } from "../core/schema";
import { sanitizeFilename, sanitizeFilenamePart } from "../utils/filename-template";

export const DEFAULT_FILENAME_TEMPLATE = "{datetime}_{platform}_{title}.{format}";

export type FilenameTemplateToken =
  | "date"
  | "time"
  | "datetime"
  | "platform"
  | "title"
  | "conversationId"
  | "format";

export interface FilenameTemplateTokenDefinition {
  readonly label: string;
  readonly token: FilenameTemplateToken;
}

export type FilenameTemplateSegment =
  | {
      readonly kind: "text";
      readonly value: string;
    }
  | {
      readonly kind: "token";
      readonly token: FilenameTemplateToken;
    };

export interface FilenamePreviewContext {
  readonly conversationId?: string;
  readonly date?: string;
  readonly datetime: string;
  readonly format: ExportFormat | string;
  readonly platform: string;
  readonly time?: string;
  readonly title: string;
}

export const FILENAME_TEMPLATE_TOKENS: readonly FilenameTemplateTokenDefinition[] = [
  { label: "Date", token: "date" },
  { label: "Time", token: "time" },
  { label: "Date/time", token: "datetime" },
  { label: "Platform", token: "platform" },
  { label: "Title", token: "title" },
  { label: "Conversation ID", token: "conversationId" },
  { label: "Format", token: "format" }
];

const TOKEN_PATTERN = /\{([A-Za-z][A-Za-z0-9]*)\}/g;
const TOKEN_SET = new Set<FilenameTemplateToken>(
  FILENAME_TEMPLATE_TOKENS.map((definition) => definition.token)
);

export function parseFilenameTemplate(template: string): readonly FilenameTemplateSegment[] {
  const segments: FilenameTemplateSegment[] = [];
  let cursor = 0;

  for (const match of template.matchAll(TOKEN_PATTERN)) {
    const startIndex = match.index ?? 0;
    const rawToken = match[1];

    if (startIndex > cursor) {
      segments.push({ kind: "text", value: template.slice(cursor, startIndex) });
    }

    if (isFilenameTemplateToken(rawToken)) {
      segments.push({ kind: "token", token: rawToken });
    } else {
      segments.push({ kind: "text", value: match[0] });
    }

    cursor = startIndex + match[0].length;
  }

  if (cursor < template.length) {
    segments.push({ kind: "text", value: template.slice(cursor) });
  }

  return segments.length > 0 ? segments : parseFilenameTemplate(DEFAULT_FILENAME_TEMPLATE);
}

export function createFilenameTemplate(segments: readonly FilenameTemplateSegment[]): string {
  const template = segments
    .map((segment) => (segment.kind === "token" ? `{${segment.token}}` : segment.value))
    .join("");

  return template.trim().length > 0 ? template : DEFAULT_FILENAME_TEMPLATE;
}

export function moveFilenameTemplateSegment(
  segments: readonly FilenameTemplateSegment[],
  index: number,
  offset: number
): readonly FilenameTemplateSegment[] {
  if (!Number.isInteger(index) || !Number.isInteger(offset) || offset === 0) {
    return segments;
  }

  if (index < 0 || index >= segments.length) {
    return segments;
  }

  const nextIndex = clamp(index + offset, 0, segments.length - 1);
  const copy = [...segments];
  const [segment] = copy.splice(index, 1);
  copy.splice(nextIndex, 0, segment);

  return copy;
}

export function removeFilenameTemplateSegment(
  segments: readonly FilenameTemplateSegment[],
  index: number
): readonly FilenameTemplateSegment[] {
  if (index < 0 || index >= segments.length) {
    return segments;
  }

  return segments.filter((_segment, segmentIndex) => segmentIndex !== index);
}

export function createFilenamePreview(template: string, context: FilenamePreviewContext): string {
  const date = context.date ?? context.datetime.slice(0, 10);
  const time = context.time ?? context.datetime.slice(11).replace(/Z$/u, "");
  const values: Readonly<Record<FilenameTemplateToken, string>> = {
    conversationId: sanitizeFilenamePart(context.conversationId ?? "conversation"),
    date: sanitizeFilenamePart(date),
    datetime: sanitizeFilenamePart(context.datetime),
    format: sanitizeFilenamePart(context.format),
    platform: sanitizeFilenamePart(context.platform),
    time: sanitizeFilenamePart(time),
    title: sanitizeFilenamePart(context.title)
  };

  return sanitizeFilename(
    parseFilenameTemplate(template)
      .map((segment) => (segment.kind === "token" ? values[segment.token] : segment.value))
      .join("")
  );
}

export function getFilenameTemplateTokenLabel(token: FilenameTemplateToken): string {
  return FILENAME_TEMPLATE_TOKENS.find((definition) => definition.token === token)?.label ?? token;
}

function isFilenameTemplateToken(value: string): value is FilenameTemplateToken {
  return TOKEN_SET.has(value as FilenameTemplateToken);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
