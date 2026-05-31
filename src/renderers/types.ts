import type { ConversationExport, ExportFormat } from "../core/schema";
import { renderFilenameTemplate } from "../utils/filename-template";

export const MARKDOWN_PROFILES = ["default", "obsidian", "github", "gitbook"] as const;

export type MarkdownProfile = (typeof MARKDOWN_PROFILES)[number];

export type LocalRendererFormat = Extract<
  ExportFormat,
  "md" | "txt" | "json" | "csv" | "html" | "pdf" | "docx" | "zip" | "png"
>;

export type RenderedBytes = string | Uint8Array;

export interface RendererOptions {
  readonly filenameTemplate?: string;
  readonly markdownProfile?: MarkdownProfile;
  readonly zipFormats?: readonly LocalRendererFormat[];
}

export interface RenderedFile<Bytes extends RenderedBytes = string> {
  readonly format: LocalRendererFormat;
  readonly filename: string;
  readonly mimeType: string;
  readonly encoding: "utf-8" | "binary";
  readonly bytes: Bytes;
}

export type ConversationRenderer = (
  conversation: ConversationExport,
  options?: RendererOptions
) => RenderedFile<RenderedBytes>;

export function createRenderedFile<Bytes extends RenderedBytes>(
  conversation: ConversationExport,
  format: LocalRendererFormat,
  mimeType: string,
  bytes: Bytes,
  options: RendererOptions = {}
): RenderedFile<Bytes> {
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
    encoding: bytes instanceof Uint8Array ? "binary" : "utf-8",
    bytes
  };
}
