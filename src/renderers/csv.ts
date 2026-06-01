import type { ConversationExport, ExportedMessage } from "../core/schema";
import { sanitizeConversationImagesForOutput } from "../core/image-safety";
import { createRenderedFile, type RenderedFile, type RendererOptions } from "./types";

const CSV_COLUMNS = [
  "index",
  "role",
  "authorLabel",
  "text",
  "model",
  "createdAt",
  "messageId"
] as const;

export function renderCsv(
  conversation: ConversationExport,
  options: RendererOptions = {}
): RenderedFile {
  const safeConversation = sanitizeConversationImagesForOutput(conversation);
  const rows = [
    CSV_COLUMNS.join(","),
    ...safeConversation.messages.map((message) => renderMessageRow(message))
  ];

  return createRenderedFile(
    safeConversation,
    "csv",
    "text/csv;charset=utf-8",
    `${rows.join("\n")}\n`,
    options
  );
}

function renderMessageRow(message: ExportedMessage): string {
  return [
    String(message.index + 1),
    message.role,
    message.authorLabel,
    message.text,
    message.model ?? "",
    message.createdAt ?? "",
    message.id
  ]
    .map(csvEscape)
    .join(",");
}

function csvEscape(value: string): string {
  const normalized = value.replace(/\r\n?/g, "\n");

  if (!/[",\n]/.test(normalized)) {
    return normalized;
  }

  return `"${normalized.replace(/"/g, '""')}"`;
}
