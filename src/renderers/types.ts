import type { ConversationExport, ExportFormat } from "../core/schema";
import { renderFilenameTemplate } from "../utils/filename-template";

export const MARKDOWN_PROFILES = ["default", "obsidian", "github", "gitbook"] as const;

export type MarkdownProfile = (typeof MARKDOWN_PROFILES)[number];

export type LocalRendererFormat = Extract<ExportFormat, "md" | "txt" | "json" | "csv" | "html">;

export interface RendererOptions {
  readonly filenameTemplate?: string;
  readonly markdownProfile?: MarkdownProfile;
}

export interface RenderedFile {
  readonly format: LocalRendererFormat;
  readonly filename: string;
  readonly mimeType: string;
  readonly encoding: "utf-8";
  readonly bytes: string;
}

export type ConversationRenderer = (
  conversation: ConversationExport,
  options?: RendererOptions
) => RenderedFile;

export function createRenderedFile(
  conversation: ConversationExport,
  format: LocalRendererFormat,
  mimeType: string,
  bytes: string,
  options: RendererOptions = {}
): RenderedFile {
  return {
    format,
    filename: renderFilenameTemplate(options.filenameTemplate ?? "", {
      conversationId: conversation.conversationId,
      exportedAt: conversation.exportedAt,
      format,
      platform: conversation.platform,
      title: conversation.title
    }),
    mimeType,
    encoding: "utf-8",
    bytes
  };
}
