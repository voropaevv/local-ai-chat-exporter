import type { ExportOptions } from "../core/export-options";
import type { ConversationExport } from "../core/schema";

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
