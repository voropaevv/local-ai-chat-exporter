import {
  renderConversationFiles,
  serializeExportError,
  type SerializedExportError
} from "../../src/core/export-options";
import {
  CONTENT_CANCEL_SCAN_MESSAGE,
  CONTENT_EXPORT_MESSAGE,
  CONTENT_SCAN_MESSAGE,
  type ContentCancelScanRequest,
  type ContentExportRequest,
  type ContentExportSuccess,
  type ContentScanRequest,
  type PreviewMessage,
  type ScanSummary
} from "../../src/core/messages";
import type { ConversationExport, ExportedMessage } from "../../src/core/schema";
import { scanCurrentConversationExport } from "../../src/content/scan";
import { copyRenderedFileToClipboard } from "../../src/utils/clipboard";
import { downloadRenderedFiles } from "../../src/utils/download";

const LISTENER_STATE_KEY = "__localAiChatExporterContentListenerRegistered";
const MAX_PREVIEW_MESSAGES = 6;

export const contentScriptReady = true;

const contentGlobal = globalThis as typeof globalThis & {
  [LISTENER_STATE_KEY]?: boolean;
};

let activeScanController: AbortController | undefined;

if (contentGlobal[LISTENER_STATE_KEY] !== true) {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isContentRequest(message)) {
      return false;
    }

    handleContentRequest(message)
      .then((value) => sendResponse({ ok: true, value }))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: serializeExportError(error)
        })
      );

    return true;
  });

  contentGlobal[LISTENER_STATE_KEY] = true;
}

async function handleContentRequest(
  request: ContentScanRequest | ContentCancelScanRequest | ContentExportRequest
): Promise<ScanSummary | ContentExportSuccess | { readonly cancelled: true }> {
  if (request.type === CONTENT_SCAN_MESSAGE) {
    return handleContentScanRequest();
  }

  if (request.type === CONTENT_CANCEL_SCAN_MESSAGE) {
    activeScanController?.abort();
    return { cancelled: true };
  }

  return handleContentExportRequest(request);
}

async function handleContentScanRequest(): Promise<ScanSummary> {
  activeScanController?.abort();
  activeScanController = new AbortController();

  try {
    const conversation = await scanCurrentConversationExport({
      signal: activeScanController.signal
    });

    return summarizeConversation(conversation);
  } finally {
    activeScanController = undefined;
  }
}

async function handleContentExportRequest(
  request: ContentExportRequest
): Promise<ContentExportSuccess> {
  const conversation = await scanCurrentConversationExport();
  const files = renderConversationFiles(conversation, request.options);
  let clipboardError: SerializedExportError | undefined;

  if (request.copyToClipboard ?? true) {
    try {
      await copyRenderedFileToClipboard(files);
    } catch (error) {
      clipboardError = serializeExportError(error);
    }
  }

  const downloaded =
    request.delivery === "anchor" && request.download !== false
      ? (await downloadRenderedFiles(files)).downloaded
      : [];

  return {
    ...(clipboardError !== undefined ? { clipboardError } : {}),
    downloaded,
    ...(request.delivery === "return_files" ? { files } : {}),
    messageCount: conversation.messageCount,
    warnings: [
      ...conversation.completeness.warnings,
      ...conversation.completeness.platformWarnings,
      ...(clipboardError !== undefined ? [clipboardError.message] : [])
    ]
  };
}

function summarizeConversation(conversation: ConversationExport): ScanSummary {
  return {
    completeness: conversation.completeness,
    messageCount: conversation.messageCount,
    platformLabel: conversation.platformLabel,
    previewMessages: conversation.messages.slice(0, MAX_PREVIEW_MESSAGES).map(toPreviewMessage),
    sourceUrl: conversation.sourceUrl,
    ...(conversation.title !== undefined ? { title: conversation.title } : {})
  };
}

function toPreviewMessage(message: ExportedMessage): PreviewMessage {
  return {
    authorLabel: message.authorLabel,
    index: message.index,
    role: message.role,
    text: message.text
  };
}

function isContentRequest(
  message: unknown
): message is ContentScanRequest | ContentCancelScanRequest | ContentExportRequest {
  if (!isRecord(message)) {
    return false;
  }

  if (message.type === CONTENT_SCAN_MESSAGE || message.type === CONTENT_CANCEL_SCAN_MESSAGE) {
    return true;
  }

  return (
    message.type === CONTENT_EXPORT_MESSAGE &&
    (message.delivery === "anchor" || message.delivery === "return_files") &&
    isRecord(message.options)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
