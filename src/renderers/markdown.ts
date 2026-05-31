import type { ConversationExport } from "../core/schema";
import { createRenderedFile, type RenderedFile, type RendererOptions } from "./types";
import { normalizeMarkdownProfile, renderProfileMarkdown } from "./markdown-profiles";

export function renderMarkdown(
  conversation: ConversationExport,
  options: RendererOptions = {}
): RenderedFile {
  const profile = normalizeMarkdownProfile(options.markdownProfile);

  return createRenderedFile(
    conversation,
    "md",
    "text/markdown;charset=utf-8",
    renderProfileMarkdown(conversation, profile),
    options
  );
}
