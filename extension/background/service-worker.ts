import {
  DEFAULT_EXPORT_OPTIONS,
  getExportedMessageCount,
  renderConversationFiles
} from "../../src/core/export-options";
import { ExportPipelineError, serializeExportError } from "../../src/core/export-errors";
import { createDiagnosticReport, type DiagnosticReport } from "../../src/core/diagnostics";
import {
  POPUP_BATCH_EXPORT_MESSAGE,
  POPUP_BATCH_LIST_MESSAGE,
  CONTENT_CANCEL_SCAN_MESSAGE,
  CONTENT_GET_CACHED_CONVERSATION_MESSAGE,
  CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE,
  CONTENT_SCAN_MESSAGE,
  POPUP_GET_ACTIVE_TAB_INFO_MESSAGE,
  POPUP_GET_SCAN_CACHE_SUMMARY_MESSAGE,
  POPUP_OPEN_PREVIEW_MESSAGE,
  POPUP_CANCEL_SCAN_MESSAGE,
  POPUP_EXPORT_MESSAGE,
  POPUP_SCAN_MESSAGE,
  SETTINGS_GET_DIAGNOSTICS_MESSAGE,
  PREVIEW_GET_CACHED_CONVERSATION_MESSAGE,
  PREVIEW_RETURN_TO_SOURCE_MESSAGE,
  type ActiveTabInfoResult,
  type CachedConversationResult,
  type ContentGetCachedConversationRequest,
  type ContentGetScanCacheSummaryRequest,
  type ContentScanRequest,
  type BatchExportSuccess,
  type BatchListSuccess,
  type PopupBatchExportRequest,
  type PopupBatchListRequest,
  type PopupCancelScanRequest,
  type PopupExportRequest,
  type PopupExportSuccess,
  type PopupGetActiveTabInfoRequest,
  type PopupGetScanCacheSummaryRequest,
  type PopupOpenPreviewRequest,
  type PopupScanRequest,
  type PreviewGetCachedConversationRequest,
  type PreviewReturnToSourceRequest,
  type PreviewOpenSuccess,
  type RuntimeResponse,
  type ScanCacheSummaryResult,
  type ScanSummary,
  type SettingsGetDiagnosticsRequest
} from "../../src/core/messages";
import { getSupportedChatPageInfo } from "../../src/core/batch";
import { serializeRenderedFile } from "../../src/core/rendered-file-transport";
import { buildPreviewPageUrl } from "../../src/ui/preview-url";
import { ensureContentScript } from "../../src/utils/content-script";
import { handlePopupBatchExportRequest, handlePopupBatchListRequest } from "./batch";
import {
  readDiagnosticContext,
  readDiagnosticErrors,
  recordDiagnosticError,
  rememberDiagnosticContext
} from "./diagnostic-session";

chrome.runtime.onInstalled.addListener(() => {
  // Reserved for local-only extension setup in later tasks.
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isPopupRequest(message)) {
    return false;
  }

  const operation = getRequestOperation(message);

  handlePopupRequest(message)
    .then((value) => sendResponse({ ok: true, value }))
    .catch(async (error: unknown) => {
      const serializedError = serializeExportError(error);

      await recordDiagnosticError({
        code: serializedError.code,
        operation
      }).catch(() => undefined);
      sendResponse({ ok: false, error: serializedError });
    });

  return true;
});

async function handlePopupRequest(
  request:
    | PopupScanRequest
    | PopupCancelScanRequest
    | PopupExportRequest
    | PopupBatchListRequest
    | PopupBatchExportRequest
    | PopupGetActiveTabInfoRequest
    | PopupGetScanCacheSummaryRequest
    | PopupOpenPreviewRequest
    | PreviewGetCachedConversationRequest
    | PreviewReturnToSourceRequest
    | SettingsGetDiagnosticsRequest
): Promise<
  | ScanSummary
  | ActiveTabInfoResult
  | ScanCacheSummaryResult
  | PopupExportSuccess
  | BatchListSuccess
  | BatchExportSuccess
  | CachedConversationResult
  | DiagnosticReport
  | PreviewOpenSuccess
  | { readonly cancelled: true }
