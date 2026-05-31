import type { ConversationExport } from "../core/schema";
import { createRenderedFile, type RenderedFile, type RendererOptions } from "./types";

export function renderJson(
  conversation: ConversationExport,
  options: RendererOptions = {}
): RenderedFile {
  return createRenderedFile(
    conversation,
    "json",
    "application/json;charset=utf-8",
    `${JSON.stringify(conversation, null, 2)}\n`,
    options
  );
}
