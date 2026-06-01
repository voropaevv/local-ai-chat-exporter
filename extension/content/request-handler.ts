import {
  ExportPipelineError,
  serializeExportError,
  type ExportOptions,
  type SerializedExportError
} from "../../src/core/export-options";
import {
  CONTENT_CANCEL_SCAN_MESSAGE,
  CONTENT_CLEAR_SELECTION_MESSAGE,
  CONTENT_EXPORT_MESSAGE,
  CONTENT_SCAN_MESSAGE,
  CONTENT_START_SELECTION_MESSAGE,
  type ContentCancelScanRequest,
  type ContentClearSelectionRequest,
  type ContentExportRequest,
  type ContentExportSuccess,
  type ContentScanRequest,
  type ContentStartSelectionRequest,
  type PreviewMessage,
  type ScanSummary
} from "../../src/core/messages";
import type { ConversationExport, ExportedMessage } from "../../src/core/schema";
import {
  applyMessageSelection,
  filterMessagesByScope,
  type MessageSelection
} from "../../src/core/selection";
import type { RenderedBytes, RenderedFile } from "../../src/renderers";
import type { DownloadResult } from "../../src/utils/download";
import type { SelectionOverlayController } from "./selection-overlay";

const MAX_PREVIEW_MESSAGES = 6;

export type ContentRequest =
  | ContentScanRequest
  | ContentCancelScanRequest
  | ContentExportRequest
  | ContentStartSelectionRequest
  | ContentClearSelectionRequest;

export type ContentRequestResult =
  | ScanSummary
  | ContentExportSuccess
  | { readonly cancelled: boolean };

export interface ContentRequestHandlerDependencies {
  readonly copyRenderedFileToClipboard: (
    files: readonly RenderedFile<RenderedBytes>[]
  ) => Promise<unknown>;
  readonly createSelectionOverlay: () => SelectionOverlayController;
  readonly downloadRenderedFiles: (
    files: readonly RenderedFile<RenderedBytes>[]
  ) => Promise<DownloadResult>;
  readonly getCurrentUrl: () => string;
  readonly renderConversationFiles: (
    conversation: ConversationExport,
    options?: Partial<ExportOptions>
  ) => readonly RenderedFile<RenderedBytes>[];
  readonly scanCurrentConversationExport: (options?: {
    readonly signal?: AbortSignal;
  }) => Promise<ConversationExport>;
}

