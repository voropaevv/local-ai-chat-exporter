import type { ConversationExport } from "../core/schema";
import { renderFilenameTemplate } from "../utils/filename-template";
import { renderHtml } from "./html";
import type { RenderedFile, RendererOptions } from "./types";

export function renderPdf(
  conversation: ConversationExport,
  options: RendererOptions = {}
): RenderedFile {
  const html = renderHtml(conversation, options).bytes;
  const bytes = html.replace(
    "<p>This export was generated locally by extension.</p>",
    "<p>This export was generated locally by extension.</p>\n        <p>Use your browser print dialog to save this page as PDF.</p>"
  );

  return {
    format: "pdf",
    filename: `${renderFilenameTemplate(options.filenameTemplate ?? "", {
      conversationId: conversation.conversationId,
      exportedAt: conversation.exportedAt,
      format: "pdf",
      platform: conversation.platform,
      title: conversation.title
    })}.html`,
    mimeType: "text/html;charset=utf-8",
    encoding: "utf-8",
    bytes
  };
}