> {
  if (request.type === POPUP_SCAN_MESSAGE) {
    return handlePopupScanRequest(request);
  }

  if (request.type === POPUP_CANCEL_SCAN_MESSAGE) {
    return handlePopupCancelScanRequest(request);
  }

  if (request.type === POPUP_GET_ACTIVE_TAB_INFO_MESSAGE) {
    return handlePopupGetActiveTabInfoRequest(request);
  }

  if (request.type === POPUP_GET_SCAN_CACHE_SUMMARY_MESSAGE) {
    return handlePopupGetScanCacheSummaryRequest(request);
  }

  if (request.type === POPUP_OPEN_PREVIEW_MESSAGE) {
    return handlePopupOpenPreviewRequest(request);
  }

  if (request.type === PREVIEW_GET_CACHED_CONVERSATION_MESSAGE) {
    return handlePreviewGetCachedConversationRequest(request);
  }

  if (request.type === PREVIEW_RETURN_TO_SOURCE_MESSAGE) {
    await chrome.tabs.update(request.sourceTabId, { active: true });
    return { cancelled: true };
  }

  if (request.type === POPUP_BATCH_LIST_MESSAGE) {
    return handlePopupBatchListRequest();
  }

  if (request.type === POPUP_BATCH_EXPORT_MESSAGE) {
    return handlePopupBatchExportRequest(request);
  }

  if (request.type === SETTINGS_GET_DIAGNOSTICS_MESSAGE) {
    return handleSettingsGetDiagnosticsRequest();
  }

  return handlePopupExportRequest(request);
}

async function handlePopupGetActiveTabInfoRequest(
  request: PopupGetActiveTabInfoRequest
): Promise<ActiveTabInfoResult> {
  const tab = await getActiveTab(request.sourceTabId);
  const sourceUrl = typeof tab.url === "string" && tab.url.length > 0 ? tab.url : undefined;
  const supportedPage = sourceUrl === undefined ? undefined : getSupportedChatPageInfo(sourceUrl);

  await rememberDiagnosticContext(
    supportedPage !== undefined && tab.id !== undefined
      ? {
          provider: { id: supportedPage.platform, label: supportedPage.label },
          tabId: tab.id
        }
      : undefined
  ).catch(() => undefined);

  return {
    ...(supportedPage !== undefined ? { platformLabel: supportedPage.label } : {}),
    ...(tab.id !== undefined ? { sourceTabId: tab.id } : {}),
    ...(sourceUrl !== undefined ? { sourceUrl } : {}),
    supported: supportedPage !== undefined
  };
}

async function handleSettingsGetDiagnosticsRequest(): Promise<DiagnosticReport> {
  const [context, recentErrors] = await Promise.all([
    readDiagnosticContext().catch(() => undefined),
    readDiagnosticErrors().catch(() => [])
  ]);
  let scan: Parameters<typeof createDiagnosticReport>[0]["scan"] = { status: "missing" };

  if (context !== undefined) {
    try {
      await ensureContentScript(context.tabId);
      const response = await sendContentMessage<ScanCacheSummaryResult>(context.tabId, {
        type: CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE
      } satisfies ContentGetScanCacheSummaryRequest);

      if (response.ok) {
        scan = response.value.hasCache
          ? {
              completeness: response.value.scan.completeness,
              messageCount: response.value.scan.messageCount,
              status: "ready"
            }
          : { status: response.value.reason === "stale" ? "stale" : "missing" };
      }
    } catch {
      scan = { status: "missing" };
    }
  }

  return createDiagnosticReport({
    extensionVersion: chrome.runtime.getManifest().version,
    ...(context !== undefined ? { provider: context.provider } : {}),
    recentErrors,
    scan
  });
}

