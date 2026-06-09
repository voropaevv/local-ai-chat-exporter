import {
  ExportPipelineError,
  getExportedMessageCount,
  serializeExportError,
  type ExportOptions,
  type SerializedExportError
} from "../../src/core/export-options";
import {
  CONTENT_CANCEL_SCAN_MESSAGE,
  CONTENT_CLEAR_SELECTION_MESSAGE,
  CONTENT_EXPORT_MESSAGE,
  CONTENT_GET_CACHED_CONVERSATION_MESSAGE,
  CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE,
  CONTENT_SCAN_MESSAGE,
  CONTENT_START_SELECTION_MESSAGE,
  type ContentCancelScanRequest,
  type ContentClearSelectionRequest,
  type ContentExportRequest,
  type ContentExportSuccess,
  type ContentGetCachedConversationRequest,
  type ContentGetScanCacheSummaryRequest,
  type ContentScanRequest,
  type ContentStartSelectionRequest,
  type CachedConversationResult,
  type PreviewMessage,
  type ScanCacheSummaryResult,
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
  | ContentGetCachedConversationRequest
  | ContentGetScanCacheSummaryRequest
  | ContentStartSelectionRequest
  | ContentClearSelectionRequest;

export type ContentRequestResult =
  | ScanSummary
  | ScanCacheSummaryResult
  | CachedConversationResult
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
  let cachedScanId: string | undefined;
  let scanSequence = 0;
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

  function getValidCachedConversation(): CachedConversationState {
    if (
      cachedConversation === undefined ||
      cachedSourceUrl === undefined ||
      cachedScanId === undefined
    ) {
      return { reason: "missing", status: "missing" };
    }

    if (cachedSourceUrl !== dependencies.getCurrentUrl()) {
      return { reason: "stale", status: "missing" };
    }

    return {
      conversation: cachedConversation,
      scanId: cachedScanId,
      status: "ready"
    };
  }

  async function handleContentScanRequest(): Promise<ScanSummary> {
    activeScanController?.abort();
    activeScanController = new AbortController();

    try {
      const conversation = await dependencies.scanCurrentConversationExport({
        signal: activeScanController.signal
      });
      const scanId = createScanId(scanSequence);

      cachedConversation = conversation;
      cachedSourceUrl = conversation.sourceUrl;
      cachedScanId = scanId;
      scanSequence += 1;

      return summarizeConversation(applyActiveSelection(conversation), scanId);
    } finally {
      activeScanController = undefined;
    }
  }

  function handleGetScanCacheSummaryRequest(): ScanCacheSummaryResult {
    const cached = getValidCachedConversation();

    if (cached.status !== "ready") {
      return cached.reason === "stale"
        ? { hasCache: false, reason: "stale" }
        : { hasCache: false };
    }

    return {
      hasCache: true,
      scan: summarizeConversation(applyActiveSelection(cached.conversation), cached.scanId),
      scanId: cached.scanId
    };
  }

  function handleGetCachedConversationRequest(
    request: ContentGetCachedConversationRequest
  ): CachedConversationResult {
    const cached = getValidCachedConversation();

    if (cached.status !== "ready") {
      return cached.reason === "stale"
        ? { hasConversation: false, reason: "stale" }
        : { hasConversation: false };
    }

    if (request.scanId !== undefined && request.scanId !== cached.scanId) {
      return { hasConversation: false };
    }

    return {
      conversation: cached.conversation,
      hasConversation: true,
      scanId: cached.scanId
    };
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

    const selectedConversation = applyActiveSelection(cachedConversation);
    const exportedMessageCount = getExportedMessageCount(selectedConversation, request.options);

    if (request.options.scope === "selected" && exportedMessageCount === 0) {
      throw new ExportPipelineError(
        "no_messages_found",
        "No selected messages. Select messages again."
      );
    }

    const files = dependencies.renderConversationFiles(
      applySelectionScope(selectedConversation, request.options),
      request.options
    );
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
      exportedMessageCount,
      ...(request.delivery === "return_files" ? { files } : {}),
      messageCount: exportedMessageCount,
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

    if (request.type === CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE) {
      return handleGetScanCacheSummaryRequest();
    }

    if (request.type === CONTENT_GET_CACHED_CONVERSATION_MESSAGE) {
      return handleGetCachedConversationRequest(request);
    }

    return handleContentExportRequest(request);
  };
}

function createScanId(sequence: number): string {
  return `scan-${Date.now().toString(36)}-${sequence.toString(36)}`;
}

type CachedConversationState =
  | {
      readonly conversation: ConversationExport;
      readonly scanId: string;
      readonly status: "ready";
    }
  | {
      readonly reason: "missing" | "stale";
      readonly status: "missing";
    };

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

export function summarizeConversation(
  conversation: ConversationExport,
  scanId?: string
): ScanSummary {
  return {
    completeness: conversation.completeness,
    messageCount: conversation.messageCount,
    platformLabel: conversation.platformLabel,
    previewMessages: conversation.messages.slice(0, MAX_PREVIEW_MESSAGES).map(toPreviewMessage),
    ...(scanId !== undefined ? { scanId } : {}),
    selectedMessageCount: countSelectedMessages(conversation.messages),
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
    message.type === CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE ||
    message.type === CONTENT_GET_CACHED_CONVERSATION_MESSAGE ||
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

function countSelectedMessages(messages: readonly ExportedMessage[]): number {
  return messages.filter((message) => message.metadata.selected === true).length;
}
