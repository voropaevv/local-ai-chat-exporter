import type { ExportOptions } from "../core/export-options";
import type { ConversationExport, ExportedMessage } from "../core/schema";
import { getMessageAttachments } from "../renderers/presentation";

export interface PreviewSelectionState {
  readonly rangeEndIndex: number;
  readonly rangeStartIndex: number;
  readonly scope: ExportOptions["scope"];
}

export function applyPreviewMessageSelection(
  conversation: ConversationExport,
  selectedMessageIds: readonly string[]
): ConversationExport {
  const selectedIds = new Set(selectedMessageIds);

  return {
    ...conversation,
    messages: conversation.messages.map((message) => {
      const metadata = { ...message.metadata };

      delete metadata.selected;

      return {
        ...message,
        metadata: selectedIds.has(message.id) ? { ...metadata, selected: true } : metadata
      };
    })
  };
}

export function buildPreviewSelectionOptions(
  selection: PreviewSelectionState
): Pick<ExportOptions, "range" | "scope"> {
  return {
    ...(selection.scope === "range"
      ? {
          range: {
            endIndex: Math.max(0, selection.rangeEndIndex - 1),
            startIndex: Math.max(0, selection.rangeStartIndex - 1)
          }
        }
      : {}),
    scope: selection.scope
  };
}

export function togglePreviewMessageSelection(
  selectedMessageIds: readonly string[],
  messageId: string
): readonly string[] {
  return selectedMessageIds.includes(messageId)
    ? selectedMessageIds.filter((candidate) => candidate !== messageId)
    : [...selectedMessageIds, messageId];
}

export function createPreviewMessageSummary(message: ExportedMessage): string {
  const attachments = getMessageAttachments(message);
  const attachmentLabels = new Set(
    attachments
      .flatMap((attachment) => [attachment.name, attachment.description, attachment.mimeType])
      .filter((value): value is string => value !== undefined)
      .map(normalizeSummaryText)
      .filter((value) => value.length > 0)
  );
  const bodySource =
    message.markdown !== undefined && message.markdown.trim().length > 0
      ? message.markdown
      : message.text;
  const body = bodySource
    .replace(/```[\s\S]*?```/gu, " Code ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/\[([^\]]+)\]\((?:[^()]|\([^)]*\))*\)/gu, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|>|[-+*]|\d+[.)])\s*/gmu, "")
    .replace(/[*_~`|]/gu, "")
    .split(/\n+/u)
    .map(normalizeSummaryText)
    .filter((line) => line.length > 0 && !attachmentLabels.has(line))
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
  const fallback =
    attachments.length === 0
      ? "Empty message"
      : attachments.length === 1
        ? `Attachment: ${attachments[0].name}`
        : `${attachments.length} attachments: ${attachments
            .slice(0, 2)
            .map((attachment) => attachment.name)
            .join(", ")}`;
  const summary = body || fallback;

  return summary.length > 96 ? `${summary.slice(0, 93).trimEnd()}…` : summary;
}

function normalizeSummaryText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}