async function handlePopupScanRequest(request: PopupScanRequest): Promise<ScanSummary> {
  const tab = await getActiveTab(request.sourceTabId);
  const tabId = requireTabId(tab);

  await ensureContentScript(tabId);

  const response = await sendContentMessage<ScanSummary>(tabId, {
    type: CONTENT_SCAN_MESSAGE
  } satisfies ContentScanRequest);

  if (!response.ok) {
    throw new ExportPipelineError(response.error.code, response.error.message);
  }

  return response.value;
}

async function handlePopupGetScanCacheSummaryRequest(
  request: PopupGetScanCacheSummaryRequest
): Promise<ScanCacheSummaryResult> {
  try {
    const tab = await getActiveTab(request.sourceTabId);
    const tabId = requireTabId(tab);

    await ensureContentScript(tabId);

    const response = await sendContentMessage<ScanCacheSummaryResult>(tabId, {
      type: CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE
    } satisfies ContentGetScanCacheSummaryRequest);

    if (!response.ok) {
      return { hasCache: false };
    }

    return response.value;
  } catch {
    return { hasCache: false };
  }
}

async function handlePopupOpenPreviewRequest(
  request: PopupOpenPreviewRequest
): Promise<PreviewOpenSuccess> {
  const tab = await getActiveTab(request.sourceTabId);
  const tabId = requireTabId(tab);

  await ensureContentScript(tabId);

  const response = await sendContentMessage<ScanCacheSummaryResult>(tabId, {
    type: CONTENT_GET_SCAN_CACHE_SUMMARY_MESSAGE
  } satisfies ContentGetScanCacheSummaryRequest);

  if (!response.ok) {
    throw new ExportPipelineError("scan_required", "Prepare the conversation before exporting.");
  }

  const cacheSummary = response.value;

  if (!cacheSummary.hasCache) {
    throw new ExportPipelineError(
      cacheSummary.reason === "stale" ? "scan_stale" : "scan_required",
      cacheSummary.reason === "stale"
        ? "The conversation changed. Refresh it before previewing."
        : "Prepare the conversation before previewing."
    );
  }

  const url = buildPreviewPageUrl({
    formats: request.formats,
    getURL: (path) => chrome.runtime.getURL(path),
    scanId: cacheSummary.scanId,
    sourceTabId: tabId,
    ...(request.zipFormats !== undefined ? { zipFormats: request.zipFormats } : {})
  });

  await chrome.tabs.create({ active: true, url });

  return { sourceTabId: tabId, url };
}

async function handlePreviewGetCachedConversationRequest(
  request: PreviewGetCachedConversationRequest
): Promise<CachedConversationResult> {
  try {
    await ensureContentScript(request.sourceTabId);

    const response = await sendContentMessage<CachedConversationResult>(request.sourceTabId, {
      ...(request.scanId !== undefined ? { scanId: request.scanId } : {}),
      type: CONTENT_GET_CACHED_CONVERSATION_MESSAGE
    } satisfies ContentGetCachedConversationRequest);

    return response.ok ? response.value : { hasConversation: false };
  } catch {
    return { hasConversation: false };
  }
}

async function handlePopupCancelScanRequest(
  request: PopupCancelScanRequest
): Promise<{ readonly cancelled: true }> {
  const tab = await getActiveTab(request.sourceTabId);
  const tabId = requireTabId(tab);

  await sendContentMessage<{ readonly cancelled: true }>(tabId, {
    type: CONTENT_CANCEL_SCAN_MESSAGE
  });

  return { cancelled: true };
}

