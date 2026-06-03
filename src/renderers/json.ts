import type { ConversationExport, ExportedMessage } from "../core/schema";
import { sanitizeConversationImagesForOutput } from "../core/image-safety";
import { createRenderedFile, type RenderedFile, type RendererOptions } from "./types";

export function renderJson(
  conversation: ConversationExport,
  options: RendererOptions = {}
): RenderedFile {
  const safeConversation = omitRawHtml(sanitizeConversationImagesForOutput(conversation));

  return createRenderedFile(
    safeConversation,
    "json",
    "application/json;charset=utf-8",
    `${JSON.stringify(safeConversation, null, 2)}\n`,
    options
  );
}

function omitRawHtml(conversation: ConversationExport): ConversationExport {
  return {
    ...conversation,
    messages: conversation.messages.map(omitMessageRawHtml)
  };
}

function omitMessageRawHtml(message: ExportedMessage): ExportedMessage {
  return {
    id: message.id,
    index: message.index,
    role: message.role,
    authorLabel: message.authorLabel,
    text: message.text,
    ...(message.markdown !== undefined ? { markdown: message.markdown } : {}),
    codeBlocks: message.codeBlocks,
    images: message.images,
    ...(message.createdAt !== undefined ? { createdAt: message.createdAt } : {}),
    ...(message.model !== undefined ? { model: message.model } : {}),
    metadata: message.metadata
  };
}
