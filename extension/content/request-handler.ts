import {
  CONTENT_CANCEL_SCAN_MESSAGE,
  CONTENT_GET_CACHED_CONVERSATION_MESSAGE,
  CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE,
  CONTENT_SCAN_MESSAGE,
  type ContentCancelScanRequest,
  type ContentGetCachedConversationRequest,
  type ContentGetScanCacheSummaryRequest,
  type ContentScanRequest,
  type CachedConversationResult,
  type ScanCacheSummaryResult,
  type ScanSummary
} from "../../src/core/messages";
import type { ConversationExport } from "../../src/core/schema";

export type ContentRequest =
  | ContentScanRequest
  | ContentCancelScanRequest
  | ContentGetCachedConversationRequest
  | ContentGetScanCacheSummaryRequest;

export type ContentRequestResult =
  | ScanSummary
  | ScanCacheSummaryResult
  | CachedConversationResult
  | { readonly cancelled: boolean };

export interface ContentRequestHandlerDependencies {
  readonly getCurrentUrl: () => string;
  readonly observeConversationChanges?: (
    onChange: () => void,
    baselineMessages: ConversationExport["messages"]
  ) => () => void;
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
    const scanController = new AbortController();
    activeScanController = scanController;

    try {
      const conversation = await dependencies.scanCurrentConversationExport({
        signal: scanController.signal
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
      if (activeScanController === scanController) {
        activeScanController = undefined;
      }
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

    return handleGetCachedConversationRequest(request);
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

  return (
    message.type === CONTENT_SCAN_MESSAGE ||
    message.type === CONTENT_CANCEL_SCAN_MESSAGE ||
    message.type === CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE ||
    message.type === CONTENT_GET_CACHED_CONVERSATION_MESSAGE
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