async function handlePopupExportRequest(request: PopupExportRequest): Promise<PopupExportSuccess> {
  const tab = await getActiveTab(request.sourceTabId);
  const tabId = requireTabId(tab);

  await ensureContentScript(tabId);

  const contentResponse = await sendContentMessage<CachedConversationResult>(tabId, {
    type: CONTENT_GET_CACHED_CONVERSATION_MESSAGE
  } satisfies ContentGetCachedConversationRequest);

  if (!contentResponse.ok) {
    throw new ExportPipelineError(contentResponse.error.code, contentResponse.error.message);
  }

  if (!contentResponse.value.hasConversation) {
    throw new ExportPipelineError(
      contentResponse.value.reason === "stale" ? "scan_stale" : "scan_required",
      contentResponse.value.reason === "stale"
        ? "The conversation changed. Refresh it before exporting."
        : "Prepare the conversation before exporting."
    );
  }

  const options = request.options ?? DEFAULT_EXPORT_OPTIONS;
  const conversation = contentResponse.value.conversation;
  const exportedMessageCount = getExportedMessageCount(conversation, options);
  const files = renderConversationFiles(conversation, options).map(serializeRenderedFile);

  return {
    downloaded: [],
    exportedMessageCount,
    files,
    messageCount: exportedMessageCount,
    warnings: [...conversation.completeness.warnings, ...conversation.completeness.platformWarnings]
  };
}

async function getActiveTab(sourceTabId?: number): Promise<chrome.tabs.Tab> {
  if (sourceTabId !== undefined) {
    try {
      return await chrome.tabs.get(sourceTabId);
    } catch (error) {
      throw new ExportPipelineError(
        "unsupported_platform",
        "The source tab is no longer available.",
        error
      );
    }
  }

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];

  if (activeTab === undefined) {
    throw new ExportPipelineError("unsupported_platform", "No active tab is available to export.");
  }

  return activeTab;
}

function requireTabId(tab: chrome.tabs.Tab): number {
  if (tab.id === undefined) {
    throw new ExportPipelineError("unsupported_platform", "No active tab is available to export.");
  }

  return tab.id;
}

async function sendContentMessage<T>(
  tabId: number,
  request:
    | ContentScanRequest
    | ContentGetCachedConversationRequest
    | ContentGetScanCacheSummaryRequest
    | { readonly type: typeof CONTENT_CANCEL_SCAN_MESSAGE }
): Promise<RuntimeResponse<T>> {
  try {
    return await chrome.tabs.sendMessage(tabId, request);
  } catch (error) {
    throw new ExportPipelineError(
      "unsupported_platform",
      "This page cannot be exported by the extension.",
      error
    );
  }
}

function isPopupRequest(
  message: unknown
): message is
  | PopupScanRequest
  | PopupCancelScanRequest
  | PopupExportRequest
  | PopupBatchListRequest
  | PopupBatchExportRequest
  | PopupGetActiveTabInfoRequest
  | PopupGetScanCacheSummaryRequest
  | PopupOpenPreviewRequest
  | PreviewGetCachedConversationRequest
  | PreviewReturnToSourceRequest
  | SettingsGetDiagnosticsRequest {
  return (
    isRecord(message) &&
    (message.type === POPUP_SCAN_MESSAGE ||
      message.type === POPUP_CANCEL_SCAN_MESSAGE ||
      message.type === POPUP_EXPORT_MESSAGE ||
      message.type === POPUP_GET_ACTIVE_TAB_INFO_MESSAGE ||
      message.type === POPUP_GET_SCAN_CACHE_SUMMARY_MESSAGE ||
      message.type === POPUP_OPEN_PREVIEW_MESSAGE ||
      message.type === PREVIEW_GET_CACHED_CONVERSATION_MESSAGE ||
      message.type === PREVIEW_RETURN_TO_SOURCE_MESSAGE ||
      message.type === POPUP_BATCH_LIST_MESSAGE ||
      message.type === POPUP_BATCH_EXPORT_MESSAGE ||
      message.type === SETTINGS_GET_DIAGNOSTICS_MESSAGE)
  );
}

function getRequestOperation(message: unknown): string {
  return isRecord(message) && typeof message.type === "string" ? message.type : "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export {};
