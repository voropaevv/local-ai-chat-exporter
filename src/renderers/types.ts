import type { ConversationExport, ExportFormat } from "../core/schema";
import type { MarkdownProfile } from "./markdown-profiles";
import type { PdfSettingsInput } from "./pdf-settings";
import { renderFilenameTemplate } from "../utils/filename-template";
export { MARKDOWN_PROFILES, type MarkdownProfile } from "./markdown-profiles";

export type LocalRendererFormat = Extract<
  ExportFormat,
  "md" | "txt" | "json" | "csv" | "html" | "pdf" | "docx" | "zip" | "png"
>;

export type RenderedBytes = string | Uint8Array;

export interface RendererOptions {
  readonly filenameTemplate?: string;
  readonly includeMetadata?: boolean;
  readonly markdownProfile?: MarkdownProfile;
  readonly pdfSettings?: PdfSettingsInput;
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
