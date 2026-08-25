import {
  normalizeExportOptions,
  prepareConversationForExport,
  type ExportOptions
} from "../core/export-options";
import type { ConversationExport } from "../core/schema";
import { renderHtml, renderMarkdown, type RenderedFile } from "../renderers";
import type { HtmlTheme } from "../renderers/presentation";
import { formatCount } from "./pluralize";

export const PREVIEW_MISSING_CACHE_MESSAGE =
  "This local snapshot is no longer available. Return to the source chat and preview it again.";

export type PreviewRenderState =
  | {
      readonly conversation: ConversationExport;
      readonly html: RenderedFile<string>;
      readonly markdown: RenderedFile<string>;
      readonly status: "ready";
      readonly statusMessage: string;
    }
  | {
      readonly status: "empty" | "missing";
      readonly statusMessage: string;
    };

export function createPreviewRenderState(
  conversation: ConversationExport | undefined,
  options: Partial<ExportOptions> = {},
  previewOptions: { readonly theme?: HtmlTheme } = {}
): PreviewRenderState {
  if (conversation === undefined) {
    return {
      status: "missing",
      statusMessage: PREVIEW_MISSING_CACHE_MESSAGE
    };
  }

  const normalizedOptions = normalizeExportOptions(options);
  const preparedConversation = prepareConversationForExport(conversation, normalizedOptions);

  if (preparedConversation.messages.length === 0) {
    return {
      status: "empty",
      statusMessage: "No messages in this view."
    };
  }

  const rendererOptions = {
    filenameTemplate: normalizedOptions.filenameTemplate,
    includeMetadata: normalizedOptions.includeMetadata,
    markdownProfile: normalizedOptions.markdownProfile,
    pdfSettings: normalizedOptions.pdfSettings
  };

  return {
    conversation: preparedConversation,
    html: renderHtml(preparedConversation, {
      ...rendererOptions,
      interactive: true,
      theme: previewOptions.theme ?? "system"
    }),
    markdown: renderMarkdown(preparedConversation, rendererOptions),
    status: "ready",
    statusMessage: formatCount(preparedConversation.messageCount, "message")
  };
}
