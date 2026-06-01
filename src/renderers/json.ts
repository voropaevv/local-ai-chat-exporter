import type { ConversationExport } from "../core/schema";
import { sanitizeConversationImagesForOutput } from "../core/image-safety";
import { createRenderedFile, type RenderedFile, type RendererOptions } from "./types";

export function renderJson(
  conversation: ConversationExport,
  options: RendererOptions = {}
): RenderedFile {
  const safeConversation = sanitizeConversationImagesForOutput(conversation);

  return createRenderedFile(
    safeConversation,
    "json",
    "application/json;charset=utf-8",
    `${JSON.stringify(safeConversation, null, 2)}\n`,
    options
  );
}
