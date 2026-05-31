import type { ConversationExport } from "../core/schema";
import { renderFilenameTemplate } from "../utils/filename-template";
import type { RenderedFile, RendererOptions } from "./types";

const PNG_DISABLED_REASON =
  "PNG snapshot export is not available in this local build. Long chat screenshots need a browser DOM capture path, so this format is disabled with this explanation instead of using remote rendering.";

export interface PngAvailability {
  readonly available: false;
  readonly reason: string;
}

export function getPngAvailability(conversation: ConversationExport): PngAvailability {
  void conversation;

  return {
    available: false,
    reason: PNG_DISABLED_REASON
  };
}

export function renderPng(
  conversation: ConversationExport,
  options: RendererOptions = {}
): RenderedFile {
  return {
    format: "png",
    filename: `${renderFilenameTemplate(options.filenameTemplate ?? "", {
      conversationId: conversation.conversationId,
      exportedAt: conversation.exportedAt,
      format: "png",
      platform: conversation.platform,
      title: conversation.title
    })}-unavailable.txt`,
    mimeType: "text/plain;charset=utf-8",
    encoding: "utf-8",
    bytes: `${PNG_DISABLED_REASON}\n`
  };
}
