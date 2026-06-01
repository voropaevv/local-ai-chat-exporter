import type { ConversationExport } from "../core/schema";
import {
  renderHtml,
  renderMarkdown,
  renderPdf,
  type RenderedFile
} from "../renderers";

export const PREVIEW_MISSING_CACHE_MESSAGE =
  "Scanned snapshot is no longer available. Return to the ChatGPT tab and scan again.";

export type PreviewRenderState =
  | {
      readonly conversation: ConversationExport;
      readonly html: RenderedFile;
      readonly markdown: RenderedFile;
      readonly pdf: RenderedFile;
      readonly status: "ready";
      readonly statusMessage: string;
    }
  | {
      readonly status: "missing";
      readonly statusMessage: string;
    };

export function createPreviewRenderState(
  conversation: ConversationExport | undefined
): PreviewRenderState {
  if (conversation === undefined) {
    return {
      status: "missing",
      statusMessage: PREVIEW_MISSING_CACHE_MESSAGE
    };
  }

  return {
    conversation,
    html: renderHtml(conversation),
    markdown: renderMarkdown(conversation),
    pdf: renderPdf(conversation),
    status: "ready",
    statusMessage: `Previewing ${conversation.messageCount} scanned message(s).`
  };
}