export function createContentRequestHandler(
  dependencies: ContentRequestHandlerDependencies
): (request: ContentRequest) => Promise<ContentRequestResult> {
  let activeScanController: AbortController | undefined;
  let cachedConversation: ConversationExport | undefined;
  let cachedSourceUrl: string | undefined;
  let selectionOverlay: SelectionOverlayController | undefined;
  let activeSelection: MessageSelection = { fingerprints: [], ids: [] };

  function cleanupSelectionOverlay(): void {
    activeSelection = { fingerprints: [], ids: [] };
    selectionOverlay?.cleanup();
    selectionOverlay = undefined;
  }

  function applyActiveSelection(conversation: ConversationExport): ConversationExport {
    activeSelection = selectionOverlay?.getSelection() ?? activeSelection;

    return {
      ...conversation,
      messages: applyMessageSelection(conversation.messages, activeSelection)
    };
  }

  async function handleContentScanRequest(): Promise<ScanSummary> {
    activeScanController?.abort();
    activeScanController = new AbortController();

    try {
      const conversation = await dependencies.scanCurrentConversationExport({
        signal: activeScanController.signal
      });

      cachedConversation = conversation;
      cachedSourceUrl = conversation.sourceUrl;

      return summarizeConversation(applyActiveSelection(conversation));
    } finally {
      activeScanController = undefined;
    }
  }

  async function handleContentExportRequest(
    request: ContentExportRequest
  ): Promise<ContentExportSuccess> {
    if (cachedConversation === undefined || cachedSourceUrl === undefined) {
      throw new ExportPipelineError("scan_required", "Scan the conversation before exporting.");
    }

    if (cachedSourceUrl !== dependencies.getCurrentUrl()) {
      throw new ExportPipelineError(
        "scan_stale",
        "The conversation changed. Rescan before exporting."
      );
    }

    const selectedConversation = applySelectionScope(
      applyActiveSelection(cachedConversation),
      request.options
    );
    const files = dependencies.renderConversationFiles(selectedConversation, request.options);
    let clipboardError: SerializedExportError | undefined;

    if (request.copyToClipboard ?? true) {
      try {
        await dependencies.copyRenderedFileToClipboard(files);
      } catch (error) {
        clipboardError = serializeExportError(error);
      }
    }

    const downloaded =
      request.delivery === "anchor" && request.download !== false
        ? (await dependencies.downloadRenderedFiles(files)).downloaded
        : [];
    cleanupSelectionOverlay();

    return {
      ...(clipboardError !== undefined ? { clipboardError } : {}),
      downloaded,
      ...(request.delivery === "return_files" ? { files } : {}),
      messageCount: selectedConversation.messageCount,
      warnings: [
        ...cachedConversation.completeness.warnings,
        ...cachedConversation.completeness.platformWarnings,
        ...(clipboardError !== undefined ? [clipboardError.message] : [])
      ]
    };
  }

  return async function handleContentRequest(request: ContentRequest): Promise<ContentRequestResult> {
    if (request.type === CONTENT_SCAN_MESSAGE) {
      return handleContentScanRequest();
    }

    if (request.type === CONTENT_CANCEL_SCAN_MESSAGE) {
      activeScanController?.abort();
      return { cancelled: true };
    }

    if (request.type === CONTENT_START_SELECTION_MESSAGE) {
      selectionOverlay = dependencies.createSelectionOverlay();
      selectionOverlay.show();
      return { cancelled: false };
    }

    if (request.type === CONTENT_CLEAR_SELECTION_MESSAGE) {
      cleanupSelectionOverlay();
      return { cancelled: true };
    }

    return handleContentExportRequest(request);
  };
}

function applySelectionScope(
  conversation: ConversationExport,
  options: Partial<ExportOptions>
): ConversationExport {
  if (options.scope !== "selected") {
    return conversation;
  }

  const messages = filterMessagesByScope(conversation.messages, { scope: "selected" });

  return {
    ...conversation,
    messageCount: messages.length,
    messages
  };
}

export function summarizeConversation(conversation: ConversationExport): ScanSummary {
  return {
    completeness: conversation.completeness,
    messageCount: conversation.messageCount,
    platformLabel: conversation.platformLabel,
    previewMessages: conversation.messages.slice(0, MAX_PREVIEW_MESSAGES).map(toPreviewMessage),
    sourceUrl: conversation.sourceUrl,
    ...(conversation.title !== undefined ? { title: conversation.title } : {})
  };
}

export function isContentRequest(message: unknown): message is ContentRequest {
  if (!isRecord(message)) {
    return false;
  }

  if (
    message.type === CONTENT_SCAN_MESSAGE ||
    message.type === CONTENT_CANCEL_SCAN_MESSAGE ||
    message.type === CONTENT_START_SELECTION_MESSAGE ||
    message.type === CONTENT_CLEAR_SELECTION_MESSAGE
  ) {
    return true;
  }

  return (
    message.type === CONTENT_EXPORT_MESSAGE &&
    (message.delivery === "anchor" || message.delivery === "return_files") &&
    isRecord(message.options)
  );
}

function toPreviewMessage(message: ExportedMessage): PreviewMessage {
  return {
    authorLabel: message.authorLabel,
    index: message.index,
    role: message.role,
    text: message.text,
    ...(message.metadata.selected === true ? { selected: true } : {})
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
