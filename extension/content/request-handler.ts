import {
  ExportPipelineError,
  getExportedMessageCount,
  serializeExportError,
  type ExportOptions,
  type SerializedExportError
} from "../../src/core/export-options";
import {
  CONTENT_CANCEL_SCAN_MESSAGE,
  CONTENT_EXPORT_MESSAGE,
  CONTENT_GET_CACHED_CONVERSATION_MESSAGE,
  CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE,
  CONTENT_SCAN_MESSAGE,
  type ContentCancelScanRequest,
  type ContentExportRequest,
  type ContentExportSuccess,
  type ContentGetCachedConversationRequest,
  type ContentGetScanCacheSummaryRequest,
  type ContentScanRequest,
  type CachedConversationResult,
  type ScanCacheSummaryResult,
  type ScanSummary
} from "../../src/core/messages";
import type { ConversationExport } from "../../src/core/schema";
import type { RenderedBytes, RenderedFile } from "../../src/renderers";
import type { DownloadResult } from "../../src/utils/download";

export type ContentRequest =
  | ContentScanRequest
  | ContentCancelScanRequest
  | ContentExportRequest
  | ContentGetCachedConversationRequest
  | ContentGetScanCacheSummaryRequest;

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
  readonly downloadRenderedFiles: (
    files: readonly RenderedFile<RenderedBytes>[]
  ) => Promise<DownloadResult>;
  readonly getCurrentUrl: () => string;
  readonly observeConversationChanges?: (
    onChange: () => void,
    baselineMessages: ConversationExport["messages"]
  ) => () => void;
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
  let cachedConversationDirty = false;
  let stopObservingConversationChanges: (() => void) | undefined;
  let scanSequence = 0;
  function getValidCachedConversation(): CachedConversationState {
    if (
      cachedConversation === undefined ||
      cachedSourceUrl === undefined ||
      cachedScanId === undefined
    ) {
      return { reason: "missing", status: "missing" };
    }

    if (cachedConversationDirty || cachedSourceUrl !== dependencies.getCurrentUrl()) {
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
    stopObservingConversationChanges?.();
    stopObservingConversationChanges = undefined;
    cachedConversationDirty = true;
    activeScanController = new AbortController();

    try {
      const conversation = await dependencies.scanCurrentConversationExport({
        signal: activeScanController.signal
      });
      const scanId = createScanId(scanSequence);

      cachedConversation = conversation;
      cachedSourceUrl = conversation.sourceUrl;
      cachedScanId = scanId;
      cachedConversationDirty = false;
      scanSequence += 1;
      stopObservingConversationChanges = dependencies.observeConversationChanges?.(() => {
        cachedConversationDirty = true;
      }, conversation.messages);

      return summarizeConversation(conversation, scanId);
    } finally {
      activeScanController = undefined;
    }
  }

  function handleGetScanCacheSummaryRequest(): ScanCacheSummaryResult {
    const cached = getValidCachedConversation();

    if (cached.status !== "ready") {
      return cached.reason === "stale" ? { hasCache: false, reason: "stale" } : { hasCache: false };
    }

    return {
      hasCache: true,
      scan: summarizeConversation(cached.conversation, cached.scanId),
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
    const cached = getValidCachedConversation();

    if (cached.status !== "ready") {
      if (cached.reason === "stale") {
        throw new ExportPipelineError(
          "scan_stale",
          "The conversation changed. Refresh it before exporting."
        );
      }

      throw new ExportPipelineError("scan_required", "Prepare the conversation before exporting.");
    }

    const exportedMessageCount = getExportedMessageCount(cached.conversation, request.options);

    const files = dependencies.renderConversationFiles(cached.conversation, request.options);
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
    return {
      ...(clipboardError !== undefined ? { clipboardError } : {}),
      downloaded,
      exportedMessageCount,
      ...(request.delivery === "return_files" ? { files } : {}),
      messageCount: exportedMessageCount,
      warnings: [
        ...cached.conversation.completeness.warnings,
        ...cached.conversation.completeness.platformWarnings,
        ...(clipboardError !== undefined ? [clipboardError.message] : [])
      ]
    };
  }

  return async function handleContentRequest(
    request: ContentRequest
  ): Promise<ContentRequestResult> {
    if (request.type === CONTENT_SCAN_MESSAGE) {
      return handleContentScanRequest();
    }

    if (request.type === CONTENT_CANCEL_SCAN_MESSAGE) {
      activeScanController?.abort();
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

export function summarizeConversation(
  conversation: ConversationExport,
  scanId?: string
): ScanSummary {
  return {
    completeness: conversation.completeness,
    messageCount: conversation.messageCount,
    platformLabel: conversation.platformLabel,
    ...(scanId !== undefined ? { scanId } : {}),
    sourceUrl: conversation.sourceUrl
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
    message.type === CONTENT_GET_CACHED_CONVERSATION_MESSAGE
  ) {
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
