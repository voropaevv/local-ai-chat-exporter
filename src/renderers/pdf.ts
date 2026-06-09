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
    "<p>This export was generated locally by extension.</p>\n        <p>Print-ready HTML export. Use your browser print dialog to save this page as PDF.</p>"
  );

  return {
    format: "pdf",
    filename: ensureHtmlExtension(
      renderFilenameTemplate(options.filenameTemplate ?? "", {
        conversationId: conversation.conversationId,
        exportedAt: conversation.exportedAt,
        format: "print-ready-html",
        platform: conversation.platform,
        title: conversation.title
      })
    ),
    mimeType: "text/html;charset=utf-8",
    encoding: "utf-8",
    bytes
  };
}

function ensureHtmlExtension(filename: string): string {
  return filename.endsWith(".html") ? filename : `${filename}.html`;
}
