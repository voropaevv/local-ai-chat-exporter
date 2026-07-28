import type { ConversationExport, ExportedCodeBlock, ExportedMessage } from "../core/schema";
import { sanitizeConversationImagesForOutput } from "../core/image-safety";
import { renderAdvancedTextLines } from "./advanced-content";
import { createRenderedFile, type RenderedFile, type RendererOptions } from "./types";
import {
  formatAttachmentLabel,
  formatDisplayDateTime,
  formatFileSize,
  shouldShowCaptureStatus
} from "./presentation";

const MESSAGE_SEPARATOR = "=".repeat(80);

export function renderTxt(
  conversation: ConversationExport,
  options: RendererOptions = {}
): RenderedFile {
  const safeConversation = sanitizeConversationImagesForOutput(conversation);
  const warnings = collectWarnings(safeConversation);
  const lines: string[] = [
    `Title: ${normalizeSingleLine(safeConversation.title ?? "Untitled conversation")}`,
    `Platform: ${safeConversation.platformLabel}`,
    `Source: ${safeConversation.sourceUrl}`,
    `Exported: ${formatDisplayDateTime(safeConversation.exportedAt)}`,
    `Messages: ${safeConversation.messageCount}`
  ];

  if (shouldShowCaptureStatus(safeConversation)) {
    lines.push(`Capture status: ${safeConversation.completeness.status.replace(/_/gu, " ")}`);
  }

  if (warnings.length > 0) {
    lines.push("Warnings:", ...warnings.map((warning) => `- ${warning}`));
  }

  for (const message of safeConversation.messages) {
    lines.push("", MESSAGE_SEPARATOR, ...renderMessage(message));
  }

  return createRenderedFile(
    safeConversation,
    "txt",
    "text/plain;charset=utf-8",
    `${lines.join("\n").trimEnd()}\n`,
    options
  );
}

function renderMessage(message: ExportedMessage): readonly string[] {
  const lines = [`${message.index + 1}. ${normalizeSingleLine(message.authorLabel)}`];

  if (message.model !== undefined) {
    lines.push(`Model: ${message.model}`);
  }

  if (message.createdAt !== undefined) {
    lines.push(`Created: ${formatDisplayDateTime(message.createdAt)}`);
  }

  if ((message.attachments?.length ?? 0) > 0) {
    lines.push(
      "",
      "Attachments:",
      ...message.attachments!.map((attachment) => {
        const details = [
          formatAttachmentLabel(attachment),
          formatFileSize(attachment.sizeBytes),
          attachment.url,
          attachment.warning
        ].filter((value): value is string => value !== undefined && value.length > 0);

        return `- ${attachment.name}${details.length > 0 ? ` — ${details.join(" · ")}` : ""}`;
      })
    );
  }

  lines.push("", normalizeText(message.text));

  for (const codeBlock of message.codeBlocks) {
    lines.push("", renderCodeBlock(codeBlock));
  }

  lines.push(...renderAdvancedTextLines(message));

  return lines;
}

function renderCodeBlock(codeBlock: ExportedCodeBlock): string {
  const label =
    codeBlock.language === undefined ? "Code block:" : `Code block (${codeBlock.language}):`;
  const code = codeBlock.code.replace(/\r\n?/g, "\n").replace(/\n*$/g, "");

  return `${label}\n${code}`;
}

function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

function normalizeSingleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function collectWarnings(conversation: ConversationExport): readonly string[] {
  return [...conversation.completeness.warnings, ...conversation.completeness.platformWarnings];
}
